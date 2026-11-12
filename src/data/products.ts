import type { Kit, KitData, Product, ProductData, Tone } from "@/types/product";

export const toProduct = (data: ProductData): Product => ({ ...data, slug: data.id, available: data.active && data.stock > 0 });

type Seed = Pick<ProductData, "id" | "name" | "description" | "priceInCents" | "category" | "stock"> & { tone: Tone; featured?: boolean };

// Catálogo inicial, usado sem Supabase (modo local). Em produção, o catálogo vem do banco e é editado no painel.
const seed: Seed[] = [
  { id: "morango", name: "Morango", description: "Delicado, marcante e cheio de possibilidades. Vai bem do suco à sobremesa.", priceInCents: 490, category: "Clássicos", featured: true, tone: "pink", stock: 180 },
  { id: "maracuja", name: "Maracujá", description: "Aquele toque tropical e azedinho que transforma qualquer receita.", priceInCents: 450, category: "Cítricos", featured: true, tone: "yellow", stock: 240 },
  { id: "manga", name: "Manga", description: "Sabor macio e tropical para deixar o seu dia mais gostoso.", priceInCents: 390, category: "Clássicos", featured: true, tone: "peach", stock: 150 },
  { id: "abacaxi", name: "Abacaxi", description: "Leveza e frescor em um clássico que combina com qualquer momento.", priceInCents: 390, category: "Cítricos", featured: true, tone: "sand", stock: 120 },
  { id: "acerola", name: "Acerola", description: "Intensa e azedinha, para um suco com personalidade.", priceInCents: 390, category: "Cítricos", tone: "red", stock: 96 },
  { id: "limao", name: "Limão", description: "Um toque cítrico para refrescar e criar novas combinações.", priceInCents: 350, category: "Cítricos", tone: "lime", stock: 14 },
  { id: "abacaxi-hortela", name: "Abacaxi com hortelã", description: "Uma dupla refrescante para uma pausa no meio da rotina.", priceInCents: 450, category: "Combinações", tone: "sage", stock: 60 },
  { id: "mix-frutas", name: "Mix de frutas", description: "Uma combinação tropical para variar o sabor do seu dia.", priceInCents: 490, category: "Combinações", tone: "purple", stock: 8 },
  { id: "cajamanga", name: "Cajamanga", description: "Um sabor tropical especial para quem gosta de descobrir.", priceInCents: 450, category: "Clássicos", tone: "yellow", stock: 72 },
  { id: "tamarindo", name: "Tamarindo", description: "Sabor cheio de identidade, com um azedinho inconfundível.", priceInCents: 450, category: "Clássicos", tone: "sand", stock: 0 },
];

export const seedProducts: readonly Product[] = seed.map((p, index) => toProduct({
  featured: false, ...p, image: `/images/products/${p.id}.webp`, unitLabel: "100 g", lowStock: 20, active: true, sort: index, bulkMin: 0, bulkPriceInCents: 0,
}));

/** Catálogo inicial (usado na renderização estática e nos testes). */
export const products = seedProducts;

/**
 * Índice vivo do catálogo. Começa com o catálogo inicial e é substituído por
 * `setCatalog` (src/lib/catalog.ts) quando os dados publicados são carregados.
 */
export const productById = new Map(seedProducts.map(p => [p.id, p]));

/** Índice vivo dos kits, preenchido quando o catálogo publicado chega. */
export const kitById = new Map<string, Kit>();

/** Deriva disponibilidade, quantos kits cabem no estoque e o preço avulso. */
export function toKit(data: KitData, products: ReadonlyMap<string, Product> = productById): Kit {
  let maxUnits = data.active && data.items.length ? 99 : 0;
  let regularInCents = 0;
  for (const item of data.items) {
    const product = products.get(item.id);
    maxUnits = Math.min(maxUnits, product ? Math.floor(product.stock / item.quantity) : 0);
    regularInCents += (product?.priceInCents ?? 0) * item.quantity;
  }
  return { ...data, maxUnits, available: maxUnits > 0, regularInCents };
}

export const ALL_CATEGORIES = "Todos os sabores";
export const categoriesOf = (list: readonly Product[]): string[] => [ALL_CATEGORIES, ...new Set(list.map(p => p.category))];
