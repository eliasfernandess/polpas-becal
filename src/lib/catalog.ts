import { z } from "zod";
import { kitById, productById, seedProducts, toKit, toProduct } from "@/data/products";
import { supabaseConfig } from "@/lib/supabase";
import { toneIds, type DeliveryZone, type Kit, type KitData, type Product, type ProductData, type StockMovement, type StoreSettings } from "@/types/product";

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
  bulkMin: z.number({ error: "Informe a quantidade mínima." }).int("Use um número inteiro.").refine(v => v === 0 || (v >= 2 && v <= 999), "Use de 2 a 999 unidades."),
  bulkPriceInCents: z.number({ error: "Informe o preço por unidade." }).int("Informe um preço válido.").min(0, "Informe um preço válido.").max(1000000, "Preço acima do limite."),
}).strict().superRefine((p, ctx) => {
  if (p.bulkMin > 0 && !(p.bulkPriceInCents > 0 && p.bulkPriceInCents < p.priceInCents)) {
    ctx.addIssue({ code: "custom", path: ["bulkPriceInCents"], message: "O preço por quantidade precisa ser menor que o preço normal." });
  }
});

const kitItem = z.object({ id: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/), quantity: z.number().int().min(1).max(99) }).strict();
export const kitSchema = z.object({
  id: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "Use letras minúsculas, números e hífens.").max(55, "Use no máximo 55 caracteres."),
  name: text(2, 60, "Informe o nome do kit."),
  description: z.string().trim().max(240, "Use no máximo 240 caracteres.").refine(v => !/[\u0000-\u001f\u007f]/.test(v), "Remova os caracteres de controle."),
  image: imageSource,
  priceInCents: z.number({ error: "Informe um preço válido." }).int("Informe um preço válido.").min(1, "Informe um preço válido.").max(1000000, "Preço acima do limite."),
  items: z.array(kitItem).min(1, "Escolha ao menos um sabor.").max(20, "Use no máximo 20 sabores.")
    .refine(items => new Set(items.map(i => i.id)).size === items.length, "Sabor repetido no kit."),
  active: z.boolean(),
  featured: z.boolean(),
  sort: z.number().int().min(0).max(100000),
}).strict();

export const zoneSchema = z.object({
  id: z.string().min(1).max(60),
  city: text(2, 60, "Informe a cidade."),
  district: text(2, 60, "Informe o bairro."),
  feeCents: z.number({ error: "Informe a taxa." }).int("Informe uma taxa válida.").min(0, "Informe uma taxa válida.").max(100000, "Taxa acima do limite."),
  active: z.boolean(),
  sort: z.number().int().min(0).max(100000),
}).strict();
export const settingsSchema = z.object({
  deliveryEnabled: z.boolean(),
  pickupEnabled: z.boolean(),
  minOrderCents: z.number().int().min(0, "Informe um valor válido.").max(1000000, "Valor acima do limite."),
}).strict().refine(s => s.deliveryEnabled || s.pickupEnabled, { message: "Deixe ao menos entrega ou retirada ligada.", path: ["deliveryEnabled"] });
export const defaultSettings: StoreSettings = { deliveryEnabled: true, pickupEnabled: true, minOrderCents: 0 };

const parseList = <T>(value: unknown, schema: z.ZodType<T>, key: (item: T) => string): T[] => {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  return value.slice(0, 500).flatMap(candidate => {
    const parsed = schema.safeParse(candidate);
    if (!parsed.success || seen.has(key(parsed.data))) return [];
    seen.add(key(parsed.data));
    return [parsed.data];
  });
};
export const parseKits = (value: unknown, products: ReadonlyMap<string, Product> = productById): Kit[] =>
  sortProducts(parseList(value, kitSchema, k => k.id)).map(k => toKit(k, products));
export const parseZones = (value: unknown): DeliveryZone[] =>
  parseList(value, zoneSchema, z => `${z.city.toLowerCase()}|${z.district.toLowerCase()}`)
    .sort((a, b) => a.city.localeCompare(b.city, "pt-BR") || a.sort - b.sort || a.district.localeCompare(b.district, "pt-BR"));
export const parseSettings = (value: unknown): StoreSettings => {
  const parsed = settingsSchema.safeParse(value);
  return parsed.success ? parsed.data : defaultSettings;
};
/** Bairro atendido, ignorando maiúsculas e espaços (a mesma regra do banco). */
export const findZone = (zones: readonly DeliveryZone[], city: string, district: string) =>
  zones.find(z => z.active && z.city.trim().toLowerCase() === city.trim().toLowerCase() && z.district.trim().toLowerCase() === district.trim().toLowerCase());

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
export const sortProducts = <T extends { sort: number; name: string }>(list: readonly T[]): T[] => [...list].sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name, "pt-BR"));

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
 * do catálogo inicial como se fossem os oficiais. Sem Supabase, usa o catálogo inicial.
 */
