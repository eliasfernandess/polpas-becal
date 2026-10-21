import { test, expect } from "@playwright/test";
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
test("orçamento validado, WhatsApp codificado e nenhum dado persistido", async ({ page }) => {
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
  await expect(page.getByText("Sua mensagem está pronta.")).toBeVisible();
  const target = await page.evaluate(() => (window as unknown as { capturedWhatsApp: string }).capturedWhatsApp);
  const url = new URL(target);
  expect(url.origin).toBe("https://wa.me");
  expect(url.searchParams.get("text")).toContain("João & Ana");
  expect(url.searchParams.get("text")).toContain("20/12/2099");
  expect(url.searchParams.get("text")).toContain("Salão São José");
  const saved = await page.evaluate(() => JSON.stringify({ ...localStorage, ...sessionStorage }));
  expect(saved).not.toContain("João"); expect(saved).not.toContain("Salão"); expect(externalRequests).toEqual([]);
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

