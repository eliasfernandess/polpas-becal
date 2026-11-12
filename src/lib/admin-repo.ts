import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { seedProducts, toProduct } from "@/data/products";
import { defaultSettings, fromRow, kitFromRow, kitSchema, kitToRow, parseKits, parseProducts, parseSettings, parseZones, PRODUCT_COLUMNS, productSchema, readLocalCatalog, readLocalShop, settingsFromRow, settingsSchema, sortProducts, toData, toKitData, toRow, writeLocalCatalog, writeLocalShop, zoneFromRow, zoneSchema, KIT_COLUMNS, ZONE_COLUMNS, type KitRow, type ProductRow, type SettingsRow, type ZoneRow } from "@/lib/catalog";
import { supabaseConfig } from "@/lib/supabase";
import type { CartItem, DeliveryZone, Kit, KitData, OrderRecord, OrderStatus, Product, ProductData, QuoteRecord, QuoteStatus, Role, StockMovement, StoreSettings, Team, TeamInvite } from "@/types/product";

export const inviteSchema = z.object({
  email: z.string().trim().toLowerCase().max(120, "Use no máximo 120 caracteres.").regex(/^[^@\s]+@[^@\s]+\.[^@\s]+$/, "Informe um e-mail válido."),
  name: z.string().trim().min(2, "Informe o nome da pessoa.").max(60, "Use no máximo 60 caracteres."),
  role: z.enum(["admin", "estoque"]),
}).strict();
export type InviteInput = z.infer<typeof inviteSchema>;

/** Operações do painel. Há duas implementações: Supabase (produção) e navegador (demonstração). */
export interface AdminRepo {
  mode: "supabase" | "local";
  /** Papel de quem está usando o painel. */
  role: Role;
  list(): Promise<Product[]>;
  create(data: ProductData): Promise<Product>;
  update(id: string, data: ProductData): Promise<Product>;
  remove(id: string): Promise<void>;
  /** Soma `delta` ao estoque, registra a movimentação e devolve o novo saldo. */
  adjustStock(id: string, delta: number, reason: string, note: string): Promise<number>;
  /** Baixa vários itens de uma vez como "Venda": ou todos, ou nenhum. */
  recordSale(items: CartItem[], note: string): Promise<void>;
  movements(): Promise<StockMovement[]>;
  /** Guarda a imagem já otimizada e devolve o endereço a salvar no produto. */
  uploadImage(image: Blob, productId: string): Promise<string>;
  team(): Promise<Team>;
  invite(input: InviteInput): Promise<void>;
  revokeInvite(email: string): Promise<void>;
  setRole(memberId: string, role: Role): Promise<void>;
  removeMember(memberId: string): Promise<void>;
  /** Troca a senha da conta atual. `null` quando não há conta (demonstração). */
  changePassword: ((password: string) => Promise<void>) | null;
  /** Pedidos e orçamentos só existem com o Supabase (a loja registra no banco). */
  records: boolean;
  orders(): Promise<OrderRecord[]>;
  /** Novo, em contato ou cancelado. "Confirmado" só por confirmOrder, que baixa o estoque. */
  setOrderStatus(id: string, status: Exclude<OrderStatus, "confirmed">): Promise<void>;
  confirmOrder(id: string): Promise<void>;
  quotes(): Promise<QuoteRecord[]>;
  setQuoteStatus(id: string, status: QuoteStatus): Promise<void>;
  /** Kits, bairros de entrega e regras da loja. */
  kits(products: Product[]): Promise<Kit[]>;
  saveKit(data: KitData, isNew: boolean): Promise<void>;
  removeKit(id: string): Promise<void>;
  zones(): Promise<DeliveryZone[]>;
  saveZone(data: DeliveryZone, isNew: boolean): Promise<void>;
  removeZone(id: string): Promise<void>;
  settings(): Promise<StoreSettings>;
  saveSettings(data: StoreSettings): Promise<void>;
}

const validate = (data: ProductData) => productSchema.parse(data);
const cleanNote = (note: string) => note.trim().slice(0, 200);
function checkSale(items: CartItem[]) {
  if (!items.length || items.length > 100) throw new Error("Escolha ao menos um produto.");
  if (items.some(item => !Number.isInteger(item.quantity) || item.quantity <= 0)) throw new Error("Quantidade inválida.");
}

