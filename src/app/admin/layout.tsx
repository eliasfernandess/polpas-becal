import type { Metadata } from "next";
import "./admin.css";

export const metadata: Metadata = { title: "Painel de estoque", robots: { index: false, follow: false } };

export default function AdminLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
