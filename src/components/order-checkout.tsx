"use client";
import { useRef, useState } from "react";
import { MessageCircle, ArrowRight } from "lucide-react";
import { useCart } from "@/store/cart-store";
import { useCatalog } from "@/store/catalog-store";
import { cartTotal } from "@/lib/cart";
import { supabaseConfigured } from "@/lib/supabase";
import { saveOrder } from "@/lib/submissions";
import { orderMessage, whatsappUrl } from "@/lib/whatsapp";
export function OrderCheckout() {
  const { items } = useCart();
  const { productById } = useCatalog();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState<{ signature: string; id: string } | null>(null);
  const attempt = useRef<{ signature: string; id: string } | null>(null);
  const busy = useRef(false);
  const total = cartTotal(items, productById);
  const signature = JSON.stringify({ items, total });
  const current = saved?.signature === signature ? saved : null;
  async function submit() {
    if (busy.current) return;
    busy.current = true; setPending(true); setError("");
    if (attempt.current?.signature !== signature) attempt.current = { signature, id: crypto.randomUUID() };
    const request = attempt.current!;
    try { await saveOrder(request.id, items, total); setSaved(request); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível registrar. Tente novamente."); }
    finally { busy.current = false; setPending(false); }
  }
  const message = orderMessage(items, productById) + (current ? `\n\nReferência do pedido: ${current.id}` : "");
  return <>
    {supabaseConfigured && !current ? <button type="button" className="button button-primary full" disabled={pending} onClick={submit}>{pending ? "Registrando pedido..." : "Registrar pedido"}<ArrowRight size={17} /></button> : <a className="button button-primary full" href={whatsappUrl(message)} target="_blank" rel="noopener noreferrer"><MessageCircle size={19} /> Continuar no WhatsApp <ArrowRight size={17} /></a>}
    {error && <p role="alert" className="form-alert">{error}</p>}
    {current && <p role="status">Pedido registrado. Continue no WhatsApp para combinar os detalhes.</p>}
    <small>{supabaseConfigured ? "Ao registrar, salvamos os itens e quantidades para atendimento. A compra depende da confirmação da equipe pelo WhatsApp." : "O pedido só será compartilhado quando você enviar a mensagem no WhatsApp."}</small>
  </>;
}
