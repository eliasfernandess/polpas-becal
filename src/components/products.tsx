"use client";
import { useState } from "react";
import { ArrowRight, Check, Minus, Plus, Search, X } from "lucide-react";
import { ALL_CATEGORIES, categoriesOf } from "@/data/products";
import { maxQuantityFor } from "@/lib/cart";
import { money } from "@/lib/money";
import { useCart } from "@/store/cart-store";
import { useCatalog } from "@/store/catalog-store";
import type { Product } from "@/types/product";

export function ProductCard({ product }: { product: Product }) {
  const [wanted, setWanted] = useState(1);
  const [added, setAdded] = useState(false);
  const { items, dispatch, announce } = useCart();
  const inCart = items.find(item => item.id === product.id)?.quantity ?? 0;
  const room = Math.max(0, maxQuantityFor(product.id) - inCart);
  const quantity = Math.min(wanted, Math.max(1, room));
  const lastUnits = product.available && product.stock <= product.lowStock;
  const add = () => {
    dispatch({ type: "add", id: product.id, quantity });
    announce(`${quantity}x ${product.name} adicionado ao pedido.`);
    setAdded(true);
    setWanted(1);
    setTimeout(() => setAdded(false), 2200);
  };
  return <article className={`product-card tone-${product.tone}`} data-available={product.available}>
    <div className="product-visual">
      <span className="product-unit">{product.unitLabel}</span>
      {lastUnits && <span className="product-flag">Últimas {product.stock} un.</span>}
      {!product.available && <span className="product-flag is-out">Esgotado</span>}
      {product.image
        ? <img src={product.image} alt={`Embalagem de polpa de ${product.name} da Polpas Becal`} width="380" height="380" loading="lazy" />
        : <span className="product-initial" aria-hidden="true">{product.name.charAt(0)}</span>}
    </div>
    <div className="product-info">
      <span className="product-category">{product.category}</span>
      <div className="product-title"><h3>{product.name}</h3><span className="product-price">{money(product.priceInCents)}</span></div>
      <p>{product.description}</p>
      <div className="product-buy">
        {product.available ? <>
          <div className="stepper">
            <button onClick={() => setWanted(Math.max(1, quantity - 1))} disabled={quantity <= 1} aria-label={`Diminuir quantidade de ${product.name}`}><Minus size={14} /></button>
            <span aria-label={`Quantidade de ${product.name}`}>{quantity}</span>
            <button onClick={() => setWanted(quantity + 1)} disabled={quantity >= room} aria-label={`Aumentar quantidade de ${product.name}`}><Plus size={14} /></button>
          </div>
          <button className={`add-button ${added ? "added" : ""}`} onClick={add} disabled={room === 0} aria-label={`Adicionar ${quantity} ${product.name} ao carrinho`}>
            {added ? <Check size={16} /> : <Plus size={16} />}<span>{added ? "Adicionado" : room === 0 ? "No limite" : "Adicionar"}</span>
          </button>
        </> : <span className="unavailable">Volta em breve. Consulte no WhatsApp.</span>}
      </div>
    </div>
  </article>;
}

export function FeaturedProducts() {
  const { products } = useCatalog();
  const visible = products.filter(p => p.active);
  const featured = visible.filter(p => p.featured);
  return <div className="product-grid is-featured">{(featured.length ? featured : visible).slice(0, 4).map(p => <ProductCard key={p.id} product={p} />)}</div>;
}

const normalize = (text: string) => text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

export function ProductCatalog() {
  const { products } = useCatalog();
  const visible = products.filter(p => p.active);
  const categories = categoriesOf(visible);
  const [search, setSearch] = useState("");
  const [picked, setPicked] = useState(ALL_CATEGORIES);
  const category = categories.includes(picked) ? picked : ALL_CATEGORIES;
  const filtered = visible.filter(p => (category === ALL_CATEGORIES || p.category === category) && normalize(p.name).includes(normalize(search)));
  return <>
    <div className="catalog-toolbar">
      <div className="filter-tabs" role="group" aria-label="Filtrar por categoria">
        {categories.map(c => <button key={c} aria-pressed={category === c} onClick={() => setPicked(c)}>{c}</button>)}
      </div>
      <div className="search-box">
        <Search size={17} />
        <label className="sr-only" htmlFor="product-search">Buscar sabor</label>
        <input id="product-search" type="search" value={search} onChange={e => setSearch(e.target.value)} placeholder="Qual é o seu sabor?" maxLength={80} />
        {search && <button className="icon-button" aria-label="Limpar busca" onClick={() => setSearch("")}><X size={16} /></button>}
      </div>
    </div>
    <div className="catalog-results" role="status">{filtered.length} {filtered.length === 1 ? "sabor para descobrir" : "sabores para descobrir"}</div>
    {filtered.length
      ? <div className="product-grid">{filtered.map(p => <ProductCard key={p.id} product={p} />)}</div>
      : <div className="no-results">
          <Search size={28} />
          <h3>Esse sabor ainda não está por aqui.</h3>
          <p>Tente outro nome ou explore todas as opções.</p>
          <button className="text-button" onClick={() => { setSearch(""); setPicked(ALL_CATEGORIES); }}>Ver todos os sabores <ArrowRight size={16} /></button>
        </div>}
  </>;
}
