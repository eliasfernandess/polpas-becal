import { z } from "zod";
import { productById, seedProducts, toProduct } from "@/data/products";
import { supabaseConfig } from "@/lib/supabase";
import { toneIds, type Product, type ProductData, type StockMovement } from "@/types/product";

/* ---------- Validação ---------- */

export const MAX_STOCK = 100000;
const text = (min: number, max: number, message: string) =>
  z.string().trim().min(min, message).max(max, `Use no máximo ${max} caracteres.`).refine(v => !/[\u0000-\u001f\u007f]/.test(v), "Remova os caracteres de controle.");
/**
 * Arquivo local em /images, foto enviada ao bucket público do Supabase, ou imagem embutida
 * (só no modo demonstração). Nunca outros hosts ou esquemas: a CSP também só permite estes.
 */
const imageSource = z.string().max(400000, "Imagem grande demais.").refine(
  v => v === ""
    || /^\/images\/[\w./-]+\.(webp|png|jpg)$/.test(v)
    || /^https:\/\/[a-z0-9-]+\.supabase\.co\/storage\/v1\/object\/public\/product-images\/[\w.-]+$/.test(v)
    || /^data:image\/(webp|png|jpeg);base64,[A-Za-z0-9+/=]+$/.test(v),
  "Imagem inválida.",
);
export const productSchema = z.object({
  id: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "Use letras minúsculas, números e hífens.").max(60, "Use no máximo 60 caracteres."),
  name: text(2, 60, "Informe o nome do sabor."),
  description: z.string().trim().max(240, "Use no máximo 240 caracteres.").refine(v => !/[\u0000-\u001f\u007f]/.test(v), "Remova os caracteres de controle."),
  image: imageSource,
  priceInCents: z.number({ error: "Informe um preço válido." }).int("Informe um preço válido.").min(0, "Informe um preço válido.").max(1000000, "Preço acima do limite."),
  unitLabel: text(1, 20, "Informe a unidade (ex.: 100 g)."),
  category: text(2, 30, "Informe a categoria."),
  tone: z.enum(toneIds),
  stock: z.number({ error: "Informe o estoque." }).int("Use um número inteiro.").min(0, "O estoque não pode ser negativo.").max(MAX_STOCK, "Estoque acima do limite."),
  lowStock: z.number({ error: "Informe o alerta." }).int("Use um número inteiro.").min(0, "Use zero ou mais.").max(MAX_STOCK, "Valor acima do limite."),
  active: z.boolean(),
  featured: z.boolean(),
  sort: z.number().int().min(0).max(100000),
}).strict();

export function parseProducts(value: unknown): Product[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const list: Product[] = [];
  for (const candidate of value.slice(0, 500)) {
    const parsed = productSchema.safeParse(candidate);
    if (!parsed.success || seen.has(parsed.data.id)) continue;
    seen.add(parsed.data.id);
    list.push(toProduct(parsed.data));
  }
  return sortProducts(list);
}
export const sortProducts = <T extends ProductData>(list: readonly T[]): T[] => [...list].sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name, "pt-BR"));

/** Remove os campos derivados, deixando só o que é gravado. */
export function toData(product: Product): ProductData {
  const data: Partial<Product> = { ...product };
  delete data.slug;
  delete data.available;
  return data as ProductData;
}

/** "4,90", "4.9" ou "1.234,50" → centavos. `NaN` quando não é um valor. */
export function parsePrice(value: string): number {
  const clean = value.replace(/[^\d.,]/g, "");
  const normalized = clean.includes(",") ? clean.replace(/\./g, "").replace(",", ".") : clean;
  return normalized === "" ? NaN : Math.round(Number(normalized) * 100);
}

export function slugify(name: string): string {
  return name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);
}

/* ---------- Catálogo vivo (loja + carrinho) ---------- */

/**
 * Com o Supabase configurado, a loja começa vazia e espera o banco: nunca mostra os preços
 * demonstrativos como se fossem os oficiais. Sem Supabase, usa o catálogo inicial.
 */
export const initialCatalog: readonly Product[] = supabaseConfig ? [] : seedProducts;
let current: readonly Product[] = initialCatalog;
if (supabaseConfig) productById.clear();
let ready = false;
let failure = "";
const listeners = new Set<() => void>();
const emit = () => listeners.forEach(listener => listener());

