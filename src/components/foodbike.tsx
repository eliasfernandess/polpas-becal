import Link from "next/link";
import { ArrowUpRight, Sparkles } from "lucide-react";
export function FoodbikeBanner() {
  return <section className="event-banner container"><div className="event-banner-copy"><span className="eyebrow"><Sparkles size={14} /> MOMENTOS COM MAIS SABOR</span><h2>Seu evento merece<br />uma dose de <em>frescor.</em></h2><p>Conheça a foodbike da Polpas Becal e descubra as possibilidades para o seu próximo encontro.</p><Link href="/eventos/#orcamento" className="button button-yellow">Quero uma foodbike no meu evento <ArrowUpRight size={17} /></Link></div><div className="event-banner-art"><img src="/images/events/foodbike.webp" srcSet="/images/events/foodbike-800.webp 800w, /images/events/foodbike.webp 1600w" sizes="(max-width: 650px) 340px, (max-width: 850px) 45vw, 540px" alt="Foodbike Polpas Becal verde e amarela com frutas e liquidificador" width="1600" height="900" loading="lazy" /></div></section>;
}

