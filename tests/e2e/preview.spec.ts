import { test, expect } from "@playwright/test";
import path from "node:path";
import fs from "node:fs/promises";
test("capturas para revisão visual", async ({ page }, testInfo) => {
  test.skip(!process.env.SITE_PREVIEW_DIR, "Capturas opcionais; defina SITE_PREVIEW_DIR.");
  const dir = path.resolve(process.env.SITE_PREVIEW_DIR!);
  await fs.mkdir(dir, { recursive: true });
  await page.setViewportSize(testInfo.project.name === "desktop" ? { width: 1440, height: 1000 } : { width: 390, height: 844 });
  for (const [name, route] of [["inicio", "/"], ["produtos", "/produtos/"], ["eventos", "/eventos/"]]) {
    await page.goto(route);
    await page.evaluate(() => document.fonts.ready);
    for (const image of await page.locator("main img").all()) {
      await image.scrollIntoViewIfNeeded();
      await expect(image).toHaveJSProperty("complete", true);
    }
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
    if (name === "inicio" || name === "eventos") await page.screenshot({ path: path.join(dir, `${name}-${testInfo.project.name}-destaque.png`), animations: "disabled" });
    if (name === "inicio") await page.locator(".event-banner").screenshot({ path: path.join(dir, `foodbike-${testInfo.project.name}.png`), animations: "disabled" });
    await page.screenshot({ path: path.join(dir, `${name}-${testInfo.project.name}.png`), fullPage: true, animations: "disabled" });
  }
});