export const getCatalog = () => current;
export const isCatalogReady = () => ready;
export const getCatalogError = () => failure;
export function subscribeCatalog(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; }
/** Substitui o catálogo em uso. `null` mantém o catálogo atual e apenas sinaliza que o carregamento terminou. */
export function setCatalog(next: readonly Product[] | null) {
  if (next) {
    current = sortProducts(next);
    productById.clear();
    for (const product of current) productById.set(product.id, product);
  }
  ready = true;
  failure = "";
  emit();
}
/** O carregamento falhou: a loja mostra o aviso e o carrinho guardado não é tocado. */
export function setCatalogError(message: string) {
  failure = message;
  emit();
}

/* ---------- Fontes de dados ---------- */

export const LOCAL_CATALOG_KEY = "becal:catalog:v1";
export interface LocalCatalog { products: Product[]; movements: StockMovement[] }

export function readLocalCatalog(): LocalCatalog | null {
  try {
    const raw = localStorage.getItem(LOCAL_CATALOG_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as { products?: unknown; movements?: unknown };
    const movements = Array.isArray(data.movements) ? (data.movements as StockMovement[]).filter(m => m && typeof m.id === "string" && typeof m.delta === "number").slice(0, 300) : [];
    return { products: parseProducts(data.products), movements };
  } catch { return null; }
}
export function writeLocalCatalog(data: LocalCatalog) {
  localStorage.setItem(LOCAL_CATALOG_KEY, JSON.stringify({
    products: data.products.map(toData),
    movements: data.movements.slice(0, 300),
  }));
}

/**
 * Linha da tabela public.products (supabase/migrations). No banco, `available` é a
 * visibilidade na loja (no app, `active`); `available` do app é derivado do estoque.
 */
export interface ProductRow {
  id: string; name: string; description: string; image: string; price_in_cents: number; unit_label: string;
  category: string; tone: string; stock: number; low_stock: number; available: boolean; featured: boolean; sort_order: number;
}
export const PRODUCT_COLUMNS = "id,name,description,image,price_in_cents,unit_label,category,tone,stock,low_stock,available,featured,sort_order";
/** Colunas da primeira versão do banco, antes do controle de estoque. */
const LEGACY_COLUMNS = "id,name,description,image,price_in_cents,unit_label,category,tone,available,featured,sort_order";
export const fromRow = (row: ProductRow) => ({
  id: row.id, name: row.name, description: row.description, image: row.image, priceInCents: row.price_in_cents, unitLabel: row.unit_label,
  category: row.category, tone: row.tone, stock: row.stock, lowStock: row.low_stock, active: row.available, featured: row.featured, sort: row.sort_order,
});
export const toRow = (p: ProductData): ProductRow => ({
  id: p.id, name: p.name, description: p.description, image: p.image, price_in_cents: p.priceInCents, unit_label: p.unitLabel,
  category: p.category, tone: p.tone, stock: p.stock, low_stock: p.lowStock, available: p.active, featured: p.featured, sort_order: p.sort,
});

async function readProducts(columns: string) {
  return fetch(`${supabaseConfig!.url}/rest/v1/products?select=${columns}&available=eq.true&order=sort_order.asc,name.asc`, {
    headers: { apikey: supabaseConfig!.key, Authorization: `Bearer ${supabaseConfig!.key}` },
    signal: AbortSignal.timeout(15000),
  });
}

/**
 * Catálogo publicado para a loja. Com Supabase: leitura pública via REST (sem carregar o SDK).
 * Sem Supabase: alterações feitas pelo painel neste navegador, se existirem.
 * Retorna `null` para manter o catálogo inicial.
 */
export async function fetchPublishedCatalog(): Promise<Product[] | null> {
  if (!supabaseConfig) return readLocalCatalog()?.products ?? null;
  let response = await readProducts(PRODUCT_COLUMNS);
  if (response.status === 400 && ((await response.clone().json().catch(() => null)) as { code?: string } | null)?.code === "42703") {
    // Banco ainda sem a migração de estoque: a loja segue vendendo sem limite de estoque.
    response = await readProducts(LEGACY_COLUMNS);
    if (!response.ok) throw new Error(`Catálogo indisponível (${response.status}).`);
    const legacy = (await response.json()) as Omit<ProductRow, "stock" | "low_stock">[];
    return parseProducts(legacy.map(row => fromRow({ ...row, stock: 99, low_stock: 0 })));
  }
  if (!response.ok) throw new Error(`Catálogo indisponível (${response.status}).`);
  return parseProducts(((await response.json()) as ProductRow[]).map(fromRow));
}