/* ---------- Demonstração: dados apenas neste navegador ---------- */

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Não foi possível ler a imagem."));
    reader.readAsDataURL(blob);
  });
}

const LOCAL_TEAM_KEY = "becal:team:v1";
function readLocalInvites(): TeamInvite[] {
  try {
    const raw = JSON.parse(localStorage.getItem(LOCAL_TEAM_KEY) || "[]") as unknown;
    if (!Array.isArray(raw)) return [];
    return raw.flatMap(item => {
      const parsed = inviteSchema.safeParse({ email: item?.email, name: item?.name, role: item?.role });
      return parsed.success ? [{ ...parsed.data, createdAt: typeof item.createdAt === "string" ? item.createdAt : new Date().toISOString() }] : [];
    }).slice(0, 50);
  } catch { return []; }
}

export function createLocalRepo(): AdminRepo {
  const read = () => readLocalCatalog() ?? { products: [...seedProducts], movements: [] };
  const movement = (product: ProductData, delta: number, reason: string, note: string): StockMovement => ({
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, productId: product.id, productName: product.name,
    delta, stockAfter: product.stock, reason, note: cleanNote(note), createdAt: new Date().toISOString(),
  });
  const save = (products: Product[], movements: StockMovement[]) => {
    try { writeLocalCatalog({ products: sortProducts(products), movements }); }
    catch { throw new Error("O navegador recusou salvar os dados (armazenamento cheio ou bloqueado)."); }
  };
  const saveInvites = (invites: TeamInvite[]) => {
    try { localStorage.setItem(LOCAL_TEAM_KEY, JSON.stringify(invites)); }
    catch { throw new Error("O navegador recusou salvar os dados (armazenamento cheio ou bloqueado)."); }
  };
  const demoOnly = async () => { throw new Error("Disponível apenas com o Supabase configurado."); };
  const saveShop = (shop: { kits: KitData[]; zones: DeliveryZone[]; settings: StoreSettings }) => {
    try { writeLocalShop(shop); }
    catch { throw new Error("O navegador recusou salvar os dados (armazenamento cheio ou bloqueado)."); }
  };
  return {
    mode: "local",
    role: "admin",
    async list() { return read().products; },
    async create(data) {
      const state = read();
      const product = toProduct(validate(data));
      if (state.products.some(p => p.id === product.id)) throw new Error("Já existe um produto com esse identificador.");
      save([...state.products, product], product.stock > 0 ? [movement(product, product.stock, "Cadastro", "Estoque inicial"), ...state.movements] : state.movements);
      return product;
    },
    async update(id, data) {
      const state = read();
      const previous = state.products.find(p => p.id === id);
      if (!previous) throw new Error("Produto não encontrado.");
      const product = toProduct(validate({ ...data, id, stock: previous.stock }));
      save(state.products.map(p => p.id === id ? product : p), state.movements);
      return product;
    },
    async remove(id) {
      const state = read();
      save(state.products.filter(p => p.id !== id), state.movements);
    },
    async adjustStock(id, delta, reason, note) {
      const state = read();
      const previous = state.products.find(p => p.id === id);
      if (!previous) throw new Error("Produto não encontrado.");
      const stock = previous.stock + delta;
      if (!Number.isInteger(delta) || stock < 0) throw new Error("A saída é maior que o estoque disponível.");
      const product = toProduct(validate({ ...toData(previous), stock }));
      save(state.products.map(p => p.id === id ? product : p), [movement(product, delta, reason, note), ...state.movements]);
      return stock;
    },
    async recordSale(items, note) {
      checkSale(items);
      const state = read();
      const products = [...state.products];
      const created: StockMovement[] = [];
      for (const item of items) {
        const index = products.findIndex(p => p.id === item.id);
        if (index < 0) throw new Error("Produto não encontrado.");
        if (products[index].stock < item.quantity) throw new Error(`Só há ${products[index].stock} un. de ${products[index].name}.`);
        products[index] = toProduct(validate({ ...toData(products[index]), stock: products[index].stock - item.quantity }));
        created.unshift(movement(products[index], -item.quantity, "Venda", note));
      }
      save(products, [...created, ...state.movements]);
    },
    async movements() { return read().movements; },
    uploadImage: blobToDataUrl,
    async team() {
      return { members: [{ id: "demo", name: "Você", email: "modo demonstração", role: "admin", self: true }], invites: readLocalInvites() };
    },
    async invite(input) {
      const invite = inviteSchema.parse(input);
      const invites = readLocalInvites();
      if (invites.some(i => i.email === invite.email)) throw new Error("Já existe um convite para esse e-mail.");
      saveInvites([{ ...invite, createdAt: new Date().toISOString() }, ...invites]);
    },
    async revokeInvite(email) { saveInvites(readLocalInvites().filter(i => i.email !== email)); },
    setRole: demoOnly,
    removeMember: demoOnly,
    changePassword: null,
    records: false,
    async orders() { return []; },
    setOrderStatus: demoOnly,
    confirmOrder: demoOnly,
    async quotes() { return []; },
    setQuoteStatus: demoOnly,
    async kits(products) { return readLocalShop(new Map(products.map(p => [p.id, p]))).kits; },
    async saveKit(data, isNew) {
      const shop = readLocalShop();
      const kit = kitSchema.parse(data);
      if (isNew && shop.kits.some(k => k.id === kit.id)) throw new Error("Já existe um kit com esse identificador.");
      const kits = isNew ? [...shop.kits.map(toKitData), kit] : shop.kits.map(k => k.id === kit.id ? kit : toKitData(k));
      saveShop({ ...shop, kits });
    },
    async removeKit(id) { const shop = readLocalShop(); saveShop({ ...shop, kits: shop.kits.filter(k => k.id !== id).map(toKitData) }); },
    async zones() { return readLocalShop().zones; },
    async saveZone(data, isNew) {
      const shop = readLocalShop();
      const zone = zoneSchema.parse(data);
      const clash = shop.zones.find(z => z.id !== zone.id && z.city.trim().toLowerCase() === zone.city.trim().toLowerCase() && z.district.trim().toLowerCase() === zone.district.trim().toLowerCase());
      if (clash) throw new Error("Esse bairro já está cadastrado.");
      saveShop({ ...shop, zones: isNew ? [...shop.zones, zone] : shop.zones.map(z => z.id === zone.id ? zone : z) });
    },
    async removeZone(id) { const shop = readLocalShop(); saveShop({ ...shop, zones: shop.zones.filter(z => z.id !== id) }); },
    async settings() { return readLocalShop().settings; },
    async saveSettings(data) { const shop = readLocalShop(); saveShop({ ...shop, settings: settingsSchema.parse(data) }); },
  };
}

