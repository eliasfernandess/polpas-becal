import { z } from "zod";
import { productById } from "@/data/products";
import type { CartItem } from "@/types/product";
export const MAX_QUANTITY = 99;
export const CART_KEY = "becal:cart:v1";
const itemSchema = z.object({ id: z.string().max(60), quantity: z.number().int().min(1).max(MAX_QUANTITY) }).strict();
export function sanitizeCart(value: unknown): CartItem[] {
  if (!Array.isArray(value) || value.length > 100) return [];
  const entries = new Map<string, number>();
  for (const candidate of value) {
    const parsed = itemSchema.safeParse(candidate);
    if (!parsed.success || !productById.get(parsed.data.id)?.available) continue;
    entries.set(parsed.data.id, Math.min(MAX_QUANTITY, (entries.get(parsed.data.id) || 0) + parsed.data.quantity));
  }
  return [...entries].map(([id, quantity]) => ({ id, quantity }));
}
export function parseStoredCart(raw: string | null): CartItem[] {
  if (!raw || raw.length > 20000) return [];
  try { return sanitizeCart(JSON.parse(raw)); } catch { return []; }
}
export type CartAction =
  | { type: "add"; id: string; quantity: number }
  | { type: "set"; id: string; quantity: number }
  | { type: "remove"; id: string }
  | { type: "clear" }
  | { type: "hydrate"; items: unknown };
export function updateCart(current: CartItem[], action: CartAction): CartItem[] {
  const items = sanitizeCart(current);
  if (action.type === "clear") return [];
  if (action.type === "hydrate") return sanitizeCart(action.items);
  if (action.type === "remove") return items.filter(item => item.id !== action.id);
  if (!productById.get(action.id)?.available || !Number.isInteger(action.quantity) || action.quantity < 0 || action.quantity > MAX_QUANTITY) return items;
  if (action.type === "add" && action.quantity === 0) return items;
  const existing = items.find(item => item.id === action.id);
  const quantity = action.type === "add" ? Math.min(MAX_QUANTITY, (existing?.quantity || 0) + action.quantity) : action.quantity;
  return sanitizeCart([...items.filter(item => item.id !== action.id), { id: action.id, quantity }]);
}
export function cartTotal(items: CartItem[]): number {
  return sanitizeCart(items).reduce((total, item) => total + productById.get(item.id)!.priceInCents * item.quantity, 0);
}

