import { z } from "zod";
import { productById, seedProducts, toProduct } from "@/data/products";
import { toneIds, type Product, type ProductData, type StockMovement } from "@/types/product";

/* ---------- Validação ---------- */

export const MAX_STOCK = 100000;
const text = (min: number, max: number, message: string) =>
  z.string().trim().min(min, message).max(max, `Use no máximo ${max} caracteres.`).refine(v => !/[\u0000-\u001f\u007f]/.test(v), "Remova os caracteres de controle.");
/** Caminho local, URL https ou imagem embutida (modo demonstração). Nunca outros esquemas. */
const imageSource = z.string().max(400000, "Imagem grande demais.").refine(
  v => v === "" || /^\/images\/[\w./-]+$/.test(v) || /^https:\/\/[^\s"'<>]+$/.test(v) || /^data:image\/(webp|png|jpeg);base64,[A-Za-z0-9+/=]+$/.test(v),
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

let current: readonly Product[] = seedProducts;
let ready = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach(listener => listener());

export const getCatalog = () => current;
export const isCatalogReady = () => ready;
export function subscribeCatalog(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; }
/** Substitui o catálogo em uso. `null` mantém o catálogo inicial e apenas sinaliza que o carregamento terminou. */
export function setCatalog(next: readonly Product[] | null) {
  if (next) {
    current = sortProducts(next);
    productById.clear();
    for (const product of current) productById.set(product.id, product);
  }
  ready = true;
  emit();
}

/* ---------- Fontes de dados ---------- */

const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/+$/, "") || "";
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
export const supabaseConfig = /^https:\/\/[\w.-]+$/.test(url) && anonKey ? { url, anonKey } : null;

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

export interface ProductRow {
  id: string; name: string; description: string; image: string; price_cents: number; unit_label: string;
  category: string; tone: string; stock: number; low_stock: number; active: boolean; featured: boolean; sort: number;
}
export const PRODUCT_COLUMNS = "id,name,description,image,price_cents,unit_label,category,tone,stock,low_stock,active,featured,sort";
export const fromRow = (row: ProductRow) => ({
  id: row.id, name: row.name, description: row.description, image: row.image, priceInCents: row.price_cents, unitLabel: row.unit_label,
  category: row.category, tone: row.tone, stock: row.stock, lowStock: row.low_stock, active: row.active, featured: row.featured, sort: row.sort,
});
export const toRow = (p: ProductData): ProductRow => ({
  id: p.id, name: p.name, description: p.description, image: p.image, price_cents: p.priceInCents, unit_label: p.unitLabel,
  category: p.category, tone: p.tone, stock: p.stock, low_stock: p.lowStock, active: p.active, featured: p.featured, sort: p.sort,
});

/**
 * Catálogo publicado para a loja. Com Supabase: leitura pública via REST (sem carregar o SDK).
 * Sem Supabase: alterações feitas pelo painel neste navegador, se existirem.
 * Retorna `null` para manter o catálogo inicial.
 */
export async function fetchPublishedCatalog(): Promise<Product[] | null> {
  if (!supabaseConfig) return readLocalCatalog()?.products ?? null;
  const response = await fetch(`${supabaseConfig.url}/rest/v1/products?select=${PRODUCT_COLUMNS}&active=eq.true&order=sort.asc,name.asc`, {
    headers: { apikey: supabaseConfig.anonKey, Authorization: `Bearer ${supabaseConfig.anonKey}` },
  });
  if (!response.ok) throw new Error(`Catálogo indisponível (${response.status}).`);
  return parseProducts(((await response.json()) as ProductRow[]).map(fromRow));
}
