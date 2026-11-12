import Link from "next/link";
import { ArrowUpRight } from "lucide-react";

export function FoodbikeBanner() {
  return <section className="event-banner container">
    <div className="event-banner-copy">
      <span className="eyebrow">Momentos com mais sabor</span>
      <h2>Seu evento merece uma dose de <em>frescor.</em></h2>
      <p>Conheça a foodbike da Polpas Becal e descubra as possibilidades para o seu próximo encontro.</p>
      <Link href="/eventos/#orcamento" className="button button-sun">Quero uma foodbike no meu evento <ArrowUpRight size={17} /></Link>
    </div>
    <div className="event-banner-art">
      <img src="/images/events/foodbike.webp" srcSet="/images/events/foodbike-800.webp 800w, /images/events/foodbike.webp 1600w" sizes="(max-width: 900px) calc(100vw - 40px), 540px" alt="Foodbike Polpas Becal verde e amarela com frutas e liquidificador" width="1600" height="900" loading="lazy" />
    </div>
  </section>;
}
