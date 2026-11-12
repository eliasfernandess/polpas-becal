import type { Metadata } from "next";
import Link from "next/link";
import { business } from "@/data/business";

export const metadata: Metadata = { title: "Termos de uso", description: "Como funcionam os pedidos e os orçamentos feitos no site da Polpas Becal." };

export default function TermsPage() {
  return <main id="conteudo" className="legal-page container">
    <span className="eyebrow">Uma conversa clara</span>
    <h1>Termos <em>de uso.</em></h1>
    <p className="legal-intro">Ao usar este site, você concorda com as condições abaixo. Qualquer dúvida, chame a gente no WhatsApp.</p>
    <section>
      <h2>1. Pedidos</h2>
      <p>Você escolhe os sabores, informa seus dados e a forma de recebimento, e o pedido é registrado para a nossa equipe. A compra é confirmada pelo WhatsApp, onde combinamos pagamento, taxa de entrega e horário. O pedido só está fechado depois dessa confirmação.</p>
      <p>Os preços exibidos são os vigentes no momento do pedido. Se um sabor acabar antes da confirmação, avisamos e combinamos uma alternativa.</p>
    </section>
    <section>
      <h2>2. Entrega e retirada</h2>
      <p>Entregas dependem da região e têm taxa combinada no WhatsApp. Na retirada, informamos o local e o horário. As polpas são congeladas: mantenha a -18 °C ou mais frio.</p>
    </section>
    <section>
      <h2>3. Foodbike para eventos</h2>
      <p>O formulário de eventos é uma solicitação de orçamento. A data só fica reservada depois que a proposta for aceita pelo WhatsApp.</p>
    </section>
    <section>
      <h2>4. Uso responsável</h2>
      <p>Informe dados verdadeiros e apenas o necessário para o atendimento. Não tente comprometer o funcionamento do site.</p>
    </section>
    <section>
      <h2>5. Contato</h2>
      <p>WhatsApp {business.whatsapp} · Instagram {business.instagramHandle}. Veja também a <Link href="/privacidade/">Política de privacidade</Link>.</p>
    </section>
    <Link className="text-link" href="/">Voltar para o início</Link>
  </main>;
}
