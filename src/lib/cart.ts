import { z } from "zod";
import { kitById as liveKits, productById as liveCatalog } from "@/data/products";
import type { CartItem, Kit, Product } from "@/types/product";

// O catálogo padrão é o índice vivo, atualizado quando o banco responde (src/lib/catalog.ts).
// Os testes podem passar outro catálogo.
type Catalog = ReadonlyMap<string, Product>;
type Kits = ReadonlyMap<string, Kit>;

export const MAX_QUANTITY = 99;
export const CART_KEY = "becal:cart:v1";
/** Kits entram no carrinho como "kit:<id>"; sabores, pelo próprio id. */
export const KIT_PREFIX = "kit:";
export const isKitId = (id: string) => id.startsWith(KIT_PREFIX);
export const kitOf = (id: string, kits: Kits = liveKits) => isKitId(id) ? kits.get(id.slice(KIT_PREFIX.length)) : undefined;
const itemSchema = z.object({ id: z.string().max(60), quantity: z.number().int().min(1).max(MAX_QUANTITY) }).strict();

/** Quanto de cada sabor uma unidade da linha consome (um sabor: 1 dele; um kit: a receita do kit). */
function demandPerUnit(id: string, productById: Catalog, kits: Kits): Map<string, number> | null {
  if (isKitId(id)) {
    const kit = kitOf(id, kits);
    if (!kit?.active || !kit.items.length) return null;
    const demand = new Map<string, number>();
    for (const item of kit.items) {
      if (!productById.get(item.id)) return null;
      demand.set(item.id, (demand.get(item.id) ?? 0) + item.quantity);
    }
    return demand;
  }
  return productById.get(id)?.available ? new Map([[id, 1]]) : null;
}
/** Quantas unidades da linha cabem no estoque, descontando o que outras linhas já reservaram. */
function fits(per: Map<string, number>, reserved: Map<string, number>, productById: Catalog): number {
  let allowed = MAX_QUANTITY;
  for (const [productId, units] of per) {
    const free = (productById.get(productId)?.stock ?? 0) - (reserved.get(productId) ?? 0);
    allowed = Math.min(allowed, Math.floor(free / units));
  }
  return Math.max(0, allowed);
}

/**
 * Limpa o carrinho: descarta itens desconhecidos ou indisponíveis e limita as quantidades ao
 * estoque. Sabores avulsos e dentro de kits disputam o mesmo estoque, na ordem do carrinho.
 */
export function sanitizeCart(value: unknown, productById: Catalog = liveCatalog, kits: Kits = liveKits): CartItem[] {
  if (!Array.isArray(value) || value.length > 100) return [];
  const entries = new Map<string, number>();
  for (const candidate of value) {
    const parsed = itemSchema.safeParse(candidate);
    if (!parsed.success) continue;
    entries.set(parsed.data.id, Math.min(MAX_QUANTITY, (entries.get(parsed.data.id) || 0) + parsed.data.quantity));
  }
  const reserved = new Map<string, number>();
  const result: CartItem[] = [];
  for (const [id, wanted] of entries) {
    const per = demandPerUnit(id, productById, kits);
    if (!per) continue;
    const quantity = Math.min(wanted, fits(per, reserved, productById));
    if (quantity <= 0) continue;
    for (const [productId, units] of per) reserved.set(productId, (reserved.get(productId) ?? 0) + units * quantity);
    result.push({ id, quantity });
  }
  return result;
}

/** Limite de uma linha sozinha no carrinho (estoque e teto de 99). */
export const maxQuantityFor = (id: string, productById: Catalog = liveCatalog, kits: Kits = liveKits) => {
  const per = demandPerUnit(id, productById, kits);
  return per ? fits(per, new Map(), productById) : 0;
};
/** Quantas unidades ainda dá para acrescentar a `id`, considerando o resto do carrinho. */
export function roomFor(id: string, items: CartItem[], productById: Catalog = liveCatalog, kits: Kits = liveKits): number {
  const per = demandPerUnit(id, productById, kits);
  if (!per) return 0;
  const others = sanitizeCart(items.filter(item => item.id !== id), productById, kits);
  const reserved = new Map<string, number>();
  for (const item of others) {
    const demand = demandPerUnit(item.id, productById, kits)!;
    for (const [productId, units] of demand) reserved.set(productId, (reserved.get(productId) ?? 0) + units * item.quantity);
  }
  const current = items.find(item => item.id === id)?.quantity ?? 0;
  return Math.max(0, fits(per, reserved, productById) - current);
}

/** Preço de uma unidade da linha: kit pelo preço do kit; sabor com preço por quantidade, se atingido. */
export function unitPrice(id: string, quantity: number, productById: Catalog = liveCatalog, kits: Kits = liveKits): number {
  const kit = kitOf(id, kits);
  if (kit) return kit.priceInCents;
  const product = productById.get(id);
  if (!product) return 0;
  return product.bulkMin > 0 && quantity >= product.bulkMin ? product.bulkPriceInCents : product.priceInCents;
}
export const lineTotal = (item: CartItem, productById: Catalog = liveCatalog, kits: Kits = liveKits) =>
  unitPrice(item.id, item.quantity, productById, kits) * item.quantity;
/** Nome para exibir: "Morango" ou "Kit semana". */
export const itemName = (id: string, productById: Catalog = liveCatalog, kits: Kits = liveKits) =>
  kitOf(id, kits)?.name ?? productById.get(id)?.name ?? id;

export function parseStoredCart(raw: string | null, productById: Catalog = liveCatalog, kits: Kits = liveKits): CartItem[] {
  if (!raw || raw.length > 20000) return [];
  try { return sanitizeCart(JSON.parse(raw), productById, kits); } catch { return []; }
}
export type CartAction =
  | { type: "add"; id: string; quantity: number }
  | { type: "set"; id: string; quantity: number }
  | { type: "remove"; id: string }
  | { type: "clear" }
  | { type: "hydrate"; items: unknown }
  | { type: "revalidate" };
export function updateCart(current: CartItem[], action: CartAction, productById: Catalog = liveCatalog, kits: Kits = liveKits): CartItem[] {
  const items = sanitizeCart(current, productById, kits);
  if (action.type === "clear") return [];
  if (action.type === "revalidate") return items;
  if (action.type === "hydrate") return sanitizeCart(action.items, productById, kits);
  if (action.type === "remove") return items.filter(item => item.id !== action.id);
  if (!demandPerUnit(action.id, productById, kits) || !Number.isInteger(action.quantity) || action.quantity < 0 || action.quantity > MAX_QUANTITY) return items;
  if (action.type === "add" && action.quantity === 0) return items;
  const existing = items.find(item => item.id === action.id);
  const quantity = action.type === "add" ? Math.min(MAX_QUANTITY, (existing?.quantity || 0) + action.quantity) : action.quantity;
  // A linha alterada mantém sua posição; uma linha nova entra no fim.
  const next = existing ? items.map(item => item.id === action.id ? { id: action.id, quantity } : item) : [...items, { id: action.id, quantity }];
  return sanitizeCart(next.filter(item => item.quantity > 0), productById, kits);
}
export function cartTotal(items: CartItem[], productById: Catalog = liveCatalog, kits: Kits = liveKits): number {
  return sanitizeCart(items, productById, kits).reduce((total, item) => total + lineTotal(item, productById, kits), 0);
}
