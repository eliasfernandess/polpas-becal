import type { Metadata } from "next";
import { KitsSection } from "@/components/kits";
import { ProductCatalog } from "@/components/products";

export const metadata: Metadata = { title: "Nossas polpas", description: "Escolha seus sabores de polpa de fruta Polpas Becal, monte o pedido e receba em casa ou retire." };

export default function ProductsPage() {
  return <main id="conteudo">
    <section className="page-hero container">
      <span className="eyebrow">Um mundo de sabores</span>
      <h1>Natural é ter <em>seus favoritos.</em></h1>
      <p>Clássicos que abraçam a rotina. Combinações que surpreendem. Escolha os seus e coloque mais fruta no seu dia.</p>
    </section>
    <div className="container kits-top"><KitsSection /></div>
    <section className="container catalog" aria-label="Catálogo de polpas">
      <ProductCatalog />
    </section>
    <section className="catalog-help container" data-reveal>
      <h2>Ficou com vontade de criar uma combinação?</h2>
      <p>Escolha mais de um sabor e monte um pedido com a sua cara. Os detalhes da compra são combinados diretamente com a Polpas Becal.</p>
    </section>
  </main>;
}
