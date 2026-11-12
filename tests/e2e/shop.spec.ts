import { test, expect, type Page } from "@playwright/test";
import { seedProducts } from "../../src/data/products";

const supabaseMode = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL);
const plain = (text: string) => text.replace(/[^\S\n]/g, " ");

async function openSection(page: Page, name: string) {
  const menu = page.getByRole("button", { name: "Abrir menu" });
  if (await menu.isVisible()) await menu.click();
  await page.getByRole("navigation", { name: "Seções do painel" }).getByRole("button", { name: new RegExp(`^${name}`) }).click();
}

test.describe("modo demonstração", () => {
  test.skip(supabaseMode, "Painel sem login: só no build sem Supabase.");

  test("kit, preço por quantidade, bairro com taxa e pedido mínimo, do painel ao pedido", async ({ page }) => {
    // Painel: kit
    await page.goto("/admin/");
    await openSection(page, "Kits");
    await page.getByRole("button", { name: "Novo kit" }).first().click();
    const kitForm = page.getByRole("dialog", { name: "Novo kit" });
    await kitForm.getByRole("button", { name: "Criar kit" }).click();
    await expect(kitForm.getByText("Escolha ao menos um sabor.")).toBeVisible();
    await kitForm.getByLabel("Nome do kit").fill("Kit duo");
    await kitForm.getByRole("button", { name: "Pôr Morango no kit" }).click();
    await kitForm.getByLabel("Quantidade de Limão no kit").fill("2");
    await kitForm.getByLabel("Preço do kit (R$)").fill("8,00");
    await expect(kitForm.getByText("economia de R$ 3,90")).toBeVisible();
    await kitForm.getByRole("button", { name: "Criar kit" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Kit duo criado." })).toBeVisible();
    await expect(page.getByText("dá para montar")).toBeVisible();

    // Painel: entrega
    await openSection(page, "Entrega");
    await page.getByLabel("Cidade", { exact: true }).fill("Uberlândia");
    await page.getByLabel("Bairro", { exact: true }).fill("Centro");
    await page.getByLabel("Taxa (R$)").fill("5,00");
    await page.getByRole("button", { name: "Adicionar bairro" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Centro adicionado." })).toBeVisible();
    await page.getByLabel("Pedido mínimo para entrega (R$)").fill("20,00");
    await page.getByRole("button", { name: "Salvar regras" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Regras de entrega salvas." })).toBeVisible();

    // Painel: preço por quantidade
    await openSection(page, "Produtos");
    await page.getByRole("button", { name: "Editar Morango" }).click();
    const productForm = page.getByRole("dialog", { name: "Editar Morango" });
    await productForm.getByText("Preço por quantidade", { exact: true }).click();
    await productForm.getByLabel("A partir de (un.)", { exact: true }).fill("10");
    await productForm.getByLabel("Preço de cada (R$)", { exact: true }).fill("5,00");
    await productForm.getByRole("button", { name: "Salvar alterações" }).click();
    await expect(productForm.getByText("O preço por quantidade precisa ser menor que o preço normal.")).toBeVisible();
    await productForm.getByLabel("Preço de cada (R$)", { exact: true }).fill("4,00");
    await productForm.getByRole("button", { name: "Salvar alterações" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Morango atualizado." })).toBeVisible();

    // Loja
    await page.goto("/produtos/");
    const kitCard = page.locator(".kit-card").filter({ has: page.getByRole("heading", { name: "Kit duo" }) });
    await expect(kitCard.getByText("Economize R$ 3,90")).toBeVisible();
    await expect(page.locator(".product-card").filter({ has: page.getByRole("heading", { name: "Morango", exact: true }) }).getByText("A partir de 10 un.:")).toBeVisible();
    await kitCard.getByRole("button", { name: "Adicionar 1 Kit duo ao carrinho" }).click();
    await page.getByRole("button", { name: "Abrir carrinho, 1 itens" }).click();
    const cart = page.getByRole("dialog");
    await expect(cart.getByText("Faltam", { exact: false })).toContainText("R$ 12,00");
    await cart.getByRole("button", { name: "Aumentar Kit duo" }).click();
    await cart.getByRole("button", { name: "Aumentar Kit duo" }).click();
    await expect(cart.getByText("Seu pedido já pode ser entregue.")).toBeVisible();
    // Estoque somado: o limão (14 un.) comporta 7 kits; com 3 kits, sobram 8 limões avulsos.
    await cart.getByRole("button", { name: "Continuar", exact: true }).click();
    await cart.getByLabel("Seu nome").fill("Ana");
    await cart.getByLabel("Telefone com DDD").pressSequentially("34999990000");
    await cart.getByRole("button", { name: "Próximo" }).click();
    await cart.getByText("Entregar no meu endereço").click();
    await cart.getByRole("button", { name: "Próximo" }).click();
    await cart.getByRole("button", { name: "Próximo" }).click();
    await expect(cart.getByText("Escolha o seu bairro na lista.")).toBeVisible();
    await cart.getByLabel("Bairro").selectOption({ label: "Centro · R$ 5,00" });
    await expect(cart.getByText("Taxa de entrega: R$ 5,00")).toBeVisible();
    await cart.getByLabel("CEP").pressSequentially("38400000");
    await cart.getByLabel("Número").fill("10");
    await cart.getByLabel("Rua ou avenida").fill("Rua das Frutas");
    await cart.getByRole("button", { name: "Próximo" }).click();
    await expect(cart.locator(".cart-subtotals")).toContainText("R$ 5,00");
    await expect(cart.locator(".cart-total")).toContainText("R$ 29,00");
    const text = plain(new URL((await cart.getByRole("link", { name: "Continuar no WhatsApp" }).getAttribute("href"))!).searchParams.get("text")!);
    expect(text).toContain("3x Kit duo (1x Morango, 2x Limão) — R$ 8,00 cada");
    expect(text).toContain("Taxa de entrega: R$ 5,00");
    expect(text).toContain("TOTAL: R$ 29,00");
    expect(text).toContain("Entrega: Rua das Frutas, 10 — Centro, Uberlândia");
  });

  test("abaixo do mínimo, a entrega fica bloqueada e a retirada continua", async ({ page }) => {
    await page.goto("/admin/");
    await openSection(page, "Entrega");
    await page.getByLabel("Pedido mínimo para entrega (R$)").fill("50,00");
    await page.getByRole("button", { name: "Salvar regras" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Regras de entrega salvas." })).toBeVisible();
    await page.goto("/produtos/");
    await page.getByRole("button", { name: "Adicionar 1 Morango ao carrinho" }).click();
    await page.getByRole("button", { name: "Abrir carrinho, 1 itens" }).click();
    const cart = page.getByRole("dialog");
    await cart.getByRole("button", { name: "Continuar", exact: true }).click();
    await cart.getByLabel("Seu nome").fill("Ana");
    await cart.getByLabel("Telefone com DDD").pressSequentially("34999990000");
    await cart.getByRole("button", { name: "Próximo" }).click();
    await expect(cart.getByRole("radio", { name: /Entregar no meu endereço/ })).toBeDisabled();
    await expect(cart.getByText("Disponível para pedidos a partir de R$ 50,00.")).toBeVisible();
    await cart.getByText("Vou retirar").click();
    await cart.getByRole("button", { name: "Próximo" }).click();
    await expect(cart.getByRole("heading", { name: "Confirme o pedido" })).toBeVisible();
  });
});

test.describe("com Supabase", () => {
  test.skip(!supabaseMode, "Só no build ligado ao Supabase.");
  const rows = seedProducts.map(p => ({ id: p.id, name: p.name, description: p.description, image: p.image, price_in_cents: p.priceInCents, unit_label: p.unitLabel, category: p.category, tone: p.tone, stock: p.stock, low_stock: p.lowStock, available: p.active, featured: p.featured, sort_order: p.sort, bulk_min: p.id === "morango" ? 10 : 0, bulk_price_in_cents: p.id === "morango" ? 400 : 0 }));
  const kit = { id: "duo", name: "Kit duo", description: "", image: "", price_in_cents: 800, items: [{ id: "morango", quantity: 1 }, { id: "limao", quantity: 2 }], available: true, featured: true, sort_order: 0 };

  test("pedido com kit, preço por quantidade e taxa do bairro chega ao banco", async ({ page }) => {
    let posted: Record<string, unknown> | null = null;
    await page.route("**/rest/v1/**", route => {
      const request = route.request();
      const path = new URL(request.url()).pathname;
      if (path.endsWith("/products")) return route.fulfill({ json: rows });
      if (path.endsWith("/kits")) return route.fulfill({ json: [kit] });
      if (path.endsWith("/delivery_zones")) return route.fulfill({ json: [{ id: "z1", city: "Uberlândia", district: "Centro", fee_cents: 500, available: true, sort_order: 0 }] });
      if (path.endsWith("/store_settings")) return route.fulfill({ json: [{ delivery_enabled: true, pickup_enabled: true, min_order_cents: 0 }] });
      if (path.endsWith("/orders") && request.method() === "POST") { posted = request.postDataJSON(); return route.fulfill({ status: 201, body: "" }); }
      return route.fulfill({ status: 403, json: {} });
    });
    await page.goto("/produtos/");
    await page.locator(".kit-card").getByRole("button", { name: "Adicionar 1 Kit duo ao carrinho" }).click();
    const morango = page.locator(".product-card").filter({ has: page.getByRole("heading", { name: "Morango", exact: true }) });
    for (let i = 0; i < 9; i++) await morango.getByRole("button", { name: "Aumentar quantidade de Morango" }).click();
    await morango.getByRole("button", { name: "Adicionar 10 Morango ao carrinho" }).click();
    await page.getByRole("button", { name: "Abrir carrinho, 11 itens" }).click();
    const cart = page.getByRole("dialog");
    await expect(cart.getByText("preço por quantidade", { exact: false })).toBeVisible();
    await cart.getByRole("button", { name: "Continuar", exact: true }).click();
    await cart.getByLabel("Seu nome").fill("Ana");
    await cart.getByLabel("Telefone com DDD").pressSequentially("34999990000");
    await cart.getByRole("button", { name: "Próximo" }).click();
    await cart.getByText("Entregar no meu endereço").click();
    await cart.getByRole("button", { name: "Próximo" }).click();
    await cart.getByLabel("Bairro").selectOption({ label: "Centro · R$ 5,00" });
    await cart.getByLabel("CEP").pressSequentially("38400000");
    await cart.getByLabel("Número").fill("10");
    await cart.getByLabel("Rua ou avenida").fill("Rua A");
    await cart.getByRole("button", { name: "Próximo" }).click();
    await cart.getByRole("button", { name: "Registrar pedido" }).click();
    await expect(cart.getByText("Pedido registrado!", { exact: false })).toBeVisible();
    expect(posted).toMatchObject({
      items: [{ id: "kit:duo", quantity: 1 }, { id: "morango", quantity: 10 }],
      total_in_cents: 800 + 4000, delivery_fee_cents: 500, fulfillment: "entrega", district: "Centro", city: "Uberlândia",
    });
  });

  test("painel avisa quando chega pedido novo", async ({ page, context }) => {
    await context.grantPermissions(["notifications"]);
    await page.clock.install();
    const ago = (min: number) => new Date(Date.now() - min * 60000).toISOString();
    const order = (id: string, name: string, min: number) => ({ id, created_at: ago(min), status: "pending_whatsapp", total_in_cents: 980, delivery_fee_cents: null, items: [{ id: "morango", name: "Morango", unitLabel: "100 g", priceInCents: 490, quantity: 2 }], customer_name: name, customer_phone: "34999990000", fulfillment: "retirada", postal_code: "", street: "", street_number: "", complement: "", district: "", city: "" });
    let calls = 0;
    await page.route("**/rest/v1/**", route => {
      const path = new URL(route.request().url()).pathname;
      if (path.endsWith("/products")) return route.fulfill({ json: rows });
      if (path.endsWith("/orders")) { calls++; return route.fulfill({ json: calls < 2 ? [order("a0000000-0000-4000-8000-000000000001", "Ana", 30)] : [order("b0000000-0000-4000-8000-000000000002", "Bruno", 0), order("a0000000-0000-4000-8000-000000000001", "Ana", 30)] }); }
      if (path.endsWith("/rpc/my_role")) return route.fulfill({ json: "admin" });
      if (path.endsWith("/rpc/claim_invite")) return route.fulfill({ json: false });
      if (path.endsWith("/store_settings")) return route.fulfill({ json: [{ delivery_enabled: true, pickup_enabled: true, min_order_cents: 0 }] });
      return route.fulfill({ json: [] });
    });
    await page.route("**/auth/v1/**", route => route.fulfill({ json: { id: "u1", email: "dona@teste.local" } }));
    await page.goto("/produtos/");
    await page.evaluate(() => localStorage.setItem("sb-teste-e2e-auth-token", JSON.stringify({
      access_token: "a.b.c", refresh_token: "r", token_type: "bearer", expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600,
      user: { id: "u1", email: "dona@teste.local", aud: "authenticated", role: "authenticated" },
    })));
    await page.goto("/admin/");
    await expect(page.getByText("Quer ouvir quando chegar pedido?")).toBeVisible({ timeout: 15000 });
    await expect(page).toHaveTitle(/\(1\) Pedidos novos/);
    await page.getByRole("button", { name: "Ligar avisos", exact: true }).click();
    await expect(page.getByText("Quer ouvir quando chegar pedido?")).toHaveCount(0);
    await page.clock.fastForward(21000);
    await expect(page).toHaveTitle(/\(2\) Pedidos novos/);
    await expect(page.locator(".adm-mini")).toContainText("Bruno");
  });
});