/* ---------- Supabase ---------- */

let clientPromise: Promise<SupabaseClient> | null = null;
/** Cliente Supabase carregado sob demanda (somente o painel usa o SDK). */
export function getSupabase(): Promise<SupabaseClient> {
  if (!supabaseConfig) return Promise.reject(new Error("Supabase não configurado."));
  clientPromise ??= import("@supabase/supabase-js").then(({ createClient }) => createClient(supabaseConfig!.url, supabaseConfig!.key));
  return clientPromise;
}

const friendly = (error: { message: string; code?: string }, duplicate = "Já existe um produto com esse identificador.") => {
  if (error.code === "23505") return new Error(duplicate);
  if (error.code === "23514") return new Error("Valor fora do permitido (confira estoque, preço e textos).");
  if (error.code === "42501") return new Error("Sua conta não tem permissão para isso.");
  return new Error(error.message || "Não foi possível concluir a operação.");
};
const outdated = () => new Error("O banco ainda não tem a migração de pedidos (supabase/migrations/20261114120000_pedidos_clientes.sql). Aplique-a para ver pedidos e orçamentos.");
interface OrderRow {
  id: string; created_at: string; status: OrderStatus; items: OrderRecord["items"]; total_in_cents: number | string;
  customer_name: string; customer_phone: string; fulfillment: OrderRecord["fulfillment"];
  postal_code: string; street: string; street_number: string; complement: string; district: string; city: string;
  delivery_fee_cents?: number | null;
}
interface QuoteRow {
  id: string; created_at: string; status: QuoteStatus; name: string; customer_phone: string; event_type: string;
  event_date: string; event_time: string | null; guests: string; location: string; duration: string; notes: string;
}
const stockError = (error: { message: string; code?: string }) => error.code === "23514" ? new Error("A saída é maior que o estoque disponível.") : friendly(error);

