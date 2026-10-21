import type { MetadataRoute } from "next";
import { business } from "@/data/business";
export const dynamic = "force-static";
export default function robots(): MetadataRoute.Robots { return { rules: { userAgent: "*", disallow: "/" }, sitemap: `${business.siteUrl}/sitemap.xml` }; }

