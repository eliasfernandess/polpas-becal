"use client";
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { products as demoProducts } from "@/data/products";
import { supabase, supabaseConfigured } from "@/lib/supabase";
import { catalogSchema } from "@/lib/catalog";
import type { Product } from "@/types/product";
type Catalog = { products: readonly Product[]; loading: boolean; error: string };
const CatalogContext = createContext<(Catalog & { productById: ReadonlyMap<string, Product> }) | null>(null);
export function CatalogProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<Catalog>({ products: supabaseConfigured ? [] : demoProducts, loading: supabaseConfigured, error: "" });
  useEffect(() => {
    if (!supabase) return;
    let active = true;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    async function load() {
      try {
        const { data, error } = await supabase!.from("products").select("id,name,description,image,price_in_cents,unit_label,category,available,featured,tone").order("sort_order").order("id").abortSignal(controller.signal);
        if (error) throw error;
        const products = catalogSchema.parse(data);
        if (active) setState({ products, loading: false, error: "" });
      } catch {
        if (active) setState({ products: [], loading: false, error: "Não foi possível carregar os sabores. Atualize a página para tentar novamente." });
      } finally { clearTimeout(timer); }
    }
    void load();
    return () => { active = false; controller.abort(); clearTimeout(timer); };
  }, []);
  const productById = useMemo(() => new Map(state.products.map(product => [product.id, product])), [state.products]);
  return <CatalogContext.Provider value={{ ...state, productById }}>{children}</CatalogContext.Provider>;
}
export function useCatalog() {
  const value = useContext(CatalogContext);
  if (!value) throw new Error("CatalogProvider ausente.");
  return value;
}
export function CatalogStatus() {
  const { loading, error } = useCatalog();
  if (loading) return <p role="status">Carregando os sabores...</p>;
  if (error) return <p role="alert">{error} <button className="text-button" onClick={() => window.location.reload()}>Tentar novamente</button></p>;
  return null;
}
