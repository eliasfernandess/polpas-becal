import { test, expect, type Page } from "@playwright/test";
import { seedProducts } from "../../src/data/products";

// O build pode estar em modo demonstração (sem Supabase) ou ligado ao banco. Com banco, toda
// chamada é interceptada: os testes nunca criam pedidos ou orçamentos reais.
const supabaseMode = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL);
const rows = seedProducts.map(p => ({
  id: p.id, name: p.name, description: p.description, image: p.image, price_in_cents: p.priceInCents, unit_label: p.unitLabel,
  category: p.category, tone: p.tone, stock: p.stock, low_stock: p.lowStock, available: p.active, featured: p.featured, sort_order: p.sort,
}));

test.beforeEach(async ({ page }) => {
  if (!supabaseMode) return;
  await page.route("**/rest/v1/**", async route => {
    const request = route.request();
    const url = new URL(request.url());
    if (request.method() === "GET" && url.pathname === "/rest/v1/products") return route.fulfill({ json: rows });
    if (request.method() === "POST" && ["/rest/v1/orders", "/rest/v1/event_requests"].includes(url.pathname)) return route.fulfill({ status: 201, body: "" });
    return route.fulfill({ status: 403, json: { message: "Forbidden" } });
  });
});

async function fillQuote(page: Page, name = "João & Ana", location = "Salão São José") {
  const next = page.getByRole("button", { name: "Continuar", exact: true });
  await page.getByText("Casamento", { exact: true }).click();
  await next.click();
  await page.getByLabel("Data do evento").fill("2099-12-20");
  await page.getByLabel("Cidade e local do evento").fill(location);
  await next.click();
  await page.getByText("De 51 a 100", { exact: true }).click();
  await next.click();
  await page.getByLabel("Seu nome", { exact: false }).fill(name);
  await next.click();
  await expect(page.getByRole("heading", { name: "Tudo certo?" })).toBeVisible();
}

