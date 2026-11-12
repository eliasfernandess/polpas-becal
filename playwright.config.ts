import { defineConfig, devices } from "@playwright/test";
import nextEnv from "@next/env";
// Mesmas variáveis do build: os testes sabem se a saída está em modo demonstração ou ligada ao Supabase.
nextEnv.loadEnvConfig(process.cwd());
export default defineConfig({
  testDir: "./tests/e2e", fullyParallel: false,
  use: { baseURL: "http://127.0.0.1:3000", trace: "retain-on-failure", screenshot: "only-on-failure" },
  webServer: { command: "node scripts/serve.mjs", url: "http://127.0.0.1:3000", reuseExistingServer: !process.env.CI },
  projects: [{ name: "desktop", use: { ...devices["Desktop Chrome"], channel: "chrome" } }, { name: "mobile", use: { ...devices["iPhone 13"], defaultBrowserType: "chromium", channel: "chrome" } }],
});