export const initialCatalog: readonly Product[] = supabaseConfig ? [] : seedProducts;
export const initialKits: readonly Kit[] = [];
let current: readonly Product[] = initialCatalog;
let currentKits: readonly Kit[] = initialKits;
let currentZones: readonly DeliveryZone[] = [];
let currentSettings: StoreSettings = defaultSettings;
if (supabaseConfig) productById.clear();
let ready = false;
let failure = "";
const listeners = new Set<() => void>();
const emit = () => listeners.forEach(listener => listener());

export const getCatalog = () => current;
export const getKits = () => currentKits;
export const getZones = () => currentZones;
export const getSettings = () => currentSettings;
export const isCatalogReady = () => ready;
export const getCatalogError = () => failure;
export function subscribeCatalog(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; }

function indexKits(kits: readonly KitData[]) {
  currentKits = sortProducts(kits).map(k => toKit(k, productById));
  kitById.clear();
  for (const kit of currentKits) kitById.set(kit.id, kit);
}
/** Substitui o catálogo em uso. `null` mantém o catálogo atual e apenas sinaliza que o carregamento terminou. */
export function setCatalog(next: readonly Product[] | null, extras?: Partial<PublishedExtras>) {
  if (next) {
    current = sortProducts(next);
    productById.clear();
    for (const product of current) productById.set(product.id, product);
  }
  // Kits dependem do estoque dos sabores: recalcula sempre.
  indexKits(extras?.kits ?? currentKits);
  if (extras?.zones) currentZones = extras.zones;
  if (extras?.settings) currentSettings = extras.settings;
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
export const LOCAL_SHOP_KEY = "becal:shop:v1";
export interface LocalCatalog { products: Product[]; movements: StockMovement[] }
export interface PublishedExtras { kits: Kit[]; zones: DeliveryZone[]; settings: StoreSettings }

export function readLocalCatalog(): LocalCatalog | null {
  try {
    const raw = localStorage.getItem(LOCAL_CATALOG_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as { products?: unknown; movements?: unknown };
    const movements = Array.isArray(data.movements) ? (data.movements as StockMovement[]).filter(m => m && typeof m.id === "string" && typeof m.delta === "number").slice(0, 300) : [];
    // Produtos gravados antes do preço por quantidade ganham os campos novos.
    const products = Array.isArray(data.products) ? data.products.map(p => ({ bulkMin: 0, bulkPriceInCents: 0, ...(p as object) })) : [];
    return { products: parseProducts(products), movements };
  } catch { return null; }
}
export function writeLocalCatalog(data: LocalCatalog) {
  localStorage.setItem(LOCAL_CATALOG_KEY, JSON.stringify({
    products: data.products.map(toData),
    movements: data.movements.slice(0, 300),
  }));
}
/** Kits, bairros e regras de entrega do modo demonstração (só neste navegador). */
export function readLocalShop(products: ReadonlyMap<string, Product> = productById): PublishedExtras {
  try {
    const data = JSON.parse(localStorage.getItem(LOCAL_SHOP_KEY) || "{}") as { kits?: unknown; zones?: unknown; settings?: unknown };
    return { kits: parseKits(data.kits, products), zones: parseZones(data.zones), settings: parseSettings(data.settings) };
  } catch { return { kits: [], zones: [], settings: defaultSettings }; }
}
export function writeLocalShop(data: { kits: KitData[]; zones: DeliveryZone[]; settings: StoreSettings }) {
  localStorage.setItem(LOCAL_SHOP_KEY, JSON.stringify({ kits: data.kits.map(toKitData), zones: data.zones, settings: data.settings }));
}
export function toKitData(kit: KitData | Kit): KitData {
  const { id, name, description, image, priceInCents, items, active, featured, sort } = kit;
  return { id, name, description, image, priceInCents, items, active, featured, sort };
}

/**
 * Linha da tabela public.products (supabase/migrations). No banco, `available` é a
 * visibilidade na loja (no app, `active`); `available` do app é derivado do estoque.
 */
export interface ProductRow {
  id: string; name: string; description: string; image: string; price_in_cents: number; unit_label: string;
  category: string; tone: string; stock: number; low_stock: number; available: boolean; featured: boolean; sort_order: number;
  bulk_min: number; bulk_price_in_cents: number;
}
export const PRODUCT_COLUMNS = "id,name,description,image,price_in_cents,unit_label,category,tone,stock,low_stock,available,featured,sort_order,bulk_min,bulk_price_in_cents";
/** Versões anteriores do banco: sem preço por quantidade; e, antes disso, sem estoque. */
const STOCK_COLUMNS = "id,name,description,image,price_in_cents,unit_label,category,tone,stock,low_stock,available,featured,sort_order";
const LEGACY_COLUMNS = "id,name,description,image,price_in_cents,unit_label,category,tone,available,featured,sort_order";
export const fromRow = (row: ProductRow) => ({
  id: row.id, name: row.name, description: row.description, image: row.image, priceInCents: row.price_in_cents, unitLabel: row.unit_label,
  category: row.category, tone: row.tone, stock: row.stock, lowStock: row.low_stock, active: row.available, featured: row.featured, sort: row.sort_order,
  bulkMin: row.bulk_min ?? 0, bulkPriceInCents: row.bulk_price_in_cents ?? 0,
});
export const toRow = (p: ProductData): ProductRow => ({
  id: p.id, name: p.name, description: p.description, image: p.image, price_in_cents: p.priceInCents, unit_label: p.unitLabel,
  category: p.category, tone: p.tone, stock: p.stock, low_stock: p.lowStock, available: p.active, featured: p.featured, sort_order: p.sort,
  bulk_min: p.bulkMin, bulk_price_in_cents: p.bulkPriceInCents,
});

export interface KitRow { id: string; name: string; description: string; image: string; price_in_cents: number; items: unknown; available: boolean; featured: boolean; sort_order: number }
export const KIT_COLUMNS = "id,name,description,image,price_in_cents,items,available,featured,sort_order";
export const kitFromRow = (row: KitRow) => ({ id: row.id, name: row.name, description: row.description, image: row.image, priceInCents: row.price_in_cents, items: row.items, active: row.available, featured: row.featured, sort: row.sort_order });
export const kitToRow = (k: KitData): KitRow => ({ id: k.id, name: k.name, description: k.description, image: k.image, price_in_cents: k.priceInCents, items: k.items, available: k.active, featured: k.featured, sort_order: k.sort });
export interface ZoneRow { id: string; city: string; district: string; fee_cents: number; available: boolean; sort_order: number }
export const ZONE_COLUMNS = "id,city,district,fee_cents,available,sort_order";
export const zoneFromRow = (row: ZoneRow) => ({ id: row.id, city: row.city, district: row.district, feeCents: row.fee_cents, active: row.available, sort: row.sort_order });
export interface SettingsRow { delivery_enabled: boolean; pickup_enabled: boolean; min_order_cents: number }
export const settingsFromRow = (row: SettingsRow) => ({ deliveryEnabled: row.delivery_enabled, pickupEnabled: row.pickup_enabled, minOrderCents: row.min_order_cents });

const rest = (path: string) => fetch(`${supabaseConfig!.url}/rest/v1/${path}`, {
  headers: { apikey: supabaseConfig!.key, Authorization: `Bearer ${supabaseConfig!.key}` },
  signal: AbortSignal.timeout(15000),
});
const missingColumn = async (response: Response) =>
  response.status === 400 && ((await response.clone().json().catch(() => null)) as { code?: string } | null)?.code === "42703";

/** Lê os produtos tentando o esquema mais novo primeiro (banco pode estar sem migrações recentes). */
async function fetchProducts(): Promise<Product[]> {
  const query = (columns: string) => rest(`products?select=${columns}&available=eq.true&order=sort_order.asc,name.asc`);
  for (const [columns, fill] of [[PRODUCT_COLUMNS, {}], [STOCK_COLUMNS, { bulk_min: 0, bulk_price_in_cents: 0 }], [LEGACY_COLUMNS, { stock: 99, low_stock: 0, bulk_min: 0, bulk_price_in_cents: 0 }]] as const) {
    const response = await query(columns);
    if (await missingColumn(response)) continue;
    if (!response.ok) throw new Error(`Catálogo indisponível (${response.status}).`);
    return parseProducts(((await response.json()) as ProductRow[]).map(row => fromRow({ ...fill, ...row } as ProductRow)));
  }
  throw new Error("Catálogo indisponível.");
}
/** Kits, bairros e regras. Se o banco ainda não tiver essas tabelas, a loja segue sem eles. */
async function fetchExtras(products: ReadonlyMap<string, Product>): Promise<PublishedExtras> {
  const optional = async <T>(path: string, fallback: T, map: (json: unknown) => T): Promise<T> => {
    try {
      const response = await rest(path);
      return response.ok ? map(await response.json()) : fallback;
    } catch { return fallback; }
  };
  const [kits, zones, settings] = await Promise.all([
    optional(`kits?select=${KIT_COLUMNS}&available=eq.true&order=sort_order.asc,name.asc`, [] as Kit[], json => parseKits((json as KitRow[]).map(kitFromRow), products)),
    optional(`delivery_zones?select=${ZONE_COLUMNS}&available=eq.true`, [] as DeliveryZone[], json => parseZones((json as ZoneRow[]).map(zoneFromRow))),
    optional("store_settings?select=delivery_enabled,pickup_enabled,min_order_cents&limit=1", defaultSettings, json => Array.isArray(json) && json[0] ? parseSettings(settingsFromRow(json[0] as SettingsRow)) : defaultSettings),
  ]);
  return { kits, zones, settings };
}

/**
 * Catálogo publicado para a loja. Com Supabase: leitura pública via REST (sem carregar o SDK).
 * Sem Supabase: alterações feitas pelo painel neste navegador, se existirem.
 * `products: null` mantém o catálogo inicial.
 */
export async function fetchPublishedCatalog(): Promise<{ products: Product[] | null } & PublishedExtras> {
  if (!supabaseConfig) {
    const products = readLocalCatalog()?.products ?? null;
    return { products, ...readLocalShop(new Map((products ?? seedProducts).map(p => [p.id, p]))) };
  }
  const products = await fetchProducts();
  return { products, ...(await fetchExtras(new Map(products.map(p => [p.id, p])))) };
}