test("catálogo, carrinho persistente e mensagem de pedido", async ({ page, context }) => {
  const failures: string[] = [];
  page.on("pageerror", error => failures.push(error.message));
  await page.goto("/produtos/");
  await page.getByLabel("Buscar sabor").fill("maracuja");
  await expect(page.getByRole("heading", { name: "Maracujá", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Aumentar quantidade de Maracujá", exact: true }).click();
  await page.getByRole("button", { name: "Adicionar 2 Maracujá ao carrinho" }).click();
  await page.reload();
  await page.getByRole("button", { name: "Abrir carrinho, 2 itens" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText("R$ 9,00", { exact: true }).first()).toBeVisible();
  if (supabaseMode) {
    // Com banco, o pedido é registrado antes de abrir o WhatsApp, com itens e total conferíveis.
    const orderRequest = page.waitForRequest(req => req.url().includes("/rest/v1/orders") && req.method() === "POST");
    await dialog.getByRole("button", { name: "Registrar pedido" }).click();
    const submitted = (await orderRequest).postDataJSON();
    expect(submitted.items).toEqual([{ id: "maracuja", quantity: 2 }]);
    expect(submitted.total_in_cents).toBe(900);
    await expect(dialog.getByText("Pedido registrado.", { exact: false })).toBeVisible();
  }
  const link = dialog.getByRole("link", { name: "Continuar no WhatsApp" });
  const url = new URL((await link.getAttribute("href"))!);
  expect(url.host).toBe("wa.me"); expect(url.searchParams.get("text")).toContain("2x Polpa de Maracujá");
  if (supabaseMode) expect(url.searchParams.get("text")).toContain("Referência do pedido:");
  await context.route("https://wa.me/**", route => route.fulfill({ status: 200, contentType: "text/html", body: "<p>WhatsApp interceptado pelo teste.</p>" }));
  const [popup] = await Promise.all([context.waitForEvent("page"), link.click()]);
  await popup.waitForLoadState(); await popup.close();
  await dialog.getByRole("button", { name: "Diminuir Maracujá", exact: true }).click();
  await expect(page.getByRole("button", { name: "Abrir carrinho, 1 itens" })).toBeVisible();
  await dialog.getByRole("button", { name: "Remover Maracujá", exact: true }).click();
  await expect(dialog.getByText("Tem espaço para muito sabor.")).toBeVisible();
  await page.keyboard.press("Escape"); await expect(dialog).not.toBeVisible();
  expect(failures).toEqual([]);
});

test("orçamento por etapas, WhatsApp codificado e nada pessoal no navegador", async ({ page }) => {
  const externalRequests: string[] = [];
  page.on("request", req => { if (!req.url().startsWith("http://127.0.0.1:3000")) externalRequests.push(req.url()); });
  await page.addInitScript(() => { window.open = (url) => { (window as unknown as { capturedWhatsApp: string }).capturedWhatsApp = String(url); return null; }; });
  await page.goto("/eventos/");
  const next = page.getByRole("button", { name: "Continuar", exact: true });
  // Etapa 1: não avança sem escolher a ocasião.
  await expect(page.getByRole("heading", { name: "Qual é a ocasião?" })).toBeVisible();
  await next.click();
  await expect(page.getByRole("alert").filter({ hasText: "Revise" })).toBeVisible();
  await expect(page.getByText("Escolha o tipo de evento.")).toBeVisible();
  await page.getByText("Casamento", { exact: true }).click();
  await next.click();
  // Etapa 2: data e local, com validação própria.
  await expect(page.getByRole("heading", { name: "Quando e onde vai ser?" })).toBeFocused();
  await next.click();
  await expect(page.getByText("Informe uma data válida.")).toBeVisible();
  await page.getByLabel("Data do evento").fill("2099-12-20");
  await page.getByLabel("Cidade e local do evento").fill("Salão São José");
  await page.getByLabel("Cidade e local do evento").press("Enter");
  // Etapa 3: tamanho.
  await page.getByText("De 51 a 100", { exact: true }).click();
  await next.click();
  // Etapa 4: contato.
  await page.getByLabel("Seu nome", { exact: false }).fill("João & Ana");
  await next.click();
  // Revisão: permite voltar a uma etapa e manter o que foi preenchido.
  await expect(page.getByRole("heading", { name: "Tudo certo?" })).toBeVisible();
  await expect(page.locator(".form-review")).toContainText("20/12/2099");
  await page.getByRole("button", { name: "Editar onde" }).click();
  await expect(page.getByLabel("Cidade e local do evento")).toHaveValue("Salão São José");
  await page.getByRole("button", { name: "Etapa 5: Revisão" }).click();
  await page.getByRole("button", { name: "Solicitar orçamento", exact: true }).click();
  let target: string;
  if (supabaseMode) {
    await expect(page.getByText("Solicitação registrada.")).toBeVisible();
    target = (await page.locator(".form-success a").getAttribute("href"))!;
    expect(new URL(target).searchParams.get("text")).toContain("Referência do orçamento:");
    expect(externalRequests.some(url => url.includes("/rest/v1/event_requests"))).toBe(true);
  } else {
    await expect(page.getByText("Sua mensagem está pronta.")).toBeVisible();
    target = await page.evaluate(() => (window as unknown as { capturedWhatsApp: string }).capturedWhatsApp);
    expect(externalRequests).toEqual([]);
  }
  const url = new URL(target);
  expect(url.origin).toBe("https://wa.me");
  expect(url.searchParams.get("text")).toContain("João & Ana");
  expect(url.searchParams.get("text")).toContain("20/12/2099");
  expect(url.searchParams.get("text")).toContain("Salão São José");
  const saved = await page.evaluate(() => JSON.stringify({ ...localStorage, ...sessionStorage }));
  expect(saved).not.toContain("João"); expect(saved).not.toContain("Salão");
  await expect(page.locator(".form-review")).toContainText("João & Ana");
});

test("cabeçalhos de segurança, rotas e responsividade", async ({ page, request }) => {
  const response = await request.get("/");
  const headers = response.headers();
  expect(headers["x-content-type-options"]).toBe("nosniff");
  expect(headers["content-security-policy"]).toContain("sha256-");
  expect(headers["content-security-policy"]).not.toContain("unsafe-eval");
  expect(headers["content-security-policy"]).toContain("frame-ancestors 'none'");
  for (const route of ["/", "/produtos/", "/eventos/", "/privacidade/", "/termos/"]) {
    await page.goto(route);
    await expect(page.locator("h1")).toHaveCount(1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `Sem overflow em ${route}`).toBe(true);
  }
  await page.setViewportSize({ width: 320, height: 740 });
  for (const route of ["/", "/produtos/", "/eventos/", "/privacidade/", "/termos/"]) {
    await page.goto(route);
    await expect(page.locator("h1")).toBeVisible();
    await page.waitForLoadState("networkidle"); // catálogo carregado antes de medir
    const smallLayout = await page.evaluate(() => ({ width: innerWidth, scroll: document.documentElement.scrollWidth, elements: [...document.querySelectorAll("body *")].filter(el => el.getBoundingClientRect().right > innerWidth + 1).map(el => ({ className: el.className, right: el.getBoundingClientRect().right })) }));
    expect(smallLayout.scroll <= smallLayout.width, `${route}: ${JSON.stringify(smallLayout)}`).toBe(true);
  }
  await page.getByRole("button", { name: "Abrir menu", exact: true }).click();
  await page.getByRole("navigation", { name: "Navegação principal" }).getByRole("link", { name: "Nossas polpas" }).click();
  await expect(page).toHaveURL(/produtos/);
});

test("celular mostra três produtos por linha", async ({ page }) => {
  for (const width of [320, 390]) {
    await page.setViewportSize({ width, height: 800 });
    await page.goto("/produtos/");
    const cards = page.locator(".product-card");
    await expect(cards.nth(3)).toBeVisible();
    const tops = await cards.evaluateAll(list => list.slice(0, 4).map(el => Math.round(el.getBoundingClientRect().top)));
    expect(tops[0]).toBe(tops[1]); expect(tops[1]).toBe(tops[2]); expect(tops[3]).toBeGreaterThan(tops[0]);
    const buttons = await page.locator(".product-card .add-button, .product-card .stepper button").evaluateAll(list => list.map(el => el.getBoundingClientRect().height));
    expect(Math.min(...buttons), `Botões tocáveis em ${width}px`).toBeGreaterThanOrEqual(40);
  }
});

test("armazenamento adulterado e indisponibilidade são tratados", async ({ page }) => {
  await page.goto("/produtos/");
  // Espera a página restaurar (e regravar) o carrinho antes de adulterá-lo.
  await expect(page.getByRole("heading", { name: "Morango", exact: true })).toBeVisible();
  await page.waitForLoadState("networkidle");
  await page.evaluate(() => localStorage.setItem("becal:cart:v1", JSON.stringify([{ id: "manga", quantity: -5 }, { id: "tamarindo", quantity: 2 }, { id: "morango", quantity: 2 }])));
  await page.reload();
  await page.getByRole("button", { name: "Abrir carrinho, 2 itens" }).click();
  await expect(page.getByRole("dialog").getByRole("heading", { name: "Morango", exact: true })).toBeVisible();
  await expect(page.getByRole("dialog").getByRole("heading", { name: "Manga", exact: true })).toHaveCount(0);
});

test.describe("com Supabase", () => {
  test.skip(!supabaseMode, "Só no build ligado ao Supabase.");

  test("falha de envio mantém os dados e reutiliza a referência na tentativa seguinte", async ({ page }) => {
    const ids: string[] = [];
    await page.route("**/rest/v1/event_requests", route => {
      ids.push(route.request().postDataJSON().id);
      return ids.length === 1 ? route.fulfill({ status: 503, json: { message: "Unavailable" } }) : route.fulfill({ status: 201, body: "" });
    });
    await page.goto("/eventos/");
    await fillQuote(page, "Teste de integração", "Local de teste");
    await page.getByRole("button", { name: "Solicitar orçamento", exact: true }).click();
    await expect(page.getByRole("alert").filter({ hasText: "Não foi possível registrar" })).toBeVisible();
    await expect(page.locator(".form-review")).toContainText("Teste de integração");
    await expect(page.locator(".form-success")).toHaveCount(0);
    await page.getByRole("button", { name: "Solicitar orçamento", exact: true }).click();
    await expect(page.getByText("Solicitação registrada.")).toBeVisible();
    expect(ids).toHaveLength(2);
    expect(ids[0]).toBe(ids[1]);
  });

  test("falha do catálogo não mostra preços locais nem permite comprar, e preserva o carrinho", async ({ page }) => {
    await page.route("**/rest/v1/products*", route => route.fulfill({ status: 503, json: { message: "Unavailable" } }));
    await page.addInitScript(() => localStorage.setItem("becal:cart:v1", JSON.stringify([{ id: "morango", quantity: 2 }])));
    await page.goto("/produtos/");
    await expect(page.getByRole("alert").filter({ hasText: "Não foi possível carregar" })).toBeVisible({ timeout: 20000 });
    await expect(page.locator(".product-card")).toHaveCount(0);
    expect(await page.evaluate(() => localStorage.getItem("becal:cart:v1"))).toContain("morango");
  });

  test("banco sem a migração de estoque continua vendendo pelo catálogo antigo", async ({ page }) => {
    const legacy = rows.map(row => Object.fromEntries(Object.entries(row).filter(([key]) => key !== "stock" && key !== "low_stock")));
    await page.route("**/rest/v1/products*", route => {
      const select = new URL(route.request().url()).searchParams.get("select") ?? "";
      return select.includes("stock")
        ? route.fulfill({ status: 400, json: { code: "42703", message: "column products.stock does not exist" } })
        : route.fulfill({ json: legacy });
    });
    await page.goto("/produtos/");
    await expect(page.getByRole("heading", { name: "Morango", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Adicionar 1 Morango ao carrinho" }).click();
    await expect(page.getByRole("button", { name: "Abrir carrinho, 1 itens" })).toBeVisible();
  });

  test("produto esgotado no banco aparece como esgotado e não entra no pedido", async ({ page }) => {
    await page.route("**/rest/v1/products*", route => route.fulfill({ json: rows.map(r => r.id === "morango" ? { ...r, stock: 0 } : r) }));
    await page.goto("/produtos/");
    const card = page.locator("article").filter({ has: page.getByRole("heading", { name: "Morango", exact: true }) });
    await expect(card.getByText("Esgotado", { exact: true })).toBeVisible();
    await expect(card.getByRole("button", { name: /Adicionar/ })).toHaveCount(0);
  });
});
