import type { MetadataRoute } from "next";
import { business } from "@/data/business";
export const dynamic = "force-static";
export default function sitemap(): MetadataRoute.Sitemap { return ["", "/produtos", "/eventos", "/privacidade", "/termos"].map(path => ({ url: `${business.siteUrl}${path}/` })); }

