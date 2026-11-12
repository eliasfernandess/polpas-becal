import { supabase } from "@/lib/supabase";
import type { CartItem } from "@/types/product";
import { createEventSchema, type EventRequest } from "@/lib/validation";
export async function saveOrder(id: string, items: CartItem[], total: number): Promise<void> {
  if (!supabase) throw new Error("O registro de pedidos não está disponível.");
  const { error } = await supabase.from("orders").insert({ id, items, total_in_cents: total }).abortSignal(AbortSignal.timeout(15000));
  // A retry with the same random request ID must not create another order.
  if (error && error.code !== "23505") throw new Error("Não foi possível registrar o pedido. Confira sua conexão e tente novamente. Se os preços mudaram, atualize a página.");
}
export async function saveEventRequest(id: string, input: EventRequest): Promise<void> {
  if (!supabase) throw new Error("O registro de orçamentos não está disponível.");
  const value = createEventSchema().parse(input);
  const { error } = await supabase.from("event_requests").insert({
    id, name: value.name, event_type: value.type, event_date: value.date,
    guests: value.guests, location: value.location, event_time: value.time || null,
    duration: value.duration, notes: value.notes,
  }).abortSignal(AbortSignal.timeout(15000));
  if (error && error.code !== "23505") throw new Error("Não foi possível registrar a solicitação. Confira sua conexão e tente novamente.");
}
