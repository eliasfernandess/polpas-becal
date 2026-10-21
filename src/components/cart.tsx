"use client";
import { useEffect, useRef } from "react";
import Link from "next/link";
import { X, Minus, Plus, Trash2, ShoppingBag, MessageCircle, ArrowRight } from "lucide-react";
import { useCart } from "@/store/cart-store";
import { productById } from "@/data/products";
import { cartTotal, MAX_QUANTITY } from "@/lib/cart";
import { money } from "@/lib/money";
import { orderMessage, whatsappUrl } from "@/lib/whatsapp";
export function CartDrawer() {
  const { items, open, setOpen, dispatch } = useCart();
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (open && dialog && !dialog.open) dialog.showModal();
    if (!open && dialog?.open) dialog.close();
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previous; };
  }, [open]);
  const total = cartTotal(items);
  return <dialog ref={ref} className="cart-dialog" aria-labelledby="cart-title" onCancel={() => setOpen(false)}>
    <div className="cart-panel"><div className="cart-heading"><div><span className="eyebrow">SEUS SABORES FAVORITOS</span><h2 id="cart-title">Meu pedido<span>.</span></h2></div><button className="icon-button" aria-label="Fechar carrinho" onClick={() => setOpen(false)}><X /></button></div>
    {items.length ? <><p className="demo-note compact">Catálogo demonstrativo. Preços e unidades a confirmar.</p><div className="cart-items">{items.map(item => {
      const product = productById.get(item.id)!;
      return <article key={item.id} className="cart-item"><div className={`cart-image tone-${product.tone}`}><img src={product.image} alt={`Polpa de ${product.name}`} width="78" height="78" /></div><div className="cart-item-info"><h3>{product.name}</h3><p>{product.unitLabel} · {money(product.priceInCents)} / un.</p><div className="stepper"><button aria-label={`Diminuir ${product.name}`} onClick={() => dispatch({ type: "set", id: item.id, quantity: item.quantity - 1 })}><Minus size={14} /></button><span aria-live="polite">{item.quantity}</span><button disabled={item.quantity >= MAX_QUANTITY} aria-label={`Aumentar ${product.name}`} onClick={() => dispatch({ type: "set", id: item.id, quantity: item.quantity + 1 })}><Plus size={14} /></button></div></div><div className="cart-item-end"><strong>{money(product.priceInCents * item.quantity)}</strong><button className="icon-button" aria-label={`Remover ${product.name}`} onClick={() => dispatch({ type: "remove", id: item.id })}><Trash2 size={17} /></button></div></article>;
    })}</div><div className="cart-checkout"><div className="cart-total"><span>Total estimado</span><strong>{money(total)}</strong></div><p>Disponibilidade, valor final, entrega ou retirada serão combinados com a equipe.</p><a className="button button-primary full" href={whatsappUrl(orderMessage(items))} target="_blank" rel="noopener noreferrer"><MessageCircle size={19} /> Continuar no WhatsApp <ArrowRight size={17} /></a><small>O pedido só será compartilhado quando você enviar a mensagem no WhatsApp.</small><button className="text-button" onClick={() => setOpen(false)}>Continuar escolhendo</button></div></> : <div className="empty-cart"><span className="empty-icon"><ShoppingBag size={36} /></span><h3>Tem espaço para muito sabor.</h3><p>Escolha suas polpas favoritas para começar o seu pedido.</p><Link href="/produtos/" className="button button-primary" onClick={() => setOpen(false)}>Explorar os sabores <ArrowRight size={17} /></Link></div>}</div>
  </dialog>;
}

