import { getPublicClient } from "@/lib/supabase";
import { createEventSchema, type Checkout, type EventRequest } from "@/lib/validation";
import type { CartItem } from "@/types/product";

/** O banco ainda não tem as colunas novas (migração de pedidos não aplicada). */
const missingColumn = (error: { code?: string } | null) => error?.code === "PGRST204" || error?.code === "42703";

export async function saveOrder(id: string, items: CartItem[], total: number, customer: Checkout): Promise<void> {
  const client = await getPublicClient().catch(() => { throw new Error("O registro de pedidos não está disponível."); });
  const base = { id, items, total_in_cents: total };
  const insert = (row: object) => client.from("orders").insert(row).abortSignal(AbortSignal.timeout(15000));
  let { error } = await insert({
    ...base, customer_name: customer.name, customer_phone: customer.phone, fulfillment: customer.fulfillment,
    postal_code: customer.postalCode, street: customer.street, street_number: customer.number,
    complement: customer.complement, district: customer.district, city: customer.city,
  });
  // Até a migração ser aplicada, o pedido é registrado sem os dados do cliente
  // (eles seguem na mensagem do WhatsApp).
  if (missingColumn(error)) ({ error } = await insert(base));
  // Repetir com o mesmo ID aleatório não pode criar outro pedido.
  if (error && error.code !== "23505") throw new Error("Não foi possível registrar o pedido. Confira sua conexão e tente novamente. Se os preços ou o estoque mudaram, atualize a página.");
}

export async function saveEventRequest(id: string, input: EventRequest): Promise<void> {
  const client = await getPublicClient().catch(() => { throw new Error("O registro de orçamentos não está disponível."); });
  const value = createEventSchema().parse(input);
  const base = {
    id, name: value.name, event_type: value.type, event_date: value.date,
    guests: value.guests, location: value.location, event_time: value.time || null,
    duration: value.duration, notes: value.notes,
  };
  const insert = (row: object) => client.from("event_requests").insert(row).abortSignal(AbortSignal.timeout(15000));
  let { error } = await insert({ ...base, customer_phone: value.phone });
  if (missingColumn(error)) ({ error } = await insert(base));
  if (error && error.code !== "23505") throw new Error("Não foi possível registrar a solicitação. Confira sua conexão e tente novamente.");
}
