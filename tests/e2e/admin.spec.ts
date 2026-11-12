import { test, expect } from "@playwright/test";
import fs from "node:fs/promises";
import type { Page } from "@playwright/test";

/** Vai para uma seção pelo menu lateral (no celular, abre a gaveta antes). */
async function openSection(page: Page, name: string) {
  const menu = page.getByRole("button", { name: "Abrir menu" });
  if (await menu.isVisible()) await menu.click();
  await page.getByRole("navigation", { name: "Seções do painel" }).getByRole("button", { name: new RegExp(`^${name}`) }).click();
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
}

// Estes cenários usam o modo demonstração (dados no navegador). Com Supabase, o painel exige login
// e as regras de acesso são testadas em supabase/tests/painel.sql.
test.skip(Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL), "Painel em modo demonstração: só no build sem Supabase.");
test("painel: cria produto, movimenta estoque e reflete na loja", async ({ page }) => {
  const failures: string[] = [];
  page.on("pageerror", error => failures.push(error.message));
  await page.goto("/admin/");
  await expect(page.getByText("Modo demonstração.")).toBeVisible();
  await expect(page.locator("h1")).toHaveCount(1);
  await expect(page.getByRole("heading", { name: "Repor primeiro" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Pedidos novos" })).toBeVisible();

  await openSection(page, "Produtos");
  await page.getByRole("button", { name: "Novo produto" }).click();
  const form = page.getByRole("dialog", { name: "Novo produto" });
  await form.getByRole("button", { name: "Criar produto" }).click();
  await expect(form.getByText("Informe o nome do sabor.")).toBeVisible();
  await form.getByLabel("Nome do sabor").fill("Goiaba Vermelha");
  await expect(form.getByLabel("Identificador")).toHaveValue("goiaba-vermelha");
  await form.getByLabel("Preço (R$)").fill("5,50");
  await form.getByLabel("Estoque inicial (un.)").fill("30");
  await form.getByRole("button", { name: "Criar produto" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Goiaba Vermelha criado." })).toBeVisible();

  await page.goto("/produtos/");
  await expect(page.getByRole("heading", { name: "Goiaba Vermelha", exact: true })).toBeVisible();
  await expect(page.getByText("R$ 5,50", { exact: true })).toBeVisible();

  await page.goto("/admin/");
  await openSection(page, "Produtos");
  await page.getByRole("button", { name: "Movimentar estoque de Goiaba Vermelha" }).click();
  const stock = page.getByRole("dialog", { name: "Movimentar Goiaba Vermelha" });
  await stock.getByText("Saída", { exact: true }).click();
  await stock.getByLabel("Quantidade (un.)").fill("31");
  await expect(stock.getByRole("alert")).toHaveText("Só há 30 un. em estoque.");
  await stock.getByLabel("Quantidade (un.)").fill("30");
  await stock.getByRole("button", { name: "Registrar saída" }).click();
  await expect(page.getByRole("status").filter({ hasText: "saldo de 0 un." })).toBeVisible();
  await openSection(page, "Movimentações");
  await expect(page.getByText("Estoque inicial")).toBeVisible();

  await page.goto("/produtos/");
  const card = page.locator("article").filter({ has: page.getByRole("heading", { name: "Goiaba Vermelha", exact: true }) });
  await expect(card.getByText("Esgotado", { exact: true })).toBeVisible();
  await expect(card.getByRole("button", { name: /Adicionar/ })).toHaveCount(0);

  await page.goto("/admin/");
  await openSection(page, "Produtos");
  await page.getByRole("button", { name: "Excluir Goiaba Vermelha" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Excluir produto" }).click();
  await expect(page.getByRole("button", { name: "Editar Goiaba Vermelha" })).toHaveCount(0);

  await page.setViewportSize({ width: 320, height: 740 });
  for (const tab of ["Início", "Pedidos", "Orçamentos", "Produtos", "Movimentações", "Equipe"]) {
    await openSection(page, tab);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `Sem overflow em ${tab}`).toBe(true);
  }
  expect(failures).toEqual([]);
});

test("painel: venda com vários itens, resumo do período e exportação", async ({ page }) => {
  await page.goto("/admin/");
  await page.getByRole("button", { name: "Registrar venda" }).click();
  const sale = page.getByRole("dialog", { name: "Registrar venda" });
  await sale.getByRole("button", { name: "Registrar venda" }).click();
  await expect(sale.getByRole("alert")).toHaveText("Informe a quantidade de ao menos um sabor.");
  await sale.getByLabel("Quantidade vendida de Morango").fill("12");
  await sale.getByRole("button", { name: "Aumentar Manga" }).click();
  // Não deixa vender mais do que há: o Limão começa com 14 un.
  await sale.getByLabel("Quantidade vendida de Limão").fill("999");
  await expect(sale.getByLabel("Quantidade vendida de Limão")).toHaveValue("14");
  await sale.getByLabel("Observação").fill("=Pedido da Ana");
  await sale.getByRole("button", { name: "Registrar venda" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Venda registrada: 27 un." })).toBeVisible();

  // Visão geral: o Limão zerou e entra em "Repor primeiro"; as vendas aparecem no período.
  await expect(page.getByRole("button", { name: "Repor Limão" })).toBeVisible();
  await expect(page.locator(".adm-period")).toContainText("27");
  await expect(page.locator(".adm-top-sold li").first()).toContainText("Limão");

  await openSection(page, "Movimentações");
  await page.getByRole("button", { name: "Vendas", exact: true }).click();
  await expect(page.locator(".adm-move")).toHaveCount(4); // cabeçalho + 3 itens
  const [file] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Exportar" }).click()]);
  expect(file.suggestedFilename()).toMatch(/^movimentacoes-\d{4}-\d{2}-\d{2}\.csv$/);
  const csv = await fs.readFile(await file.path(), "utf8");
  expect(csv).toContain("Morango;Venda;'=Pedido da Ana;-12;168"); // texto com "=" não vira fórmula na planilha
  expect(csv.split("\r\n").filter(Boolean)).toHaveLength(4);
});

test("painel: convites da equipe", async ({ page }) => {
  await page.goto("/admin/");
  await openSection(page, "Equipe");
  await expect(page.getByText("os convites são apenas simulados")).toBeVisible();
  await page.getByRole("button", { name: "Convidar pessoa" }).click();
  const invite = page.getByRole("dialog", { name: "Convidar pessoa" });
  await invite.getByRole("button", { name: "Criar convite" }).click();
  await expect(invite.getByText("Informe o nome da pessoa.")).toBeVisible();
  await expect(invite.getByText("Informe um e-mail válido.")).toBeVisible();
  await invite.getByLabel("Nome").fill("Ana Operadora");
  await invite.getByLabel("E-mail").fill("Ana@Exemplo.com");
  await invite.getByRole("button", { name: "Criar convite" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Convite criado para Ana Operadora." })).toBeVisible();
  await expect(page.getByText("ana@exemplo.com")).toBeVisible();
  await page.reload();
  await openSection(page, "Equipe");
  await page.getByRole("button", { name: "Cancelar convite" }).click();
  await expect(page.getByText("ana@exemplo.com")).toHaveCount(0);
});

test("painel: pedidos e orçamentos explicam que dependem do Supabase", async ({ page }) => {
  await page.goto("/admin/");
  await openSection(page, "Pedidos");
  await expect(page.getByText("Os pedidos aparecem aqui quando o site estiver ligado ao Supabase.")).toBeVisible();
  await openSection(page, "Orçamentos");
  await expect(page.getByText("Os orçamentos aparecem aqui quando o site estiver ligado ao Supabase.")).toBeVisible();
});
