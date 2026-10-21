import { business } from "@/data/business";
import { productById } from "@/data/products";
import { cartTotal, sanitizeCart } from "./cart";
import { money } from "./money";
import { createEventSchema, type EventRequest } from "./validation";
import type { CartItem } from "@/types/product";
export function whatsappUrl(message: string, phone: string = business.whatsapp): string {
  if (!/^[+\d()\s-]+$/.test(phone)) throw new Error("Telefone inválido.");
  const digits = phone.replace(/\D/g, "");
  if (!/^[1-9]\d{9,14}$/.test(digits)) throw new Error("Telefone inválido.");
  if (!message.trim() || message.length > 20000) throw new Error("Mensagem inválida.");
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
}
export function orderMessage(value: CartItem[]): string {
  const items = sanitizeCart(value);
  if (!items.length) throw new Error("Seu carrinho está vazio.");
  return [
    "Olá, Polpas Becal! Gostaria de consultar este pedido.",
    "", "MEU PEDIDO (CATÁLOGO DEMONSTRATIVO):", "",
    ...items.map(item => {
      const p = productById.get(item.id)!;
      return `${item.quantity}x Polpa de ${p.name} (${p.unitLabel}) — ${money(p.priceInCents)} por unidade — subtotal ${money(p.priceInCents * item.quantity)}`;
    }),
    "", `TOTAL ESTIMADO: ${money(cartTotal(items))}`,
    "Valores e unidades demonstrativos, sujeitos a confirmação.",
    "", "Poderiam confirmar os sabores disponíveis, os preços oficiais e as opções de entrega ou retirada?",
  ].join("\n");
}
export function eventMessage(input: EventRequest, today?: string): string {
  const v = createEventSchema(today).parse(input);
  const date = v.date.split("-").reverse().join("/");
  return [
    "Olá, Polpas Becal!", "", "Gostaria de solicitar um orçamento para uma foodbike.",
    "", "DADOS DO EVENTO:", `Nome: ${v.name}`, `Tipo: ${v.type}`, `Data: ${date}`,
    ...(v.time ? [`Horário: ${v.time}`] : []),
    `Convidados: ${v.guests}`, `Cidade e local: ${v.location}`,
    ...(v.duration ? [`Duração: ${v.duration}`] : []),
    ...(v.notes ? ["", "OBSERVAÇÕES:", v.notes] : []),
    "", "Gostaria de consultar disponibilidade, valores e condições de contratação.",
  ].join("\n");
}

