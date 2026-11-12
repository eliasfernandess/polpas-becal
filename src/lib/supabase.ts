import type { SupabaseClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/+$/, "") || "";
// Chave pública do projeto ("publishable"). ANON_KEY é aceita por compatibilidade com projetos antigos.
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

export const supabaseConfig = /^https:\/\/[\w.-]+$/.test(url) && key ? { url, key } : null;
export const supabaseConfigured = Boolean(supabaseConfig);

let publicClient: Promise<SupabaseClient> | null = null;
/**
 * Cliente sem sessão, usado pela loja para registrar pedidos e orçamentos como visitante.
 * O SDK só é baixado quando alguém envia algo.
 */
export function getPublicClient(): Promise<SupabaseClient> {
  if (!supabaseConfig) return Promise.reject(new Error("Supabase não configurado."));
  publicClient ??= import("@supabase/supabase-js").then(({ createClient }) => createClient(supabaseConfig.url, supabaseConfig.key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  }));
  return publicClient;
}
