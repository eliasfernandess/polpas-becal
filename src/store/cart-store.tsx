"use client";
import { createContext, useCallback, useContext, useEffect, useReducer, useRef, useState, type ReactNode } from "react";
import { CART_KEY, parseStoredCart, updateCart, type CartAction } from "@/lib/cart";
import { useCatalog } from "@/store/catalog-store";
import type { CartItem } from "@/types/product";

type State = { items: CartItem[]; hydrated: boolean };
function reducer(state: State, action: CartAction): State {
  return { items: updateCart(state.items, action), hydrated: state.hydrated || action.type === "hydrate" };
}
type Context = { items: CartItem[]; dispatch: (action: CartAction) => void; open: boolean; setOpen: (v: boolean) => void; notice: string; announce: (message: string) => void };
const CartContext = createContext<Context | null>(null);

export function CartProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, { items: [], hydrated: false });
  const [open, setOpen] = useState(false);
  const [notice, setNotice] = useState("");
  const announce = useCallback((message: string) => setNotice(message), []);
  const { products, ready } = useCatalog();
  const restored = useRef(false);

  // O carrinho só é restaurado depois que o catálogo publicado chega, para validar
  // itens e quantidades contra o estoque real. Mudanças posteriores revalidam.
  useEffect(() => {
    if (!ready) return;
    if (restored.current) { dispatch({ type: "revalidate" }); return; }
    restored.current = true;
    let items: CartItem[] = [];
    try { items = parseStoredCart(localStorage.getItem(CART_KEY)); } catch { /* Armazenamento pode estar bloqueado. */ }
    dispatch({ type: "hydrate", items });
  }, [ready, products]);
  useEffect(() => {
    const sync = (e: StorageEvent) => { if (restored.current && (e.key === CART_KEY || e.key === null)) dispatch({ type: "hydrate", items: parseStoredCart(e.newValue) }); };
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, []);
  useEffect(() => {
    if (!state.hydrated) return;
    try { localStorage.setItem(CART_KEY, JSON.stringify(state.items)); } catch { /* O carrinho em memória continua utilizável. */ }
  }, [state]);
  useEffect(() => { if (!notice) return; const id = setTimeout(() => setNotice(""), 3000); return () => clearTimeout(id); }, [notice]);

  return <CartContext.Provider value={{ items: state.items, dispatch, open, setOpen, notice, announce }}>
    {children}
    <div className={`toast ${notice ? "visible" : ""}`} role="status" aria-live="polite">{notice}</div>
  </CartContext.Provider>;
}
export function useCart() { const value = useContext(CartContext); if (!value) throw new Error("CartProvider ausente."); return value; }
