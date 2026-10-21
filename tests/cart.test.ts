import { describe, it, expect } from "vitest";
import { cartTotal, parseStoredCart, sanitizeCart, updateCart, MAX_QUANTITY } from "@/lib/cart";
import { productById } from "@/data/products";
describe("carrinho", () => {
  it("adiciona e acumula sem duplicar produtos", () => {
    const items = updateCart([], { type: "add", id: "morango", quantity: 2 });
    expect(updateCart(items, { type: "add", id: "morango", quantity: 3 })).toEqual([{ id: "morango", quantity: 5 }]);
  });
  it("altera a quantidade e remove ao chegar a zero", () => {
    const items = [{ id: "manga", quantity: 4 }];
    expect(updateCart(items, { type: "set", id: "manga", quantity: 2 })).toEqual([{ id: "manga", quantity: 2 }]);
    expect(updateCart(items, { type: "set", id: "manga", quantity: 0 })).toEqual([]);
    expect(updateCart(items, { type: "remove", id: "manga" })).toEqual([]);
  });
  it("limpa e calcula o carrinho vazio", () => {
    expect(updateCart([{ id: "manga", quantity: 1 }], { type: "clear" })).toEqual([]);
    expect(cartTotal([])).toBe(0);
  });
  it.each([-1, 1.5, NaN, Infinity, 100])("rejeita quantidade inválida %s", quantity => {
    expect(updateCart([], { type: "add", id: "morango", quantity })).toEqual([]);
    expect(updateCart([], { type: "set", id: "morango", quantity })).toEqual([]);
  });
  it("limita a soma de quantidades em 99", () => expect(updateCart([{ id: "morango", quantity: 98 }], { type: "add", id: "morango", quantity: 3 })).toEqual([{ id: "morango", quantity: MAX_QUANTITY }]));
  it("recalcula totais pelo catálogo atual em centavos", () => {
    expect(cartTotal([{ id: "morango", quantity: 2 }, { id: "manga", quantity: 3 }])).toBe(productById.get("morango")!.priceInCents * 2 + productById.get("manga")!.priceInCents * 3);
  });
  it("descarta itens desatualizados, indisponíveis e dados de preço adulterados", () => {
    expect(sanitizeCart([{ id: "antigo", quantity: 1 }, { id: "tamarindo", quantity: 1 }, { id: "manga", quantity: 2, priceInCents: 1 }, { id: "morango", quantity: 2 }])).toEqual([{ id: "morango", quantity: 2 }]);
  });
  it("agrupa duplicatas e limita carrinhos inesperadamente grandes", () => {
    expect(sanitizeCart([{ id: "manga", quantity: 60 }, { id: "manga", quantity: 60 }])).toEqual([{ id: "manga", quantity: 99 }]);
    expect(sanitizeCart(new Array(101).fill({ id: "manga", quantity: 1 }))).toEqual([]);
  });
  it.each([null, "not-json", "null", "{}", "[1]", "x".repeat(20001)])("tolera armazenamento inválido", raw => expect(parseStoredCart(raw)).toEqual([]));
  it("restaura apenas ids e quantidades válidos", () => expect(parseStoredCart(JSON.stringify([{ id: "manga", quantity: 3 }]))).toEqual([{ id: "manga", quantity: 3 }]));
});

