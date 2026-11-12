"use client";
import { useState, type CSSProperties } from "react";
import { Check, Minus, Plus } from "lucide-react";
import { productById } from "@/data/products";
import { KIT_PREFIX, roomFor } from "@/lib/cart";
import { money } from "@/lib/money";
import { useCart } from "@/store/cart-store";
import { useCatalog, useKits } from "@/store/catalog-store";
import type { Kit } from "@/types/product";

/** Foto do kit ou, sem foto, as embalagens dos sabores lado a lado. */
export function KitVisual({ kit, size = "card" }: { kit: Kit; size?: "card" | "thumb" }) {
  if (kit.image) return <img className="kit-photo" src={kit.image} alt={size === "card" ? kit.name : ""} width="380" height="380" loading="lazy" />;
  const packs = kit.items.map(i => productById.get(i.id)).filter(p => p?.image).slice(0, size === "card" ? 4 : 3);
  return <div className="kit-mosaic" data-count={packs.length} aria-hidden="true">
    {packs.map(p => <span key={p!.id} className={`tone-${p!.tone}`}><img src={p!.image} alt="" width="160" height="160" loading="lazy" /></span>)}
  </div>;
}

export function KitCard({ kit, index = 0 }: { kit: Kit; index?: number }) {
  useCatalog(); // re-renderiza quando o estoque dos sabores muda
  const id = KIT_PREFIX + kit.id;
  const [wanted, setWanted] = useState(1);
  const [added, setAdded] = useState(false);
  const { items, dispatch, announce } = useCart();
  const room = roomFor(id, items);
  const quantity = Math.min(wanted, Math.max(1, room));
  const saving = kit.regularInCents - kit.priceInCents;
  const units = kit.items.reduce((sum, i) => sum + i.quantity, 0);
  const add = () => {
    dispatch({ type: "add", id, quantity });
    announce(`${quantity}x ${kit.name} adicionado ao pedido.`);
    setAdded(true); setWanted(1);
    setTimeout(() => setAdded(false), 2200);
  };
  return <article className="kit-card" data-available={kit.available} data-reveal style={{ "--reveal-i": index % 3 } as CSSProperties}>
    <div className="kit-visual">
      <KitVisual kit={kit} />
      {saving > 0 && kit.available && <span className="kit-flag">Economize {money(saving)}</span>}
      {!kit.available && <span className="kit-flag is-out">Esgotado</span>}
    </div>
    <div className="kit-info">
      <span className="product-category">Kit · {units} polpas</span>
      <div className="product-title"><h3>{kit.name}</h3><span className="product-price">{money(kit.priceInCents)}</span></div>
      {saving > 0 && <span className="kit-regular">Avulsas sairiam por <s>{money(kit.regularInCents)}</s></span>}
      {kit.description && <p>{kit.description}</p>}
      <ul className="kit-flavors" aria-label="Sabores do kit">
        {kit.items.map(item => { const p = productById.get(item.id); return <li key={item.id}><i className={`tone-dot tone-${p?.tone ?? "sand"}`} aria-hidden="true" />{item.quantity > 1 && `${item.quantity}× `}{p?.name ?? item.id}</li>; })}
      </ul>
      <div className="product-buy">
        {kit.available ? <>
          <div className="stepper">
            <button onClick={() => setWanted(Math.max(1, quantity - 1))} disabled={quantity <= 1} aria-label={`Diminuir quantidade de ${kit.name}`}><Minus size={14} /></button>
            <span aria-label={`Quantidade de ${kit.name}`}>{quantity}</span>
            <button onClick={() => setWanted(quantity + 1)} disabled={quantity >= room} aria-label={`Aumentar quantidade de ${kit.name}`}><Plus size={14} /></button>
          </div>
          <button className={`add-button ${added ? "added" : ""}`} onClick={add} disabled={room === 0} aria-label={`Adicionar ${quantity} ${kit.name} ao carrinho`}>
            {added ? <Check size={16} /> : <Plus size={16} />}<span>{added ? "Adicionado" : room === 0 ? "No limite" : "Adicionar"}</span>
          </button>
        </> : <span className="unavailable">Algum sabor acabou. Volta em breve.</span>}
      </div>
    </div>
  </article>;
}

/** Vitrine de kits. Não aparece quando não há kits ativos. */
export function KitsSection({ heading = true, onlyFeatured = false }: { heading?: boolean; onlyFeatured?: boolean }) {
  const kits = useKits().filter(k => k.active && (!onlyFeatured || k.featured));
  if (!kits.length) return null;
  return <section className="kits" aria-labelledby={heading ? "kits-title" : undefined} aria-label={heading ? undefined : "Kits"}>
    {heading && <div className="section-heading" data-reveal>
      <div><span className="eyebrow">Mais sabor, menos preço</span><h2 id="kits-title">Kits para a <em>semana toda.</em></h2></div>
    </div>}
    <div className="kit-grid">{kits.map((kit, i) => <KitCard key={kit.id} kit={kit} index={i} />)}</div>
  </section>;
}
