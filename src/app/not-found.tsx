import Link from "next/link";
import { SiteShell } from "@/components/layout";

export default function NotFound() {
  return <SiteShell>
    <main id="conteudo" className="not-found container">
      <span className="eyebrow">Opa, esse caminho não deu fruto</span>
      <h1>Vamos encontrar <em>o seu sabor?</em></h1>
      <p>A página que você procura não está por aqui.</p>
      <Link href="/" className="button button-primary">Voltar ao início</Link>
    </main>
  </SiteShell>;
}
