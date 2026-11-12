"use client";
import { useEffect, useRef } from "react";
import Link from "next/link";
import { ArrowRight, Minus, Plus, ShoppingBag, Trash2, X } from "lucide-react";
import { OrderCheckout } from "@/components/order-checkout";
import { productById } from "@/data/products";
import { cartTotal, maxQuantityFor, sanitizeCart } from "@/lib/cart";
import { money } from "@/lib/money";
import { useCart } from "@/store/cart-store";

export function CartDrawer() {
  const { items: stored, open, setOpen, dispatch } = useCart();
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
  // Mostra apenas o que ainda existe e tem estoque no catálogo atual.
  const items = sanitizeCart(stored);
  const total = cartTotal(items);
  return <dialog ref={ref} className="cart-dialog" aria-labelledby="cart-title" onCancel={() => setOpen(false)}>
    <div className="cart-panel">
      <div className="cart-heading">
        <div><span className="eyebrow">Seus sabores favoritos</span><h2 id="cart-title">Meu pedido</h2></div>
        <button className="icon-button" aria-label="Fechar carrinho" onClick={() => setOpen(false)}><X /></button>
      </div>
      {items.length ? <>
        <div className="cart-items">{items.map(item => {
          const product = productById.get(item.id)!;
          return <article key={item.id} className={`cart-item tone-${product.tone}`}>
            <div className="cart-image">{product.image && <img src={product.image} alt={`Polpa de ${product.name}`} width="78" height="78" />}</div>
            <div className="cart-item-info">
              <h3>{product.name}</h3>
              <p>{product.unitLabel} · {money(product.priceInCents)} / un.</p>
              <div className="stepper">
                <button aria-label={`Diminuir ${product.name}`} onClick={() => dispatch({ type: "set", id: item.id, quantity: item.quantity - 1 })}><Minus size={14} /></button>
                <span aria-live="polite">{item.quantity}</span>
                <button disabled={item.quantity >= maxQuantityFor(item.id)} aria-label={`Aumentar ${product.name}`} onClick={() => dispatch({ type: "set", id: item.id, quantity: item.quantity + 1 })}><Plus size={14} /></button>
              </div>
            </div>
            <div className="cart-item-end">
              <strong>{money(product.priceInCents * item.quantity)}</strong>
              <button className="icon-button" aria-label={`Remover ${product.name}`} onClick={() => dispatch({ type: "remove", id: item.id })}><Trash2 size={17} /></button>
            </div>
          </article>;
        })}</div>
        <div className="cart-checkout">
          <div className="cart-total"><span>Total estimado</span><strong>{money(total)}</strong></div>
          <p>Catálogo demonstrativo. Disponibilidade, valor final, entrega ou retirada serão combinados com a equipe.</p>
          <OrderCheckout />
          <button className="text-button" onClick={() => setOpen(false)}>Continuar escolhendo</button>
        </div>
      </> : <div className="empty-cart">
        <span className="empty-icon"><ShoppingBag size={32} /></span>
        <h3>Tem espaço para muito sabor.</h3>
        <p>Escolha suas polpas favoritas para começar o seu pedido.</p>
        <Link href="/produtos/" className="button button-primary" onClick={() => setOpen(false)}>Explorar os sabores <ArrowRight size={16} /></Link>
      </div>}
    </div>
  </dialog>;
}
