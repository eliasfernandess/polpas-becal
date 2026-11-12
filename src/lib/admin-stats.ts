import type { Product, StockMovement } from "@/types/product";

export type Level = "ok" | "low" | "out";
export const levelOf = (p: Pick<Product, "stock" | "lowStock">): Level => p.stock === 0 ? "out" : p.stock <= p.lowStock ? "low" : "ok";

/** O que repor primeiro: esgotados, depois os mais próximos de acabar em relação ao próprio mínimo. Ocultos ficam de fora. */
export function restockList(products: readonly Product[]): Product[] {
  const urgency = (p: Product) => p.stock === 0 ? -1 : p.stock / Math.max(1, p.lowStock);
  return products.filter(p => p.active && levelOf(p) !== "ok").sort((a, b) => urgency(a) - urgency(b) || a.name.localeCompare(b.name, "pt-BR"));
}

export interface PeriodSummary {
  unitsIn: number;
  unitsOut: number;
  unitsSold: number;
  /** Vendas a preço atual de catálogo (estimativa: o preço da época não é guardado). */
  revenueCents: number;
  top: { productId: string; name: string; units: number }[];
}

/** Resumo das movimentações dos últimos `days` dias. "Cadastro" (estoque inicial) conta como entrada. */
export function summarize(movements: readonly StockMovement[], products: readonly Product[], days = 30, now = Date.now()): PeriodSummary {
  const since = now - days * 86400000;
  const price = new Map(products.map(p => [p.id, p.priceInCents]));
  const sold = new Map<string, { name: string; units: number }>();
  const summary: PeriodSummary = { unitsIn: 0, unitsOut: 0, unitsSold: 0, revenueCents: 0, top: [] };
  for (const m of movements) {
    const time = Date.parse(m.createdAt);
    if (Number.isNaN(time) || time < since || time > now) continue;
    if (m.delta > 0) { summary.unitsIn += m.delta; continue; }
    summary.unitsOut -= m.delta;
    if (m.reason !== "Venda") continue;
    summary.unitsSold -= m.delta;
    summary.revenueCents += -m.delta * (price.get(m.productId) ?? 0);
    const entry = sold.get(m.productId) ?? { name: m.productName, units: 0 };
    entry.units -= m.delta;
    sold.set(m.productId, entry);
  }
  summary.top = [...sold].map(([productId, v]) => ({ productId, ...v })).sort((a, b) => b.units - a.units || a.name.localeCompare(b.name, "pt-BR")).slice(0, 5);
  return summary;
}

/**
 * CSV para Excel em português: separador ";", BOM e CRLF.
 * Textos que começam com = + - @ ganham apóstrofo para não virarem fórmula ao abrir a planilha.
 */
export function toCsv(rows: readonly (readonly (string | number)[])[]): string {
  const cell = (value: string | number) => {
    if (typeof value === "number") return String(value);
    const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
    return /[";\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
  };
  return "\ufeff" + rows.map(row => row.map(cell).join(";")).join("\r\n") + "\r\n";
}
