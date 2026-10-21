import type { Metadata } from "next";
import { Leaf, ArrowDown } from "lucide-react";
import { ProductCatalog } from "@/components/products";
export const metadata: Metadata = { title: "Nossas polpas", description: "Explore dez sabores no catálogo demonstrativo da Polpas Becal, escolha quantidades e monte seu pedido pelo WhatsApp." };
export default function ProductsPage() {
  return <main id="conteudo"><section className="page-hero container"><span className="eyebrow"><Leaf size={15} /> UM MUNDO DE SABORES</span><h1>Natural é ter<br /><em>seus favoritos.</em></h1><p>Clássicos que abraçam a rotina. Combinações que surpreendem.<br />Escolha os seus e coloque mais fruta no seu dia.</p><span className="page-hero-cue"><ArrowDown size={19} /> Escolha. Adicione. Saboreie.</span></section><section className="container catalog-section" aria-label="Catálogo de polpas"><p className="demo-note"><span /> Catálogo demonstrativo · todos os preços, unidades e disponibilidades precisam de confirmação comercial.</p><ProductCatalog /></section><section className="catalog-help container"><h2>Ficou com vontade de criar uma combinação?</h2><p>Escolha mais de um sabor e monte um pedido com a sua cara.</p><span>Os detalhes da compra são combinados diretamente com a Polpas Becal.</span></section></main>;
}

