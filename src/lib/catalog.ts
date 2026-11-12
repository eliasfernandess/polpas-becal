import { z } from "zod";
import type { Product } from "@/types/product";
export const catalogSchema = z.array(z.object({
  id: z.string().regex(/^[a-z0-9-]{1,60}$/),
  name: z.string().min(1).max(80),
  description: z.string().max(400),
  image: z.string().regex(/^\/images\/[a-zA-Z0-9/_-]+\.(webp|png|jpg)$/),
  price_in_cents: z.number().int().min(0).max(1000000),
  unit_label: z.string().min(1).max(30),
  category: z.string().min(1).max(40),
  available: z.boolean(), featured: z.boolean(),
  tone: z.enum(["pink", "yellow", "peach", "sage", "sand"]),
}).transform((row): Product => ({
  id: row.id, slug: row.id, name: row.name, description: row.description,
  image: row.image, priceInCents: row.price_in_cents, unitLabel: row.unit_label,
  category: row.category, available: row.available, featured: row.featured, tone: row.tone,
})));
