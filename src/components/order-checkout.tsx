"use client";
import { useRef, useState } from "react";
import { ArrowRight, MessageCircle } from "lucide-react";
import { cartTotal, sanitizeCart } from "@/lib/cart";
import { saveOrder } from "@/lib/submissions";
import { supabaseConfigured } from "@/lib/supabase";
import { orderMessage, whatsappUrl } from "@/lib/whatsapp";
import { useCart } from "@/store/cart-store";

/**
 * Com o banco configurado, o pedido é registrado primeiro (para a equipe acompanhar) e o
 * WhatsApp abre com a referência. Sem banco, vai direto para o WhatsApp.
 */
export function OrderCheckout() {
  const { items: stored } = useCart();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState<{ signature: string; id: string } | null>(null);
  const attempt = useRef<{ signature: string; id: string } | null>(null);
  const busy = useRef(false);
  const items = sanitizeCart(stored);
  const total = cartTotal(items);
  const signature = JSON.stringify({ items, total });
  const current = saved?.signature === signature ? saved : null;

  async function submit() {
    if (busy.current) return;
    busy.current = true; setPending(true); setError("");
    // Mesmo carrinho, mesma tentativa: repetir não duplica o pedido.
    if (attempt.current?.signature !== signature) attempt.current = { signature, id: crypto.randomUUID() };
    const request = attempt.current;
    try { await saveOrder(request.id, items, total); setSaved(request); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível registrar. Tente novamente."); }
    finally { busy.current = false; setPending(false); }
  }

  const message = orderMessage(items) + (current ? `\n\nReferência do pedido: ${current.id}` : "");
  return <>
    {supabaseConfigured && !current
      ? <button type="button" className="button button-primary full" disabled={pending} onClick={submit}>{pending ? "Registrando pedido…" : "Registrar pedido"} <ArrowRight size={16} /></button>
      : <a className="button button-primary full" href={whatsappUrl(message)} target="_blank" rel="noopener noreferrer"><MessageCircle size={18} /> Continuar no WhatsApp <ArrowRight size={16} /></a>}
    {error && <p role="alert" className="form-alert">{error}</p>}
    {current && <p role="status" className="checkout-saved">Pedido registrado. Continue no WhatsApp para combinar os detalhes.</p>}
    <small>{supabaseConfigured
      ? "Ao registrar, salvamos os itens e quantidades para atendimento. A compra depende da confirmação da equipe pelo WhatsApp."
      : "O pedido só será compartilhado quando você enviar a mensagem no WhatsApp."}</small>
  </>;
}
