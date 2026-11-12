import { describe, expect, it } from "vitest";
import { seedProducts, toProduct } from "@/data/products";
import { inviteSchema } from "@/lib/admin-repo";
import { levelOf, restockList, summarize, toCsv } from "@/lib/admin-stats";
import { toData } from "@/lib/catalog";
import type { StockMovement } from "@/types/product";

const make = (id: string, stock: number, extra = {}) => toProduct({ ...toData(seedProducts[0]), id, name: id, stock, lowStock: 20, ...extra });
const now = Date.parse("2026-06-30T12:00:00Z");
const move = (productId: string, delta: number, reason: string, daysAgo: number): StockMovement =>
  ({ id: `${productId}${delta}${daysAgo}`, productId, productName: productId, delta, stockAfter: 0, reason, note: "", createdAt: new Date(now - daysAgo * 86400000).toISOString() });

describe("situação do estoque", () => {
  it("classifica esgotado, baixo e normal", () => {
    expect(levelOf({ stock: 0, lowStock: 20 })).toBe("out");
    expect(levelOf({ stock: 20, lowStock: 20 })).toBe("low");
    expect(levelOf({ stock: 21, lowStock: 20 })).toBe("ok");
    expect(levelOf({ stock: 1, lowStock: 0 })).toBe("ok");
  });
  it("ordena a reposição pela urgência e ignora ocultos e saudáveis", () => {
    const list = restockList([make("folgado", 90), make("quase", 18), make("zerado", 0), make("critico", 3), make("oculto", 0, { active: false })]);
    expect(list.map(p => p.id)).toEqual(["zerado", "critico", "quase"]);
  });
});

describe("resumo do período", () => {
  const products = [make("morango", 50, { priceInCents: 500 }), make("manga", 50, { priceInCents: 300 })];
  const history = [
    move("morango", -4, "Venda", 1), move("morango", -6, "Venda", 10), move("manga", -3, "Venda", 2),
    move("manga", -5, "Perda ou vencimento", 3), move("manga", 40, "Produção", 5),
    move("morango", -100, "Venda", 31), move("antigo", -2, "Venda", 4), move("manga", 7, "Reposição", -1),
  ];
  it("soma entradas, saídas e vendas só dentro do período", () => {
    const summary = summarize(history, products, 30, now);
    expect(summary).toMatchObject({ unitsIn: 40, unitsOut: 20, unitsSold: 15, revenueCents: 10 * 500 + 3 * 300 });
  });
  it("lista os mais vendidos, inclusive produtos já excluídos", () => {
    expect(summarize(history, products, 30, now).top).toEqual([
      { productId: "morango", name: "morango", units: 10 }, { productId: "manga", name: "manga", units: 3 }, { productId: "antigo", name: "antigo", units: 2 },
    ]);
  });
  it("tolera histórico vazio e datas inválidas", () => {
    expect(summarize([], products, 30, now).top).toEqual([]);
    expect(summarize([{ ...move("manga", -1, "Venda", 0), createdAt: "ontem" }], products, 30, now).unitsSold).toBe(0);
  });
});

describe("exportação CSV", () => {
  it("usa ponto e vírgula, BOM, CRLF e aspas quando necessário", () => {
    expect(toCsv([["Produto", "Qtd."], ['Mix "tropical"; 100 g', 3]])).toBe('\ufeffProduto;Qtd.\r\n"Mix ""tropical""; 100 g";3\r\n');
  });
  it.each(["=1+1", "+55 34", "-10", "@cmd", "\tx"])("neutraliza texto que viraria fórmula: %j", text => expect(toCsv([[text]])).toContain(`'${text}`));
  it("mantém números negativos como números", () => expect(toCsv([[-12]])).toBe("\ufeff-12\r\n"));
});

describe("convites", () => {
  it("normaliza o e-mail e exige nome e função válidos", () => {
    expect(inviteSchema.parse({ name: " Ana ", email: " Ana@Exemplo.COM ", role: "estoque" })).toEqual({ name: "Ana", email: "ana@exemplo.com", role: "estoque" });
    for (const bad of [{ email: "sem-arroba" }, { name: "A" }, { role: "dono" }, { extra: true }]) {
      expect(inviteSchema.safeParse({ name: "Ana", email: "ana@exemplo.com", role: "admin", ...bad }).success).toBe(false);
    }
  });
});
