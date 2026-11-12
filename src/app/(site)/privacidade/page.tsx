import type { Metadata } from "next";
import Link from "next/link";
import { business } from "@/data/business";

export const metadata: Metadata = { title: "Política de privacidade", description: "Como a Polpas Becal usa os dados informados em pedidos e orçamentos." };

export default function PrivacyPage() {
  return <main id="conteudo" className="legal-page container">
    <span className="eyebrow">Transparência em cada detalhe</span>
    <h1>Política de <em>privacidade.</em></h1>
    <p className="legal-intro">Usamos os seus dados só para atender o seu pedido ou orçamento. Nada de anúncios, rastreadores ou venda de dados.</p>
    <section>
      <h2>1. Quem cuida dos seus dados</h2>
      <p>A Polpas Becal é a responsável pelos dados informados neste site. Fale com a gente pelo WhatsApp {business.whatsapp}.</p>
    </section>
    <section>
      <h2>2. Que dados usamos e para quê</h2>
      <p><strong>Pedidos:</strong> nome, telefone, forma de recebimento, endereço de entrega (quando houver), sabores, quantidades e valores. Servem para confirmar o pedido e combinar pagamento e entrega ou retirada.</p>
      <p><strong>Orçamentos da foodbike:</strong> nome, telefone, tipo, data, horário, local, número de convidados, duração e observações do evento. Servem para preparar e enviar o orçamento.</p>
      <p>Não pedimos documentos nem dados bancários. Evite colocar informações sensíveis nas observações.</p>
    </section>
    <section>
      <h2>3. Onde ficam guardados</h2>
      <p>Ao registrar um pedido ou orçamento, os dados são gravados no banco de atendimento da Polpas Becal, hospedado no Supabase, em São Paulo. Só a nossa equipe tem acesso. O site é hospedado na Vercel, que pode registrar dados técnicos de acesso, como IP e horário, para segurança.</p>
      <p>Guardamos os registros pelo tempo necessário para o atendimento e para cumprir obrigações legais.</p>
    </section>
    <section>
      <h2>4. WhatsApp</h2>
      <p>Depois de registrar, o site abre o WhatsApp com a mensagem pronta. Ao enviar, o conteúdo passa pelo serviço do WhatsApp/Meta e segue também as regras dele.</p>
      <p><a href="https://www.whatsapp.com/legal/privacy-policy" target="_blank" rel="noopener noreferrer">Política de privacidade do WhatsApp</a></p>
    </section>
    <section>
      <h2>5. No seu navegador</h2>
      <p>O carrinho guarda só os sabores e as quantidades escolhidos (chave “becal:cart:v1”), para não se perder ao atualizar a página. Nome, telefone e endereço não ficam salvos no navegador. Para apagar o carrinho, remova os itens ou limpe os dados do site.</p>
    </section>
    <section>
      <h2>6. Seus direitos</h2>
      <p>Pela Lei Geral de Proteção de Dados, você pode pedir acesso, correção ou exclusão dos seus dados, entre outros direitos. Basta falar com a gente pelo WhatsApp.</p>
      <p><a href="https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/l13709.htm" target="_blank" rel="noopener noreferrer">Lei nº 13.709/2018 (LGPD)</a></p>
    </section>
    <Link className="text-link" href="/">Voltar para o início</Link>
  </main>;
}
