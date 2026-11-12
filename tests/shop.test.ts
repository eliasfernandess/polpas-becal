import { afterEach, describe, expect, it } from "vitest";
import { seedProducts, toKit, toProduct } from "@/data/products";
import { cartTotal, maxQuantityFor, roomFor, sanitizeCart, unitPrice, updateCart } from "@/lib/cart";
import { findZone, kitSchema, parseKits, parseSettings, parseZones, productSchema, setCatalog, toData } from "@/lib/catalog";
import { checkoutSchema } from "@/lib/validation";
import { orderMessage } from "@/lib/whatsapp";
import type { KitData } from "@/types/product";

const product = (id: string, stock: number, extra = {}) => toProduct({ ...toData(seedProducts.find(p => p.id === id)!), stock, ...extra });
/** O formato de moeda usa espaço não separável; os testes comparam com espaço comum. */
const plain = (text: string) => text.replace(/[^\S\n]/g, " ");
const kitData: KitData = { id: "duo", name: "Duo", description: "", image: "", priceInCents: 800, items: [{ id: "morango", quantity: 1 }, { id: "limao", quantity: 2 }], active: true, featured: false, sort: 0 };
const customer = checkoutSchema.parse({ name: "Ana", phone: "34999990000", fulfillment: "entrega", postalCode: "38400000", street: "Rua A", number: "1", complement: "", district: "Centro", city: "Uberlândia" });

afterEach(() => setCatalog(seedProducts, { kits: [], zones: [], settings: parseSettings(null) }));

describe("preço por quantidade", () => {
  const bulk = { bulkMin: 10, bulkPriceInCents: 400 };
  it("vale a partir da quantidade mínima", () => {
    setCatalog([product("morango", 50, bulk)]);
    expect(unitPrice("morango", 9)).toBe(490);
    expect(unitPrice("morango", 10)).toBe(400);
    expect(cartTotal([{ id: "morango", quantity: 10 }])).toBe(4000);
    expect(cartTotal([{ id: "morango", quantity: 9 }])).toBe(4410);
  });
  it("precisa ser menor que o preço normal e ter mínimo de 2", () => {
    const base = toData(product("morango", 5));
    expect(productSchema.safeParse({ ...base, ...bulk }).success).toBe(true);
    expect(productSchema.safeParse({ ...base, bulkMin: 10, bulkPriceInCents: 490 }).success).toBe(false);
    expect(productSchema.safeParse({ ...base, bulkMin: 1, bulkPriceInCents: 400 }).success).toBe(false);
    expect(productSchema.safeParse({ ...base, bulkMin: 0, bulkPriceInCents: 0 }).success).toBe(true);
  });
  it("aparece na mensagem do pedido", () => {
    setCatalog([product("morango", 50, bulk)]);
    expect(plain(orderMessage([{ id: "morango", quantity: 10 }]))).toContain("R$ 4,00 por unidade (preço por quantidade)");
  });
});

describe("kits", () => {
  it("calcula disponibilidade, quantos cabem e o preço avulso", () => {
    const products = new Map([["morango", product("morango", 5)], ["limao", product("limao", 7)]]);
    const kit = toKit(kitData, products);
    expect(kit).toMatchObject({ available: true, maxUnits: 3, regularInCents: 490 + 2 * 350 });
    expect(toKit({ ...kitData, active: false }, products).available).toBe(false);
    expect(toKit({ ...kitData, items: [{ id: "sumiu", quantity: 1 }] }, products).available).toBe(false);
  });
  it("valida a receita do kit", () => {
    expect(kitSchema.safeParse(kitData).success).toBe(true);
    expect(kitSchema.safeParse({ ...kitData, items: [] }).success).toBe(false);
    expect(kitSchema.safeParse({ ...kitData, items: [{ id: "morango", quantity: 1 }, { id: "morango", quantity: 1 }] }).success).toBe(false);
    expect(kitSchema.safeParse({ ...kitData, priceInCents: 0 }).success).toBe(false);
    expect(parseKits([kitData, { ...kitData, id: "Ruim!" }]).map(k => k.id)).toEqual(["duo"]);
  });
  it("kit e sabor avulso disputam o mesmo estoque", () => {
    setCatalog([product("morango", 5), product("limao", 5)], { kits: parseKits([kitData]) });
    expect(maxQuantityFor("kit:duo")).toBe(2); // limão: 5 / 2
    // 1 kit reserva 2 limões; sobram 3 avulsos.
    expect(sanitizeCart([{ id: "kit:duo", quantity: 1 }, { id: "limao", quantity: 9 }])).toEqual([{ id: "kit:duo", quantity: 1 }, { id: "limao", quantity: 3 }]);
    expect(roomFor("kit:duo", [{ id: "limao", quantity: 4 }])).toBe(0);
    expect(roomFor("limao", [{ id: "kit:duo", quantity: 2 }])).toBe(1);
    expect(cartTotal([{ id: "kit:duo", quantity: 2 }])).toBe(1600);
  });
  it("entra no carrinho e na mensagem com os sabores", () => {
    setCatalog([product("morango", 5), product("limao", 5)], { kits: parseKits([kitData]) });
    const cart = updateCart([], { type: "add", id: "kit:duo", quantity: 1 });
    expect(cart).toEqual([{ id: "kit:duo", quantity: 1 }]);
    expect(plain(orderMessage(cart))).toContain("1x Duo (1x Morango, 2x Limão) — R$ 8,00 cada");
    expect(updateCart([], { type: "add", id: "kit:nao-existe", quantity: 1 })).toEqual([]);
  });
});

describe("entrega", () => {
  const zones = parseZones([
    { id: "1", city: "Uberlândia", district: "Centro", feeCents: 500, active: true, sort: 0 },
    { id: "2", city: "Uberlândia", district: "Tibery", feeCents: 0, active: false, sort: 1 },
    { id: "3", city: "uberlândia", district: " centro ", feeCents: 100, active: true, sort: 2 },
  ]);
  it("ignora bairros repetidos e acha o bairro sem diferenciar maiúsculas", () => {
    expect(zones).toHaveLength(2);
    expect(findZone(zones, "UBERLÂNDIA", " Centro")?.feeCents).toBe(500);
    expect(findZone(zones, "Uberlândia", "Tibery")).toBeUndefined(); // pausado
  });
  it("regras inválidas voltam ao padrão (entrega e retirada, sem mínimo)", () => {
    expect(parseSettings({ deliveryEnabled: false, pickupEnabled: false, minOrderCents: 0 })).toEqual({ deliveryEnabled: true, pickupEnabled: true, minOrderCents: 0 });
    expect(parseSettings({ deliveryEnabled: true, pickupEnabled: false, minOrderCents: 2000 }).minOrderCents).toBe(2000);
  });
  it("a mensagem mostra subtotal, taxa e total com entrega", () => {
    const text = plain(orderMessage([{ id: "morango", quantity: 2 }], undefined, customer, 500));
    expect(text).toContain("Subtotal: R$ 9,80");
    expect(text).toContain("Taxa de entrega: R$ 5,00");
    expect(text).toContain("TOTAL: R$ 14,80");
    expect(plain(orderMessage([{ id: "morango", quantity: 2 }], undefined, customer, null))).toContain("Taxa de entrega: a combinar");
    expect(plain(orderMessage([{ id: "morango", quantity: 2 }], undefined, customer, 0))).toContain("Taxa de entrega: grátis");
  });
});
