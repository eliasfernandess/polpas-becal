"use client";
import { useState } from "react";
import { Plus, Minus, Check, Search, ArrowRight, SlidersHorizontal, X } from "lucide-react";
import { products, categories } from "@/data/products";
import type { Product } from "@/types/product";
import { useCart } from "@/store/cart-store";
import { money } from "@/lib/money";
import { MAX_QUANTITY } from "@/lib/cart";
export function ProductCard({ product }: { product: Product }) {
  const [quantity, setQuantity] = useState(1);
  const [added, setAdded] = useState(false);
  const { dispatch, announce } = useCart();
  const add = () => {
    dispatch({ type: "add", id: product.id, quantity });
    announce(`${quantity}x ${product.name} adicionado ao pedido.`);
    setAdded(true);
    setTimeout(() => setAdded(false), 2200);
  };
  return <article className="product-card">
    <div className={`product-visual tone-${product.tone}`}><span className="product-category">{product.category}</span><img src={product.image} alt={`Embalagem de polpa de ${product.name} da Polpas Becal`} width="380" height="380" loading="lazy" /><span className="product-weight">{product.unitLabel}</span></div>
    <div className="product-info"><div className="product-title"><h3>{product.name}</h3><span>{money(product.priceInCents)}</span></div><p>{product.description}</p><div className="product-buy">{product.available ? <><div className="stepper"><button onClick={() => setQuantity(Math.max(1, quantity - 1))} disabled={quantity <= 1} aria-label={`Diminuir quantidade de ${product.name}`}><Minus size={14} /></button><span aria-label={`Quantidade de ${product.name}`}>{quantity}</span><button onClick={() => setQuantity(Math.min(MAX_QUANTITY, quantity + 1))} disabled={quantity >= MAX_QUANTITY} aria-label={`Aumentar quantidade de ${product.name}`}><Plus size={14} /></button></div><button className={`add-button ${added ? "added" : ""}`} onClick={add} aria-label={`Adicionar ${quantity} ${product.name} ao carrinho`}>{added ? <Check size={17} /> : <Plus size={17} />}<span>{added ? "Adicionado" : "Adicionar"}</span></button></> : <span className="unavailable">Indisponível na demonstração</span>}</div></div>
  </article>;
}
export function FeaturedProducts() { return <div className="product-grid">{products.filter(p => p.featured).map(p => <ProductCard key={p.id} product={p} />)}</div>; }
const normalize = (text: string) => text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
export function ProductCatalog() {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<string>(categories[0]);
  const filtered = products.filter(p => (category === categories[0] || p.category === category) && normalize(p.name).includes(normalize(search)));
  return <><div className="catalog-toolbar"><div className="filter-tabs" aria-label="Filtrar por categoria">{categories.map(c => <button key={c} aria-pressed={category === c} onClick={() => setCategory(c)}>{c === categories[0] && <SlidersHorizontal size={15} />}{c}</button>)}</div><div className="search-box"><Search size={18} /><label className="sr-only" htmlFor="product-search">Buscar sabor</label><input id="product-search" type="search" value={search} onChange={e => setSearch(e.target.value)} placeholder="Qual é o seu sabor?" maxLength={80} />{search && <button className="icon-button" aria-label="Limpar busca" onClick={() => setSearch("")}><X size={16} /></button>}</div></div><div className="catalog-results" role="status">{filtered.length} {filtered.length === 1 ? "sabor para descobrir" : "sabores para descobrir"}</div>{filtered.length ? <div className="product-grid">{filtered.map(p => <ProductCard key={p.id} product={p} />)}</div> : <div className="no-results"><Search size={30} /><h3>Esse sabor ainda não está por aqui.</h3><p>Tente outro nome ou explore todas as opções.</p><button className="text-button" onClick={() => { setSearch(""); setCategory(categories[0]); }}>Ver todos os sabores <ArrowRight size={16} /></button></div>}</>;
}

