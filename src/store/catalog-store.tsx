"use client";
import { useEffect, useSyncExternalStore } from "react";
import { defaultSettings, fetchPublishedCatalog, getCatalog, getCatalogError, getKits, getSettings, getZones, initialCatalog, initialKits, isCatalogReady, LOCAL_CATALOG_KEY, LOCAL_SHOP_KEY, setCatalog, setCatalogError, subscribeCatalog } from "@/lib/catalog";
import type { DeliveryZone } from "@/types/product";

const noZones: readonly DeliveryZone[] = [];
import { supabaseConfigured } from "@/lib/supabase";

/** Carrega o catálogo publicado uma vez por visita e acompanha alterações feitas em outras abas. */
export function CatalogLoader() {
  useEffect(() => {
    let cancelled = false;
    const load = () => fetchPublishedCatalog()
      .then(({ products, ...extras }) => { if (!cancelled) setCatalog(products, extras); })
      .catch(() => {
        if (cancelled) return;
        // Com o banco configurado, não há catálogo de reserva: preços locais seriam enganosos.
        if (supabaseConfigured) setCatalogError("Não foi possível carregar os sabores. Atualize a página para tentar novamente.");
        else setCatalog(null);
      });
    load();
    const sync = (event: StorageEvent) => { if (event.key === LOCAL_CATALOG_KEY || event.key === LOCAL_SHOP_KEY) load(); };
    window.addEventListener("storage", sync);
    return () => { cancelled = true; window.removeEventListener("storage", sync); };
  }, []);
  return null;
}

/** Catálogo completo em uso (inclui produtos ocultos, com `active: false`). */
export function useCatalog() {
  const products = useSyncExternalStore(subscribeCatalog, getCatalog, () => initialCatalog);
  const ready = useSyncExternalStore(subscribeCatalog, isCatalogReady, () => false);
  const error = useSyncExternalStore(subscribeCatalog, getCatalogError, () => "");
  // Sem banco, o catálogo inicial já pode ser exibido; com banco, só depois da resposta.
  const loading = supabaseConfigured && !ready && !error;
  return { products, ready, loading, error };
}

/** Kits à venda (com disponibilidade calculada pelo estoque atual). */
export function useKits() {
  return useSyncExternalStore(subscribeCatalog, getKits, () => initialKits);
}

/** Bairros atendidos e regras de entrega/retirada. */
export function useDelivery() {
  const zones = useSyncExternalStore(subscribeCatalog, getZones, () => noZones);
  const settings = useSyncExternalStore(subscribeCatalog, getSettings, () => defaultSettings);
  return { zones, settings };
}

/** Aviso de carregamento ou falha do catálogo. Não renderiza nada quando ele está pronto. */
export function CatalogStatus() {
  const { loading, error } = useCatalog();
  if (loading) return <p className="catalog-status" role="status">Carregando os sabores…</p>;
  if (error) return <p className="catalog-status" role="alert">{error} <button className="text-button" onClick={() => window.location.reload()}>Tentar novamente</button></p>;
  return null;
}
