import Link from "next/link";
import { ArrowRight, ArrowUpRight, GlassWater, Leaf, Snowflake, Sun } from "lucide-react";
import { FoodbikeBanner } from "@/components/foodbike";
import { FeaturedProducts } from "@/components/products";
import { business } from "@/data/business";

export default function Home() {
  return <main id="conteudo">
    <section className="hero container">
      <div className="hero-copy">
        <span className="eyebrow"><Leaf size={14} /> Naturalmente, Polpas Becal</span>
        <h1>Da fruta, o melhor. <em>Pra você.</em></h1>
        <p>O sabor natural da fruta, direto para o seu dia. Escolha suas polpas favoritas e faça da rotina um momento mais gostoso.</p>
        <div className="hero-ctas">
          <Link href="/produtos/" className="button button-primary">Encontre seu sabor <ArrowUpRight size={18} /></Link>
          <Link href="/eventos/" className="text-link">Vai fazer um evento? <ArrowRight size={16} /></Link>
        </div>
      </div>
      {/* Composição vertical no computador; horizontal no celular, onde a imagem vem abaixo do texto. */}
      <Link href="/produtos/" className="hero-art" aria-label="Ver todos os sabores">
        <picture>
          <source media="(max-width: 900px)" srcSet="/images/hero/polpas-horizontal-800.webp 800w, /images/hero/polpas-horizontal-1400.webp 1400w" sizes="calc(100vw - 40px)" width="1400" height="933" />
          <img src="/images/hero/polpas-vertical-1100.webp" srcSet="/images/hero/polpas-vertical-640.webp 640w, /images/hero/polpas-vertical-1100.webp 1100w" sizes="(max-width: 1240px) 48vw, 580px" width="1100" height="1326" alt="Polpas Becal de morango, maracujá e limão com as frutas frescas" fetchPriority="high" />
        </picture>
        <span className="hero-stamp" aria-hidden="true"><strong>100%</strong><span>fruta</span></span>
      </Link>
    </section>

    <section className="promises container" aria-label="A essência Polpas Becal">
      <div data-reveal><Leaf strokeWidth={1.6} /><h2>Fruta de verdade</h2><p>Polpas 100% naturais. Sabor em primeiro lugar.</p></div>
      <div data-reveal data-reveal-step="1"><Sun strokeWidth={1.6} /><h2>Um mundo de sabores</h2><p>Dos clássicos às suas novas combinações.</p></div>
      <div data-reveal data-reveal-step="2"><GlassWater strokeWidth={1.6} /><h2>Sua pausa mais gostosa</h2><p>Praticidade para colocar frescor na rotina.</p></div>
    </section>

    <section className="container section">
      <div className="section-heading" data-reveal>
        <div>
          <span className="eyebrow">Escolha, misture, saboreie</span>
          <h2>Qual é o seu <em>sabor?</em></h2>
        </div>
        <Link href="/produtos/" className="text-link">Conheça todas as polpas <ArrowUpRight size={17} /></Link>
      </div>
      <FeaturedProducts />
    </section>

    <section id="sobre" className="essence">
      <div className="container essence-grid">
        <div className="essence-art tone-sage" data-reveal="zoom">
          <img src="/images/products/abacaxi-hortela.webp" alt="Polpa de abacaxi com hortelã Polpas Becal" width="380" height="380" loading="lazy" />
        </div>
        <div className="essence-copy" data-reveal data-reveal-step="1">
          <span className="eyebrow">Nossa essência</span>
          <h2>Coisas boas começam com <em>ingredientes simples.</em></h2>
          <p>Um suco no café da manhã. Uma vitamina depois de um dia cheio. Uma receita para dividir com quem você gosta.</p>
          <p>A Polpas Becal leva o sabor das frutas para esses pequenos momentos. Porque o que é natural combina com a vida de verdade.</p>
          <span className="essence-note"><Snowflake size={18} /> Da polpa ao copo, uma pausa de frescor.</span>
        </div>
      </div>
    </section>

    <div className="section"><FoodbikeBanner /></div>

    <section className="steps container">
      <div data-reveal>
        <span className="eyebrow">Do seu jeito, sem complicação</span>
        <h2>Seu próximo suco começa <em>aqui.</em></h2>
      </div>
      <ol>
        <li data-reveal><span>1</span><div><h3>Encontre seus favoritos</h3><p>Explore as polpas e escolha os sabores e as quantidades.</p></div></li>
        <li data-reveal data-reveal-step="1"><span>2</span><div><h3>Monte seu pedido</h3><p>Confira seu carrinho e o total estimado com tranquilidade.</p></div></li>
        <li data-reveal data-reveal-step="2"><span>3</span><div><h3>Converse com a gente</h3><p>Envie a mensagem no WhatsApp e combine os detalhes.</p></div></li>
      </ol>
    </section>

    <section className="instagram container" data-reveal>
      <p>Um pouco mais de cor no seu feed.</p>
      <a href={business.instagram} target="_blank" rel="noopener noreferrer">{business.instagramHandle} <ArrowUpRight size={18} /></a>
    </section>
  </main>;
}