const OLD_PRODUCT_COLUMNS = PRODUCT_COLUMNS.replace(",bulk_min,bulk_price_in_cents", "");
const selectFor = (payload: object) => "bulk_min" in payload ? PRODUCT_COLUMNS : OLD_PRODUCT_COLUMNS;
/** Banco sem a migração de preço por quantidade: grava sem esses campos, se não estiverem em uso. */
async function withoutBulk<T extends { error: { code?: string; message: string } | null }>(row: Partial<ProductRow>, run: (payload: Partial<ProductRow>) => PromiseLike<T>): Promise<T> {
  const result = await run(row);
  const missing = result.error && (result.error.code === "PGRST204" || result.error.code === "42703");
  if (!missing) return result;
  if (row.bulk_min) throw new Error("O preço por quantidade precisa da migração 20261115120000_entrega_kits.sql no Supabase.");
  const legacy = { ...row };
  delete legacy.bulk_min;
  delete legacy.bulk_price_in_cents;
  return run(legacy);
}
const needsMigration = () => new Error("Para usar kits e entrega, aplique a migração supabase/migrations/20261115120000_entrega_kits.sql no Supabase.");
const missingTable = (error: { code?: string } | null) => error?.code === "42P01" || error?.code === "PGRST205" || error?.code === "PGRST202";

