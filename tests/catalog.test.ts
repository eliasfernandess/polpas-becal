import { it, expect } from "vitest";
import { catalogSchema } from "@/lib/catalog";
const row = { id: "manga", name: "Manga", description: "Polpa", image: "/images/products/manga.webp", price_in_cents: 725, unit_label: "100 g", category: "Clássicos", available: true, featured: true, tone: "peach" };
it("mapeia os campos do banco sem perder o preço em centavos", () => {
  expect(catalogSchema.parse([row])[0]).toMatchObject({ id: "manga", priceInCents: 725, unitLabel: "100 g" });
});
it.each([{ price_in_cents: -1 }, { price_in_cents: 2.5 }, { image: "https://unknown.test/image.jpg" }, { tone: "arbitrary-class" }])("recusa catálogo inválido %j", override => {
  expect(catalogSchema.safeParse([{ ...row, ...override }]).success).toBe(false);
});
