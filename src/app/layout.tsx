import type { Metadata, Viewport } from "next";
import { CatalogLoader } from "@/store/catalog-store";
import { business } from "@/data/business";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(business.siteUrl),
  title: { default: "Polpas Becal — Fruta de verdade. Sabor para a vida.", template: "%s | Polpas Becal" },
  description: "Descubra os sabores da Polpas Becal. Monte seu pedido de polpas de frutas e consulte uma foodbike para eventos pelo WhatsApp.",
  robots: { index: false, follow: false },
  openGraph: { type: "website", locale: "pt_BR", siteName: business.name, title: "Polpas Becal — 100% fruta, muito mais sabor", description: "Mais fruta. Mais cor. Mais sabor na sua vida.", images: [{ url: "/images/brand/social.jpg", width: 1200, height: 630, alt: "Polpas Becal" }] },
  icons: { icon: "/icon.svg" },
};
export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#fff8e8" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="pt-BR"><body><CatalogLoader />{children}</body></html>;
}
