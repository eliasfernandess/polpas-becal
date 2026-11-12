import { afterEach, describe, expect, it } from "vitest";
import { productById, seedProducts, toProduct } from "@/data/products";
import { maxQuantityFor, sanitizeCart, updateCart } from "@/lib/cart";
import { fromRow, parsePrice, parseProducts, productSchema, setCatalog, slugify, toData, toRow } from "@/lib/catalog";

const base = toData(seedProducts[0]);
afterEach(() => setCatalog(seedProducts));

describe("catálogo", () => {
  it("deriva disponibilidade de estoque e visibilidade", () => {
    expect(toProduct({ ...base, stock: 3, active: true }).available).toBe(true);
    expect(toProduct({ ...base, stock: 0, active: true }).available).toBe(false);
    expect(toProduct({ ...base, stock: 3, active: false }).available).toBe(false);
  });
  it("gera identificadores sem acentos, espaços ou símbolos", () => {
    expect(slugify("Abacaxi com Hortelã")).toBe("abacaxi-com-hortela");
    expect(slugify("  Açaí & Guaraná!  ")).toBe("acai-guarana");
    expect(slugify("???")).toBe("");
  });
  it.each([["4,90", 490], ["4.9", 490], ["R$ 1.234,50", 123450], ["12", 1200], ["0,05", 5]])("interpreta o preço %s", (text, cents) => expect(parsePrice(text)).toBe(cents));
  it.each(["", "abc", ","])("recusa preço inválido %j", text => expect(productSchema.safeParse({ ...base, priceInCents: parsePrice(text) }).success).toBe(false));
  it.each([
    { stock: -1 }, { stock: 1.5 }, { stock: 100001 }, { priceInCents: -1 }, { name: "x" }, { id: "Com Espaço" }, { tone: "neon" },
    { image: "javascript:alert(1)" }, { image: "http://inseguro.test/a.png" }, { image: "data:text/html;base64,PHNjcmlwdD4=" },
  ])("recusa produto inválido %j", change => expect(productSchema.safeParse({ ...base, ...change }).success).toBe(false));
  it.each(["", "/images/products/manga.webp", "https://exemplo.supabase.co/storage/v1/object/public/product-images/a.webp", "/images/products/manga.png", "data:image/webp;base64,UklGRg=="])("aceita imagem %j", image => expect(productSchema.safeParse({ ...base, image }).success).toBe(true));
  it("ignora registros inválidos, duplicados e campos desconhecidos ao carregar", () => {
    const list = parseProducts([base, base, { ...base, id: "outro", sort: 5 }, { ...base, id: "ruim", stock: -3 }, { ...base, id: "extra", admin: true }, null, "x"]);
    expect(list.map(p => p.id)).toEqual([base.id, "outro"]);
    expect(parseProducts("nada")).toEqual([]);
  });
});

describe("colunas do banco", () => {
  const row = { id: "manga", name: "Manga", description: "Polpa", image: "/images/products/manga.webp", price_in_cents: 725, unit_label: "100 g", category: "Clássicos", tone: "peach", stock: 12, low_stock: 5, available: true, featured: true, sort_order: 2, bulk_min: 0, bulk_price_in_cents: 0 };
  it("mapeia os campos do banco sem perder o preço em centavos", () => {
    expect(parseProducts([fromRow(row)])[0]).toMatchObject({ id: "manga", priceInCents: 725, unitLabel: "100 g", stock: 12, lowStock: 5, active: true, available: true, sort: 2 });
  });
  it("visibilidade do banco vira `active`; disponível exige estoque", () => {
    expect(parseProducts([fromRow({ ...row, available: false })])[0]).toMatchObject({ active: false, available: false });
    expect(parseProducts([fromRow({ ...row, stock: 0 })])[0]).toMatchObject({ active: true, available: false });
  });
  it("ida e volta preserva os dados gravados", () => expect(toRow(parseProducts([fromRow(row)])[0])).toEqual(row));
  it.each([{ price_in_cents: -1 }, { price_in_cents: 2.5 }, { image: "https://unknown.test/image.jpg" }, { image: "https://abc.supabase.co/storage/v1/object/public/outro-bucket/a.webp" }, { tone: "arbitrary-class" }])("recusa catálogo inválido %j", override => {
    expect(parseProducts([fromRow({ ...row, ...override })])).toEqual([]);
  });
  it("aceita foto enviada ao bucket do painel", () => {
    expect(parseProducts([fromRow({ ...row, image: "https://abcd.supabase.co/storage/v1/object/public/product-images/manga-1.webp" })])).toHaveLength(1);
  });
});

describe("carrinho e estoque", () => {
  it("limita a quantidade ao estoque disponível", () => {
    setCatalog([toProduct({ ...base, stock: 5 })]);
    expect(maxQuantityFor(base.id)).toBe(5);
    expect(updateCart([], { type: "add", id: base.id, quantity: 9 })).toEqual([{ id: base.id, quantity: 5 }]);
    expect(updateCart([{ id: base.id, quantity: 4 }], { type: "add", id: base.id, quantity: 4 })).toEqual([{ id: base.id, quantity: 5 }]);
  });
  it("revalida o carrinho quando o catálogo muda", () => {
    const cart = [{ id: base.id, quantity: 8 }, { id: "manga", quantity: 2 }];
    setCatalog([toProduct({ ...base, stock: 3 })]);
    expect(updateCart(cart, { type: "revalidate" })).toEqual([{ id: base.id, quantity: 3 }]);
    setCatalog([toProduct({ ...base, stock: 0 })]);
    expect(sanitizeCart(cart)).toEqual([]);
    setCatalog([toProduct({ ...base, active: false })]);
    expect(sanitizeCart(cart)).toEqual([]);
  });
  it("substitui o índice de produtos e preserva o atual quando recebe null", () => {
    setCatalog([toProduct({ ...base, id: "novo" })]);
    expect([...productById.keys()]).toEqual(["novo"]);
    setCatalog(null);
    expect([...productById.keys()]).toEqual(["novo"]);
  });
});
