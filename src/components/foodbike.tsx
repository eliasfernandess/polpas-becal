import Link from "next/link";
import { ArrowUpRight, Sparkles } from "lucide-react";
export function FoodbikeBanner() {
  return <section className="event-banner container"><div className="event-banner-copy"><span className="eyebrow"><Sparkles size={14} /> MOMENTOS COM MAIS SABOR</span><h2>Seu evento merece<br />uma dose de <em>frescor.</em></h2><p>Conheça a foodbike da Polpas Becal e descubra as possibilidades para o seu próximo encontro.</p><Link href="/eventos/#orcamento" className="button button-yellow">Quero uma foodbike no meu evento <ArrowUpRight size={17} /></Link></div><div className="event-banner-art"><img src="/images/events/foodbike.svg" alt="Ilustração de uma foodbike verde com toldo amarelo" width="600" height="460" loading="lazy" /><span>Ilustração demonstrativa</span></div></section>;
}

