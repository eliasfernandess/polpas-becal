"use client";
import { useEffect, useSyncExternalStore } from "react";
import { seedProducts } from "@/data/products";
import { fetchPublishedCatalog, getCatalog, isCatalogReady, LOCAL_CATALOG_KEY, setCatalog, subscribeCatalog } from "@/lib/catalog";

/** Carrega o catálogo publicado uma vez por visita e acompanha alterações feitas em outras abas. */
export function CatalogLoader() {
  useEffect(() => {
    let cancelled = false;
    const load = () => fetchPublishedCatalog()
      .then(list => { if (!cancelled) setCatalog(list); })
      .catch(() => { if (!cancelled) setCatalog(null); }); // Mantém o catálogo inicial se a rede falhar.
    load();
    const sync = (event: StorageEvent) => { if (event.key === LOCAL_CATALOG_KEY) load(); };
    window.addEventListener("storage", sync);
    return () => { cancelled = true; window.removeEventListener("storage", sync); };
  }, []);
  return null;
}

/** Catálogo completo em uso (inclui produtos ocultos, com `available: false`). */
export function useCatalog() {
  const products = useSyncExternalStore(subscribeCatalog, getCatalog, () => seedProducts);
  const ready = useSyncExternalStore(subscribeCatalog, isCatalogReady, () => false);
  return { products, ready };
}
