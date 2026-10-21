import type { Product } from "@/types/product";
// Todos os valores, unidades e estados abaixo são demonstrativos e precisam de aprovação.
export const products: readonly Product[] = [
  { id: "morango", name: "Morango", description: "Delicado, marcante e cheio de possibilidades. Vai bem do suco à sobremesa.", priceInCents: 490, category: "Clássicos", featured: true, tone: "pink" },
  { id: "maracuja", name: "Maracujá", description: "Aquele toque tropical e azedinho que transforma qualquer receita.", priceInCents: 450, category: "Cítricos", featured: true, tone: "yellow" },
  { id: "manga", name: "Manga", description: "Sabor macio e tropical para deixar o seu dia mais gostoso.", priceInCents: 390, category: "Clássicos", featured: true, tone: "peach" },
  { id: "abacaxi", name: "Abacaxi", description: "Leveza e frescor em um clássico que combina com qualquer momento.", priceInCents: 390, category: "Cítricos", featured: true, tone: "sage" },
  { id: "acerola", name: "Acerola", description: "Intensa e azedinha, para um suco com personalidade.", priceInCents: 390, category: "Cítricos", featured: false, tone: "pink" },
  { id: "limao", name: "Limão", description: "Um toque cítrico para refrescar e criar novas combinações.", priceInCents: 350, category: "Cítricos", featured: false, tone: "sage" },
  { id: "abacaxi-hortela", name: "Abacaxi com hortelã", description: "Uma dupla refrescante para uma pausa no meio da rotina.", priceInCents: 450, category: "Combinações", featured: false, tone: "sage" },
  { id: "mix-frutas", name: "Mix de frutas", description: "Uma combinação tropical para variar o sabor do seu dia.", priceInCents: 490, category: "Combinações", featured: false, tone: "peach" },
  { id: "cajamanga", name: "Cajamanga", description: "Um sabor tropical especial para quem gosta de descobrir.", priceInCents: 450, category: "Clássicos", featured: false, tone: "yellow" },
  { id: "tamarindo", name: "Tamarindo", description: "Sabor cheio de identidade, com um azedinho inconfundível.", priceInCents: 450, category: "Clássicos", featured: false, tone: "sand", available: false },
].map(p => ({ available: true, ...p, slug: p.id, image: `/images/products/${p.id}.webp`, unitLabel: "100 g" }));

export const productById = new Map(products.map(p => [p.id, p]));
export const categories = ["Todos os sabores", "Clássicos", "Cítricos", "Combinações"] as const;

