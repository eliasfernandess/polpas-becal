export interface Product {
  id: string; name: string; slug: string; description: string; image: string;
  priceInCents: number; unitLabel: string; category: string;
  available: boolean; featured: boolean; tone: string;
}
export interface CartItem { id: string; quantity: number }

