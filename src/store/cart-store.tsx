"use client";
import { createContext, useContext, useEffect, useReducer, useState, useCallback, type ReactNode } from "react";
import { CART_KEY, parseStoredCart, updateCart, type CartAction } from "@/lib/cart";
import type { CartItem } from "@/types/product";
type State = { items: CartItem[]; hydrated: boolean };
function reducer(state: State, action: CartAction): State { return { items: updateCart(state.items, action), hydrated: state.hydrated || action.type === "hydrate" }; }
type Context = { items: CartItem[]; dispatch: (action: CartAction) => void; open: boolean; setOpen: (v: boolean) => void; notice: string; announce: (message: string) => void };
const CartContext = createContext<Context | null>(null);
export function CartProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, { items: [], hydrated: false });
  const [open, setOpen] = useState(false);
  const [notice, setNotice] = useState("");
  const announce = useCallback((message: string) => setNotice(message), []);
  useEffect(() => {
    let items: CartItem[] = [];
    try { items = parseStoredCart(localStorage.getItem(CART_KEY)); } catch { /* Storage may be disabled. */ }
    dispatch({ type: "hydrate", items });
    const sync = (e: StorageEvent) => { if (e.key === CART_KEY || e.key === null) dispatch({ type: "hydrate", items: parseStoredCart(e.newValue) }); };
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, []);
  useEffect(() => {
    if (!state.hydrated) return;
    try { localStorage.setItem(CART_KEY, JSON.stringify(state.items)); } catch { /* In-memory cart remains usable. */ }
  }, [state]);
  useEffect(() => { if (!notice) return; const id = setTimeout(() => setNotice(""), 3000); return () => clearTimeout(id); }, [notice]);
  return <CartContext.Provider value={{ items: state.items, dispatch, open, setOpen, notice, announce }}>{children}<div className={`toast ${notice ? "visible" : ""}`} role="status" aria-live="polite">{notice}</div></CartContext.Provider>;
}
export function useCart() { const value = useContext(CartContext); if (!value) throw new Error("CartProvider ausente."); return value; }

