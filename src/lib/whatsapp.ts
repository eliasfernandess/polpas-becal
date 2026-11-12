import { business } from "@/data/business";
import { productById as defaultCatalog } from "@/data/products";
import { cartTotal, kitOf, lineTotal, sanitizeCart, unitPrice } from "./cart";
import { money } from "./money";
import { createEventSchema, formatPhone, formatPostalCode, type Checkout, type EventRequest } from "./validation";
import type { CartItem, Product } from "@/types/product";

export function whatsappUrl(message: string, phone: string = business.whatsapp): string {
  if (!/^[+\d()\s-]+$/.test(phone)) throw new Error("Telefone inválido.");
  const digits = phone.replace(/\D/g, "");
  if (!/^[1-9]\d{9,14}$/.test(digits)) throw new Error("Telefone inválido.");
  if (!message.trim() || message.length > 20000) throw new Error("Mensagem inválida.");
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
}

/** Endereço numa linha: "Rua das Frutas, 10, ap. 2 — Centro, Uberlândia — CEP 38400-000". */
export function addressLine(c: Pick<Checkout, "street" | "number" | "complement" | "district" | "city" | "postalCode">): string {
  return `${[c.street, c.number, c.complement].filter(Boolean).join(", ")} — ${c.district}, ${c.city} — CEP ${formatPostalCode(c.postalCode)}`;
}

/**
 * `feeCents`: taxa de entrega (número), a combinar (null) ou não se aplica (undefined).
 */
export function orderMessage(value: CartItem[], productById: ReadonlyMap<string, Product> = defaultCatalog, customer?: Checkout, feeCents?: number | null): string {
  const items = sanitizeCart(value, productById);
  if (!items.length) throw new Error("Seu carrinho está vazio.");
  const subtotal = cartTotal(items, productById);
  const delivery = customer?.fulfillment === "entrega";
  return [
    "Olá, Polpas Becal! Quero fazer este pedido.",
    "", "MEU PEDIDO:", "",
    ...items.map(item => {
      const kit = kitOf(item.id);
      const price = unitPrice(item.id, item.quantity, productById);
      if (kit) {
        const flavors = kit.items.map(i => `${i.quantity}x ${productById.get(i.id)?.name ?? i.id}`).join(", ");
        return `${item.quantity}x ${kit.name} (${flavors}) — ${money(price)} cada — subtotal ${money(lineTotal(item, productById))}`;
      }
      const p = productById.get(item.id)!;
      const bulk = price < p.priceInCents ? " (preço por quantidade)" : "";
      return `${item.quantity}x Polpa de ${p.name} (${p.unitLabel}) — ${money(price)} por unidade${bulk} — subtotal ${money(lineTotal(item, productById))}`;
    }),
    "",
    ...(delivery && feeCents !== undefined ? [
      `Subtotal: ${money(subtotal)}`,
      feeCents === null ? "Taxa de entrega: a combinar" : `Taxa de entrega: ${feeCents === 0 ? "grátis" : money(feeCents)}`,
    ] : []),
    `TOTAL: ${money(subtotal + (delivery && feeCents ? feeCents : 0))}`,
    ...(customer ? [
      "", "MEUS DADOS:", `Nome: ${customer.name}`, `Telefone: ${formatPhone(customer.phone)}`,
      delivery ? `Entrega: ${addressLine(customer)}` : "Retirada no local",
    ] : []),
    "", customer?.fulfillment === "retirada"
      ? "Poderiam confirmar o pedido e o horário de retirada?"
      : customer ? (feeCents === null ? "Poderiam confirmar o pedido e a taxa de entrega?" : "Poderiam confirmar o pedido e o horário de entrega?")
      : "Poderiam confirmar o pedido e as opções de entrega ou retirada?",
  ].join("\n");
}

export function eventMessage(input: EventRequest, today?: string): string {
  const v = createEventSchema(today).parse(input);
  const date = v.date.split("-").reverse().join("/");
  return [
    "Olá, Polpas Becal!", "", "Gostaria de solicitar um orçamento para uma foodbike.",
    "", "DADOS DO EVENTO:", `Nome: ${v.name}`, `Telefone: ${formatPhone(v.phone)}`, `Tipo: ${v.type}`, `Data: ${date}`,
    ...(v.time ? [`Horário: ${v.time}`] : []),
    `Convidados: ${v.guests}`, `Cidade e local: ${v.location}`,
    ...(v.duration ? [`Duração: ${v.duration}`] : []),
    ...(v.notes ? ["", "OBSERVAÇÕES:", v.notes] : []),
    "", "Gostaria de consultar disponibilidade, valores e condições de contratação.",
  ].join("\n");
}
