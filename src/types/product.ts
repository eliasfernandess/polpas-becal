export const toneIds = ["pink", "red", "yellow", "peach", "lime", "sage", "purple", "sand"] as const;
export type Tone = (typeof toneIds)[number];

/** Campos editáveis de um produto (o que o painel administrativo grava). */
export interface ProductData {
  id: string;
  name: string;
  description: string;
  image: string;
  priceInCents: number;
  unitLabel: string;
  category: string;
  tone: Tone;
  /** Unidades em estoque. */
  stock: number;
  /** A partir de quantas unidades o painel avisa "estoque baixo". */
  lowStock: number;
  /** Produto visível na loja. */
  active: boolean;
  featured: boolean;
  sort: number;
  /** Preço por quantidade: a partir de `bulkMin` unidades, cada uma sai por `bulkPriceInCents`. 0 = sem. */
  bulkMin: number;
  bulkPriceInCents: number;
}

/* ---------- Kits ---------- */

export interface KitItem { id: string; quantity: number }
export interface KitData {
  id: string;
  name: string;
  description: string;
  image: string;
  priceInCents: number;
  items: KitItem[];
  active: boolean;
  featured: boolean;
  sort: number;
}
export interface Kit extends KitData {
  /** Derivado: visível e com estoque de todos os sabores. */
  available: boolean;
  /** Quantos kits o estoque atual permite montar. */
  maxUnits: number;
  /** Quanto custaria comprar os sabores avulsos. */
  regularInCents: number;
}

/* ---------- Entrega ---------- */

export interface DeliveryZone { id: string; city: string; district: string; feeCents: number; active: boolean; sort: number }
export interface StoreSettings { deliveryEnabled: boolean; pickupEnabled: boolean; minOrderCents: number }

export interface Product extends ProductData {
  slug: string;
  /** Derivado: visível na loja e com estoque. */
  available: boolean;
}

export interface CartItem { id: string; quantity: number }

export type MovementReason = "Produção" | "Reposição" | "Devolução" | "Venda" | "Perda ou vencimento" | "Evento ou degustação" | "Inventário" | "Cadastro";

export interface StockMovement {
  id: string;
  productId: string;
  productName: string;
  delta: number;
  stockAfter: number;
  reason: string;
  note: string;
  /** Quem registrou (vazio no modo demonstração e em registros antigos). */
  actor?: string;
  createdAt: string;
}

/* ---------- Pedidos e orçamentos registrados pelo site ---------- */

export type OrderStatus = "pending_whatsapp" | "contacted" | "confirmed" | "cancelled";
export interface OrderItem {
  id: string; name: string; unitLabel: string; priceInCents: number; quantity: number;
  /** Ausente em pedidos antigos (= produto). */
  kind?: "product" | "kit";
  components?: { id: string; name: string; quantity: number }[];
}
export interface OrderRecord {
  id: string;
  createdAt: string;
  status: OrderStatus;
  items: OrderItem[];
  totalInCents: number;
  /** null: retirada, taxa a combinar ou pedido antigo. */
  deliveryFeeCents: number | null;
  customerName: string;
  customerPhone: string;
  /** "nao_informado": pedidos feitos antes do checkout com dados do cliente. */
  fulfillment: "entrega" | "retirada" | "nao_informado";
  address: { postalCode: string; street: string; number: string; complement: string; district: string; city: string };
}
export type QuoteStatus = "pending_whatsapp" | "contacted" | "quoted" | "confirmed" | "cancelled";
export interface QuoteRecord {
  id: string;
  createdAt: string;
  status: QuoteStatus;
  name: string;
  phone: string;
  type: string;
  date: string;
  time: string;
  guests: string;
  location: string;
  duration: string;
  notes: string;
}

/** admin: produtos, preços, estoque e equipe. estoque: consulta e lança movimentações e vendas. */
export type Role = "admin" | "estoque";
export interface TeamMember { id: string; name: string; email: string; role: Role; self: boolean }
export interface TeamInvite { email: string; name: string; role: Role; createdAt: string }
export interface Team { members: TeamMember[]; invites: TeamInvite[] }
