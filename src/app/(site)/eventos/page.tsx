import type { Metadata } from "next";
import { ArrowDown, Check } from "lucide-react";
import { EventForm } from "@/components/event-form";

export const metadata: Metadata = { title: "Foodbike para eventos", description: "Leve mais sabor ao seu evento com a foodbike Polpas Becal. Conte sobre seu encontro e solicite um orçamento pelo WhatsApp." };

export default function EventsPage() {
  return <main id="conteudo">
    <section className="events-hero container">
      <div className="events-copy">
        <span className="eyebrow">Boas histórias pedem bons sabores</span>
        <h1>Um encontro. Muitos sorrisos. <em>Mais frescor.</em></h1>
        <p>Leve o sabor da Polpas Becal para o seu evento. Conheça as possibilidades da nossa foodbike e vamos pensar no seu momento juntos.</p>
        <a href="#orcamento" className="button button-primary">Vamos falar do seu evento <ArrowDown size={17} /></a>
      </div>
      <div className="events-art">
        <img src="/images/events/foodbike.webp" srcSet="/images/events/foodbike-800.webp 800w, /images/events/foodbike.webp 1600w" sizes="(max-width: 900px) calc(100vw - 40px), 620px" alt="Foodbike Polpas Becal verde e amarela com frutas e liquidificador" width="1600" height="900" fetchPriority="high" />
      </div>
    </section>

    <section className="quote" id="orcamento">
      <div className="container quote-grid">
        <div className="quote-copy" data-reveal>
          <span className="eyebrow">O primeiro passo é uma conversa</span>
          <h2>Um orçamento feito para <em>o seu momento.</em></h2>
          <p>Sem pacotes prontos por aqui. Compartilhe os detalhes para consultar possibilidades, disponibilidade e valores.</p>
          <ol>
            <li><span>1</span><div><h3>Conte sua ideia</h3><p>Informe a data, o lugar e quem vai celebrar com você.</p></div></li>
            <li><span>2</span><div><h3>Continue no WhatsApp</h3><p>A mensagem fica pronta. Você confere e envia.</p></div></li>
            <li><span><Check size={15} /></span><div><h3>Combine os detalhes</h3><p>A equipe responde sobre estrutura e condições.</p></div></li>
          </ol>
          <small>O formulário não representa reserva ou confirmação do evento.</small>
        </div>
        <EventForm />
      </div>
    </section>
  </main>;
}
