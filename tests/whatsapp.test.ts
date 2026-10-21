import { describe, it, expect } from "vitest";
import { whatsappUrl, orderMessage, eventMessage } from "@/lib/whatsapp";
import type { EventRequest } from "@/lib/validation";
const request: EventRequest = { name: "João & Ana", type: "Casamento", date: "2099-12-20", guests: "De 51 a 100", location: "Salão São José", time: "", duration: "", notes: "" };
describe("WhatsApp", () => {
  it("mantém host fixo, telefone normalizado e texto codificado", () => {
    const text = "Olá, João!\nAção & frutas + limão #teste";
    const url = new URL(whatsappUrl(text));
    expect(url.origin).toBe("https://wa.me");
    expect(url.pathname).toBe("/5534996493471");
    expect(url.searchParams.get("text")).toBe(text);
    expect(url.hash).toBe("");
    expect(url.href).toContain("%0A");
  });
  it.each(["javascript:alert(1)", "//evil.test", "123", "+00 123456789", "https://wa.me/5512345678901", "551234567890123456"])("rejeita destino inválido %s", number => expect(() => whatsappUrl("Olá", number)).toThrow());
  it("rejeita mensagem vazia ou desproporcional", () => { expect(() => whatsappUrl(" ")).toThrow(); expect(() => whatsappUrl("a".repeat(20001))).toThrow(); });
  it("inclui unidades, subtotais e aviso comercial", () => {
    const text = orderMessage([{ id: "morango", quantity: 2 }, { id: "maracuja", quantity: 1 }]);
    expect(text).toContain("2x Polpa de Morango (100 g)");
    expect(text).toContain("subtotal");
    expect(text).toContain("TOTAL ESTIMADO");
    expect(text).toContain("DEMONSTRATIVO");
    expect(text).toContain("entrega ou retirada");
  });
  it("recusa pedido vazio e produtos inválidos", () => { expect(() => orderMessage([])).toThrow(); expect(() => orderMessage([{ id: "x", quantity: 1 }])).toThrow(); });
  it("formata orçamento com acentos e sem campos opcionais vazios", () => {
    const text = eventMessage(request);
    expect(text).toContain("João & Ana"); expect(text).toContain("20/12/2099");
    expect(text).not.toContain("Horário:"); expect(text).not.toContain("Duração:"); expect(text).not.toContain("OBSERVAÇÕES:");
  });
  it("inclui campos opcionais preenchidos", () => {
    const text = eventMessage({ ...request, time: "18:30", duration: "Até 2 horas", notes: "Local coberto.\nObrigada!" });
    expect(text).toContain("Horário: 18:30"); expect(text).toContain("Duração: Até 2 horas"); expect(text).toContain("Local coberto.\nObrigada!");
  });
  it("codifica conteúdo potencialmente malicioso como texto", () => {
    const value = { ...request, name: "<script>alert(1)</script>" };
    const url = whatsappUrl(eventMessage(value));
    expect(url).not.toContain("<script>");
    expect(new URL(url).searchParams.get("text")).toContain(value.name);
  });
});

