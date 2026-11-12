"use client";
import { createContext, useContext, useEffect, useReducer, useState, useCallback, type ReactNode } from "react";
import { CART_KEY, parseStoredCart, sanitizeCart, updateCart, type CartAction } from "@/lib/cart";
import { useCatalog } from "@/store/catalog-store";
import type { CartItem } from "@/types/product";
type State = { items: CartItem[]; hydrated: boolean };
type Context = { items: CartItem[]; dispatch: (action: CartAction) => void; open: boolean; setOpen: (v: boolean) => void; notice: string; announce: (message: string) => void };
const CartContext = createContext<Context | null>(null);
export function CartProvider({ children }: { children: ReactNode }) {
  const { productById, loading, error } = useCatalog();
  const [state, dispatch] = useReducer((state: State, action: CartAction): State => ({
    items: updateCart(state.items, action, productById), hydrated: state.hydrated || action.type === "hydrate",
  }), { items: [], hydrated: false });
  const [open, setOpen] = useState(false);
  const [notice, setNotice] = useState("");
  const announce = useCallback((message: string) => setNotice(message), []);
  useEffect(() => {
    if (loading || error) return;
    let items: CartItem[] = [];
    try { items = parseStoredCart(localStorage.getItem(CART_KEY), productById); } catch { /* Storage may be disabled. */ }
    dispatch({ type: "hydrate", items });
    const sync = (e: StorageEvent) => { if (e.key === CART_KEY || e.key === null) dispatch({ type: "hydrate", items: parseStoredCart(e.newValue, productById) }); };
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, [productById, loading, error]);
  useEffect(() => {
    if (!state.hydrated) return;
    try { localStorage.setItem(CART_KEY, JSON.stringify(state.items)); } catch { /* In-memory cart remains usable. */ }
  }, [state]);
  useEffect(() => { if (!notice) return; const id = setTimeout(() => setNotice(""), 3000); return () => clearTimeout(id); }, [notice]);
  return <CartContext.Provider value={{ items: sanitizeCart(state.items, productById), dispatch, open, setOpen, notice, announce }}>{children}<div className={`toast ${notice ? "visible" : ""}`} role="status" aria-live="polite">{notice}</div></CartContext.Provider>;
}
export function useCart() { const value = useContext(CartContext); if (!value) throw new Error("CartProvider ausente."); return value; }