export function createSupabaseRepo(client: SupabaseClient, me: { id: string; role: Role }): AdminRepo {
  const one = (row: ProductRow) => parseProducts([fromRow({ ...row, bulk_min: row.bulk_min ?? 0, bulk_price_in_cents: row.bulk_price_in_cents ?? 0 })])[0];
  return {
    mode: "supabase",
    role: me.role,
    async list() {
      const query = (columns: string) => client.from("products").select(columns).order("sort_order").order("name");
      let { data, error } = await query(PRODUCT_COLUMNS);
      if (error?.code === "42703") ({ data, error } = await query(OLD_PRODUCT_COLUMNS));
      if (error) throw friendly(error);
      return parseProducts((data as unknown as ProductRow[]).map(row => fromRow({ ...row, bulk_min: row.bulk_min ?? 0, bulk_price_in_cents: row.bulk_price_in_cents ?? 0 })));
    },
    async create(input) {
      const { stock, ...row } = toRow(validate(input));
      // O estoque nasce em 0 (padrão do banco) e o inicial entra como movimentação "Cadastro".
      const { data, error } = await withoutBulk(row, payload => client.from("products").insert(payload).select(selectFor(payload)).single());
      if (error) throw friendly(error);
      if (stock > 0) {
        const adjusted = await client.rpc("adjust_stock", { p_product_id: row.id, p_delta: stock, p_reason: "Cadastro", p_note: "Estoque inicial" });
        if (adjusted.error) throw friendly(adjusted.error);
      }
      return one({ ...(data as unknown as ProductRow), stock });
    },
    async update(id, input) {
      // O estoque nunca é gravado por aqui: só muda por movimentações (adjust_stock).
      const row: Partial<ProductRow> = toRow(validate({ ...input, id }));
      delete row.id;
      delete row.stock;
      const { data, error } = await withoutBulk(row, payload => client.from("products").update(payload).eq("id", id).select(selectFor(payload)).single());
      if (error) throw friendly(error);
      return one(data as unknown as ProductRow);
    },
    async remove(id) {
      const { error } = await client.from("products").delete().eq("id", id);
      if (error) throw friendly(error);
    },
    async adjustStock(id, delta, reason, note) {
      const { data, error } = await client.rpc("adjust_stock", { p_product_id: id, p_delta: delta, p_reason: reason, p_note: cleanNote(note) });
      if (error) throw stockError(error);
      return data as number;
    },
    async recordSale(items, note) {
      checkSale(items);
      const { error } = await client.rpc("record_sale", { p_items: items.map(({ id, quantity }) => ({ id, quantity })), p_note: cleanNote(note) });
      if (error) throw stockError(error);
    },
    async movements() {
      const { data, error } = await client.from("stock_movements").select("id,product_id,product_name,delta,stock_after,reason,note,actor,created_at").order("created_at", { ascending: false }).limit(500);
      if (error) throw friendly(error);
      return (data as { id: number; product_id: string; product_name: string; delta: number; stock_after: number; reason: string; note: string; actor: string; created_at: string }[])
        .map(m => ({ id: String(m.id), productId: m.product_id, productName: m.product_name, delta: m.delta, stockAfter: m.stock_after, reason: m.reason, note: m.note, actor: m.actor, createdAt: m.created_at }));
    },
    async uploadImage(image, productId) {
      const path = `${productId}-${Date.now()}.webp`;
      const { error } = await client.storage.from("product-images").upload(path, image, { contentType: "image/webp", cacheControl: "31536000" });
      if (error) throw friendly(error);
      return client.storage.from("product-images").getPublicUrl(path).data.publicUrl;
    },
    async team() {
      const members = await client.from("admins").select("user_id,name,email,role").order("created_at");
      if (members.error) throw friendly(members.error);
      const rows = members.data as { user_id: string; name: string; email: string; role: Role }[];
      const team: Team = { members: rows.map(m => ({ id: m.user_id, name: m.name, email: m.email, role: m.role, self: m.user_id === me.id })), invites: [] };
      if (me.role !== "admin") return team;
      const invites = await client.from("team_invites").select("email,name,role,created_at").order("created_at", { ascending: false });
      if (invites.error) throw friendly(invites.error);
      team.invites = (invites.data as { email: string; name: string; role: Role; created_at: string }[]).map(i => ({ email: i.email, name: i.name, role: i.role, createdAt: i.created_at }));
      return team;
    },
    async invite(input) {
      const { error } = await client.from("team_invites").insert(inviteSchema.parse(input));
      if (error) throw friendly(error, "Já existe um convite para esse e-mail.");
    },
    async revokeInvite(email) {
      const { error } = await client.from("team_invites").delete().eq("email", email);
      if (error) throw friendly(error);
    },
    async setRole(memberId, role) {
      const { data, error } = await client.from("admins").update({ role }).eq("user_id", memberId).select("user_id");
      if (error) throw friendly(error);
      if (!data?.length) throw new Error("Não foi possível alterar esta conta.");
    },
    async removeMember(memberId) {
      const { data, error } = await client.from("admins").delete().eq("user_id", memberId).select("user_id");
      if (error) throw friendly(error);
      if (!data?.length) throw new Error("Não foi possível remover esta conta.");
    },
    records: true,
    async kits(products) {
      const { data, error } = await client.from("kits").select(KIT_COLUMNS).order("sort_order").order("name");
      if (missingTable(error)) return [];
      if (error) throw friendly(error);
      return parseKits((data as KitRow[]).map(kitFromRow), new Map(products.map(p => [p.id, p])));
    },
    async saveKit(data, isNew) {
      const row = kitToRow(kitSchema.parse(data));
      const { error } = isNew ? await client.from("kits").insert(row) : await client.from("kits").update(row).eq("id", row.id);
      if (missingTable(error)) throw needsMigration();
      if (error) throw friendly(error, "Já existe um kit com esse identificador.");
    },
    async removeKit(id) {
      const { error } = await client.from("kits").delete().eq("id", id);
      if (error) throw friendly(error);
    },
    async zones() {
      const { data, error } = await client.from("delivery_zones").select(ZONE_COLUMNS);
      if (missingTable(error)) return [];
      if (error) throw friendly(error);
      return parseZones((data as ZoneRow[]).map(zoneFromRow));
    },
    async saveZone(data, isNew) {
      const zone = zoneSchema.parse(data);
      const row = { city: zone.city, district: zone.district, fee_cents: zone.feeCents, available: zone.active, sort_order: zone.sort };
      const { error } = isNew ? await client.from("delivery_zones").insert(row) : await client.from("delivery_zones").update(row).eq("id", zone.id);
      if (missingTable(error)) throw needsMigration();
      if (error) throw friendly(error, "Esse bairro já está cadastrado.");
    },
    async removeZone(id) {
      const { error } = await client.from("delivery_zones").delete().eq("id", id);
      if (error) throw friendly(error);
    },
    async settings() {
      const { data, error } = await client.from("store_settings").select("delivery_enabled,pickup_enabled,min_order_cents").limit(1);
      if (missingTable(error)) return defaultSettings;
      if (error) throw friendly(error);
      return data?.[0] ? parseSettings(settingsFromRow(data[0] as SettingsRow)) : defaultSettings;
    },
    async saveSettings(input) {
      const value = settingsSchema.parse(input);
      const { data, error } = await client.from("store_settings").update({ delivery_enabled: value.deliveryEnabled, pickup_enabled: value.pickupEnabled, min_order_cents: value.minOrderCents }).eq("id", true).select("id");
      if (missingTable(error)) throw needsMigration();
      if (error) throw friendly(error);
      if (!data?.length) throw new Error("Sua conta não tem permissão para isso.");
    },
    async orders() {
      const columns = "id,created_at,status,items,total_in_cents,customer_name,customer_phone,fulfillment,postal_code,street,street_number,complement,district,city";
      const query = (select: string) => client.from("orders").select(select).order("created_at", { ascending: false }).limit(300);
      let { data, error } = await query(columns + ",delivery_fee_cents");
      if (error?.code === "42703") ({ data, error } = await query(columns));
      if (error) throw error.code === "42703" ? outdated() : friendly(error);
      return (data as unknown as OrderRow[]).map(row => ({
        id: row.id, createdAt: row.created_at, status: row.status, totalInCents: Number(row.total_in_cents),
        items: Array.isArray(row.items) ? row.items : [],
        deliveryFeeCents: row.delivery_fee_cents ?? null,
        customerName: row.customer_name, customerPhone: row.customer_phone, fulfillment: row.fulfillment,
        address: { postalCode: row.postal_code, street: row.street, number: row.street_number, complement: row.complement, district: row.district, city: row.city },
      }));
    },
    async setOrderStatus(id, status) {
      const { data, error } = await client.from("orders").update({ status }).eq("id", id).select("id");
      if (error) throw friendly(error);
      if (!data?.length) throw new Error("Este pedido não pode mais ser alterado.");
    },
    async confirmOrder(id) {
      const { error } = await client.rpc("confirm_order", { p_order_id: id });
      if (error) throw error.code === "23514" ? new Error("Falta estoque para confirmar este pedido. Registre uma entrada e tente de novo.") : friendly(error);
    },
    async quotes() {
      const { data, error } = await client.from("event_requests")
        .select("id,created_at,status,name,customer_phone,event_type,event_date,event_time,guests,location,duration,notes")
        .order("created_at", { ascending: false }).limit(300);
      if (error) throw error.code === "42703" ? outdated() : friendly(error);
      return (data as QuoteRow[]).map(row => ({
        id: row.id, createdAt: row.created_at, status: row.status, name: row.name, phone: row.customer_phone, type: row.event_type,
        date: row.event_date, time: row.event_time?.slice(0, 5) ?? "", guests: row.guests, location: row.location, duration: row.duration, notes: row.notes,
      }));
    },
    async setQuoteStatus(id, status) {
      const { error } = await client.from("event_requests").update({ status }).eq("id", id);
      if (error) throw friendly(error);
    },
    async changePassword(password) {
      const { error } = await client.auth.updateUser({ password });
      if (error) throw new Error(error.message.includes("different") ? "A nova senha precisa ser diferente da atual." : "Não foi possível trocar a senha. Use ao menos 8 caracteres.");
    },
  };
}

/** Reduz a foto escolhida para WebP de até `size` px no maior lado, no próprio navegador. */
export async function optimizeImage(file: File, size: number): Promise<Blob> {
  if (!/^image\/(png|jpeg|webp)$/.test(file.type)) throw new Error("Use uma imagem PNG, JPG ou WebP.");
  if (file.size > 8 * 1024 * 1024) throw new Error("Use uma imagem de até 8 MB.");
  const bitmap = await createImageBitmap(file).catch(() => { throw new Error("Não foi possível abrir a imagem."); });
  const scale = Math.min(1, size / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error("Não foi possível converter a imagem.")), "image/webp", 0.82));
}
