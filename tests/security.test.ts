import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import path from "node:path";
function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? sourceFiles(path.join(dir, entry.name)) : /\.[jt]sx?$/.test(entry.name) ? [path.join(dir, entry.name)] : []);
}
describe("superfície da aplicação", () => {
  it("não cria endpoints de escrita ou ações de servidor", () => {
    expect(existsSync("src/app/api")).toBe(false);
    for (const file of sourceFiles("src")) expect(readFileSync(file, "utf8")).not.toMatch(/["']use server["']/);
  });
  it("não insere HTML bruto nem executa conteúdo textual", () => {
    for (const file of sourceFiles("src")) expect(readFileSync(file, "utf8")).not.toMatch(/dangerouslySetInnerHTML|\beval\s*\(|new Function\s*\(/);
  });
  it("não contém credenciais privadas reconhecíveis no código público", () => {
    for (const file of sourceFiles("src")) expect(readFileSync(file, "utf8")).not.toMatch(/sk_(?:live|test)_[A-Za-z0-9]{20,}|ghp_[A-Za-z0-9]{30,}|-----BEGIN (?:RSA )?PRIVATE KEY-----/);
  });
  it("o único armazenamento de dados persistentes é o carrinho", () => {
    const form = readFileSync("src/components/event-form.tsx", "utf8");
    expect(form).not.toMatch(/localStorage|sessionStorage|fetch\s*\(|console\./);
  });
});

