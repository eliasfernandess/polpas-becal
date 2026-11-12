import { test, expect } from "@playwright/test";
import { products } from "../../src/data/products";
test.beforeEach(async ({ page }) => {
  await page.route("**/rest/v1/**", async route => {
    const request = route.request();
    const url = new URL(request.url());
    if (request.method() === "GET" && url.pathname === "/rest/v1/products") {
      return route.fulfill({ json: products.map((p, sort_order) => ({ id:p.id,name:p.name,description:p.description,image:p.image,price_in_cents:p.priceInCents,unit_label:p.unitLabel,category:p.category,available:p.available,featured:p.featured,tone:p.tone,sort_order })) });
    }
    if (request.method() === "POST" && ["/rest/v1/orders", "/rest/v1/event_requests"].includes(url.pathname)) return route.fulfill({ status: 201, body: "" });
    return route.fulfill({ status: 403, json: { message: "Forbidden" } });
  });
});
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
  const orderRequest = page.waitForRequest(req => req.url().includes("/rest/v1/orders") && req.method() === "POST");
  await dialog.getByRole("button", { name: "Registrar pedido", exact: true }).click();
  const submitted = (await orderRequest).postDataJSON();
  expect(submitted.items).toEqual([{ id: "maracuja", quantity: 2 }]);
  expect(submitted.total_in_cents).toBe(900);
  await expect(dialog.getByText("Pedido registrado.", { exact: false })).toBeVisible();
  const link = dialog.getByRole("link", { name: "Continuar no WhatsApp" });
  const url = new URL((await link.getAttribute("href"))!);
  expect(url.host).toBe("wa.me"); expect(url.searchParams.get("text")).toContain("2x Polpa de Maracujá");
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
test("orçamento registrado e WhatsApp codificado sem dados pessoais no navegador", async ({ page }) => {
  const externalRequests: string[] = [];
  page.on("request", req => { if (!req.url().startsWith("http://127.0.0.1:3000")) externalRequests.push(req.url()); });
  await page.addInitScript(() => { window.open = (url) => { (window as unknown as { capturedWhatsApp: string }).capturedWhatsApp = String(url); return null; }; });
  await page.goto("/eventos/");
  await page.getByRole("button", { name: "Solicitar orçamento", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Revise" })).toBeVisible();
  await page.getByLabel("Seu nome", { exact: false }).fill("João & Ana");
  await page.getByLabel("Tipo de evento").selectOption("Casamento");
  await page.getByLabel("Data do evento").fill("2099-12-20");
  await page.getByLabel("Estimativa de convidados").selectOption("De 51 a 100");
  await page.getByLabel("Cidade e local do evento").fill("Salão São José");
  await page.getByRole("button", { name: "Solicitar orçamento", exact: true }).click();
  await expect(page.getByText("Solicitação registrada.")).toBeVisible();
  const target = await page.locator(".form-success a").getAttribute("href");
  const url = new URL(target!);
  expect(url.origin).toBe("https://wa.me");
  expect(url.searchParams.get("text")).toContain("João & Ana");
  expect(url.searchParams.get("text")).toContain("20/12/2099");
  expect(url.searchParams.get("text")).toContain("Salão São José");
  const saved = await page.evaluate(() => JSON.stringify({ ...localStorage, ...sessionStorage }));
  expect(saved).not.toContain("João"); expect(saved).not.toContain("Salão"); expect(externalRequests.some(url => url.includes("/rest/v1/event_requests"))).toBe(true);
  await expect(page.getByLabel("Seu nome", { exact: false })).toHaveValue("João & Ana");
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
    const smallLayout = await page.evaluate(() => ({ width: innerWidth, scroll: document.documentElement.scrollWidth, elements: [...document.querySelectorAll("body *")].filter(el => el.getBoundingClientRect().right > innerWidth + 1).map(el => ({ className: el.className, right: el.getBoundingClientRect().right })) }));
    expect(smallLayout.scroll <= smallLayout.width, `${route}: ${JSON.stringify(smallLayout)}`).toBe(true);
  }
  await page.getByRole("button", { name: "Abrir menu", exact: true }).click();
  await page.getByRole("navigation", { name: "Navegação principal" }).getByRole("link", { name: "Nossas polpas" }).click();
  await expect(page).toHaveURL(/produtos/);
});
test("armazenamento adulterado e indisponibilidade são tratados", async ({ page }) => {
  await page.goto("/produtos/");
  await page.evaluate(() => localStorage.setItem("becal:cart:v1", JSON.stringify([{ id: "manga", quantity: -5 }, { id: "tamarindo", quantity: 2 }, { id: "morango", quantity: 2 }])));
  await page.reload();
  await page.getByRole("button", { name: "Abrir carrinho, 2 itens" }).click();
  await expect(page.getByRole("dialog").getByRole("heading", { name: "Morango", exact: true })).toBeVisible();
  await expect(page.getByRole("dialog").getByRole("heading", { name: "Manga", exact: true })).toHaveCount(0);
});


test("falha de envio mantém o formulário e reutiliza a referência na tentativa seguinte", async ({ page }) => {
  const ids: string[] = [];
  await page.route("**/rest/v1/event_requests", route => {
    ids.push(route.request().postDataJSON().id);
    return ids.length === 1 ? route.fulfill({ status: 503, json: { message: "Unavailable" } }) : route.fulfill({ status: 201, body: "" });
  });
  await page.goto("/eventos/");
  await page.getByLabel("Seu nome", { exact: false }).fill("Teste de integração");
  await page.getByLabel("Tipo de evento").selectOption("Casamento");
  await page.getByLabel("Data do evento").fill("2099-12-20");
  await page.getByLabel("Estimativa de convidados").selectOption("De 51 a 100");
  await page.getByLabel("Cidade e local do evento").fill("Local de teste");
  await page.getByRole("button", { name: "Solicitar orçamento", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Não foi possível registrar" })).toBeVisible();
  await expect(page.getByLabel("Seu nome", { exact: false })).toHaveValue("Teste de integração");
  await expect(page.locator(".form-success")).toHaveCount(0);
  await page.getByRole("button", { name: "Solicitar orçamento", exact: true }).click();
  await expect(page.getByText("Solicitação registrada.")).toBeVisible();
  expect(ids).toHaveLength(2);
  expect(ids[0]).toBe(ids[1]);
});
test("falha do catálogo não mostra preços locais nem permite comprar", async ({ page }) => {
  await page.route("**/rest/v1/products*", route => route.fulfill({ status: 503, json: { message: "Unavailable" } }));
  await page.goto("/produtos/");
  await expect(page.getByRole("alert").filter({ hasText: "Não foi possível carregar" })).toBeVisible({ timeout: 20000 });
  await expect(page.locator(".product-card")).toHaveCount(0);
});
