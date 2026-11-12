import type { Metadata } from "next";
import { ProductCatalog } from "@/components/products";

export const metadata: Metadata = { title: "Nossas polpas", description: "Explore os sabores no catálogo demonstrativo da Polpas Becal, escolha quantidades e monte seu pedido pelo WhatsApp." };

export default function ProductsPage() {
  return <main id="conteudo">
    <section className="page-hero container">
      <span className="eyebrow">Um mundo de sabores</span>
      <h1>Natural é ter <em>seus favoritos.</em></h1>
      <p>Clássicos que abraçam a rotina. Combinações que surpreendem. Escolha os seus e coloque mais fruta no seu dia.</p>
    </section>
    <section className="container catalog" aria-label="Catálogo de polpas">
      <ProductCatalog />
      <p className="demo-note">Catálogo demonstrativo: todos os preços, unidades e disponibilidades precisam de confirmação comercial.</p>
    </section>
    <section className="catalog-help container">
      <h2>Ficou com vontade de criar uma combinação?</h2>
      <p>Escolha mais de um sabor e monte um pedido com a sua cara. Os detalhes da compra são combinados diretamente com a Polpas Becal.</p>
    </section>
  </main>;
}
