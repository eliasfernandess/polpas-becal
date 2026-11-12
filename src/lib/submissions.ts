import { getPublicClient } from "@/lib/supabase";
import { createEventSchema, type Checkout, type EventRequest } from "@/lib/validation";
import type { CartItem } from "@/types/product";

/** O banco ainda não tem as colunas novas (migração de pedidos não aplicada). */
const missingColumn = (error: { code?: string } | null) => error?.code === "PGRST204" || error?.code === "42703";

/** Mensagens dos motivos que o banco usa ao recusar um pedido (supabase/migrations). */
const refusals: [RegExp, string][] = [
  [/Outside delivery area/, "Ainda não entregamos nesse bairro. Escolha outro bairro ou a retirada."],
  [/Below minimum order/, "O pedido não atingiu o valor mínimo para entrega. Adicione mais itens ou escolha a retirada."],
  [/Delivery fee changed/, "A taxa de entrega mudou. Atualize a página e confira o total."],
  [/Insufficient stock|Product unavailable/, "Algum item acabou ou mudou de estoque. Atualize a página e confira o carrinho."],
  [/Prices changed/, "Os preços mudaram. Atualize a página e confira o total."],
  [/Delivery unavailable|Pickup unavailable/, "Essa forma de recebimento não está disponível agora. Atualize a página."],
];

/** `feeCents`: taxa do bairro (número) ou null (retirada / a combinar). */
export async function saveOrder(id: string, items: CartItem[], total: number, customer: Checkout, feeCents: number | null = null): Promise<void> {
  const client = await getPublicClient().catch(() => { throw new Error("O registro de pedidos não está disponível."); });
  const base = { id, items, total_in_cents: total };
  const withCustomer = {
    ...base, customer_name: customer.name, customer_phone: customer.phone, fulfillment: customer.fulfillment,
    postal_code: customer.postalCode, street: customer.street, street_number: customer.number,
    complement: customer.complement, district: customer.district, city: customer.city,
  };
  const insert = (row: object) => client.from("orders").insert(row).abortSignal(AbortSignal.timeout(15000));
  // Tenta do esquema mais novo para o mais antigo: banco sem migrações recentes ainda registra o
  // pedido (os dados que faltarem seguem na mensagem do WhatsApp).
  let { error } = await insert({ ...withCustomer, delivery_fee_cents: feeCents });
  if (missingColumn(error)) ({ error } = await insert(withCustomer));
  if (missingColumn(error)) ({ error } = await insert(base));
  // Repetir com o mesmo ID aleatório não pode criar outro pedido.
  if (error && error.code !== "23505") {
    const known = refusals.find(([pattern]) => pattern.test(error!.message ?? ""));
    throw new Error(known ? known[1] : "Não foi possível registrar o pedido. Confira sua conexão e tente novamente. Se os preços ou o estoque mudaram, atualize a página.");
  }
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
