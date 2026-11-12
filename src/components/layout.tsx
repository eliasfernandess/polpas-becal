"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowUpRight, Camera, Menu, MessageCircle, ShoppingBag, X } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { CartDrawer } from "@/components/cart";
import { Motion } from "@/components/motion";
import { business } from "@/data/business";
import { whatsappUrl } from "@/lib/whatsapp";
import { CartProvider, useCart } from "@/store/cart-store";

const links = [
  { href: "/", text: "Início" },
  { href: "/produtos/", text: "Nossas polpas" },
  { href: "/eventos/", text: "Foodbike para eventos" },
  { href: "/#contato", text: "Contato" },
];

export function Header() {
  const path = usePathname();
  const [menu, setMenu] = useState(false);
  const { items, setOpen } = useCart();
  const count = items.reduce((sum, item) => sum + item.quantity, 0);
  // Ao rolar, o cabeçalho fica mais baixo e ganha sombra.
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const update = () => setScrolled(window.scrollY > 8);
    update();
    window.addEventListener("scroll", update, { passive: true });
    return () => window.removeEventListener("scroll", update);
  }, []);
  return <header className="site-header" data-scrolled={scrolled}>
    <div className="container header-inner">
      <Link className="brand" href="/" aria-label="Polpas Becal — início" onClick={() => setMenu(false)}>
        <img src="/images/brand/logo.webp" width="217" height="73" alt="Polpas Becal, 100% fruta" />
      </Link>
      <nav className={`nav ${menu ? "nav-open" : ""}`} id="main-navigation" aria-label="Navegação principal">
        {links.map(l => <Link href={l.href} key={l.href} onClick={() => setMenu(false)} aria-current={path === l.href ? "page" : undefined}>{l.text}</Link>)}
      </nav>
      <div className="header-actions">
        <button className="cart-trigger" onClick={() => { setMenu(false); setOpen(true); }} aria-label={`Abrir carrinho, ${count} itens`}>
          <ShoppingBag size={18} /><span className="cart-label">Meu pedido</span><span key={count} className="cart-count" data-empty={count === 0} data-bump={count > 0}>{count}</span>
        </button>
        <button className="menu-trigger icon-button" aria-label={menu ? "Fechar menu" : "Abrir menu"} aria-expanded={menu} aria-controls="main-navigation" onClick={() => setMenu(!menu)}>
          {menu ? <X /> : <Menu />}
        </button>
      </div>
    </div>
  </header>;
}

export function Footer() {
  return <footer id="contato" className="footer">
    <div className="container footer-main">
      <div className="footer-brand">
        <Link href="/" aria-label="Polpas Becal — início"><img src="/images/brand/logo.webp" width="235" height="79" alt="Polpas Becal, 100% fruta" /></Link>
        <p>Mais fruta. Mais cor.<br />Mais sabor na sua vida.</p>
      </div>
      <div className="footer-col">
        <span className="footer-title">Explore os sabores</span>
        <Link href="/produtos/">Nossas polpas <ArrowUpRight size={15} /></Link>
        <Link href="/eventos/">Foodbike para eventos <ArrowUpRight size={15} /></Link>
        <Link href="/#sobre">Nossa essência <ArrowUpRight size={15} /></Link>
      </div>
      <div className="footer-col">
        <span className="footer-title">Vamos conversar?</span>
        <a href={whatsappUrl("Olá, Polpas Becal! Gostaria de saber mais sobre as polpas e a foodbike.")} target="_blank" rel="noopener noreferrer"><MessageCircle size={17} /> {business.whatsapp}</a>
        <a href={business.instagram} target="_blank" rel="noopener noreferrer"><Camera size={17} /> {business.instagramHandle}</a>
        <small>Contato informado no briefing, a confirmar.</small>
      </div>
    </div>
    <div className="container footer-bottom">
      <span>© {new Date().getFullYear()} Polpas Becal. Feito para saborear.</span>
      <div><Link href="/privacidade/">Privacidade</Link><Link href="/termos/">Termos de uso</Link><Link href="/admin/">Painel</Link></div>
    </div>
  </footer>;
}

/** Moldura das páginas públicas: cabeçalho, rodapé e carrinho. */
export function SiteShell({ children }: { children: ReactNode }) {
  return <CartProvider>
    <a className="skip-link" href="#conteudo">Pular para o conteúdo</a>
    <Header />
    {children}
    <Footer />
    <CartDrawer />
    <Motion />
  </CartProvider>;
}
