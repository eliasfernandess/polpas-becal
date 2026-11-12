import { describe, it, expect } from "vitest";
import { whatsappUrl, orderMessage, eventMessage } from "@/lib/whatsapp";
import { checkoutSchema, formatPhone, formatPostalCode } from "@/lib/validation";
import type { EventRequest } from "@/lib/validation";
const request: EventRequest = { name: "João & Ana", phone: "34999990000", type: "Casamento", date: "2099-12-20", guests: "De 51 a 100", location: "Salão São José", time: "", duration: "", notes: "" };
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
    expect(text).toContain("TOTAL: R$");
    expect(text).not.toMatch(/demonstrativ/i);
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


describe("checkout", () => {
  const base = { name: " Ana Souza ", phone: "(34) 99999-0000", fulfillment: "entrega" as const, postalCode: "38400-000", street: "Rua das Frutas", number: "10", complement: "", district: "Centro", city: "Uberlândia" };
  it("normaliza telefone e CEP", () => {
    expect(checkoutSchema.parse(base)).toMatchObject({ name: "Ana Souza", phone: "34999990000", postalCode: "38400000" });
  });
  it.each(["123", "(00) 99999-0000", "34 9999", "349999900001"])("recusa telefone %s", phone => expect(checkoutSchema.safeParse({ ...base, phone }).success).toBe(false));
  it("exige endereço só na entrega e aponta o campo", () => {
    const result = checkoutSchema.safeParse({ ...base, street: "", postalCode: "123" });
    expect(result.success).toBe(false);
    expect(result.error!.issues.map(i => i.path[0]).sort()).toEqual(["postalCode", "street"]);
    expect(checkoutSchema.parse({ ...base, fulfillment: "retirada", street: "", postalCode: "" })).toMatchObject({ fulfillment: "retirada", street: "", city: "" });
  });
  it("recusa forma de recebimento vazia", () => expect(checkoutSchema.safeParse({ ...base, fulfillment: "" }).success).toBe(false));
  it("formata enquanto digita", () => {
    expect(formatPhone("3")).toBe("(3");
    expect(formatPhone("3433")).toBe("(34) 33");
    expect(formatPhone("3433334444")).toBe("(34) 3333-4444");
    expect(formatPhone("34999990000")).toBe("(34) 99999-0000");
    expect(formatPostalCode("38400000")).toBe("38400-000");
  });
  it("leva cliente e entrega para a mensagem do pedido", () => {
    const text = orderMessage([{ id: "morango", quantity: 2 }], undefined, checkoutSchema.parse(base));
    expect(text).toContain("Nome: Ana Souza");
    expect(text).toContain("Telefone: (34) 99999-0000");
    expect(text).toContain("Entrega: Rua das Frutas, 10 — Centro, Uberlândia — CEP 38400-000");
    const pickup = orderMessage([{ id: "morango", quantity: 2 }], undefined, checkoutSchema.parse({ ...base, fulfillment: "retirada" }));
    expect(pickup).toContain("Retirada no local");
    expect(pickup).not.toContain("Entrega:");
  });
  it("inclui o telefone no orçamento", () => expect(eventMessage(request)).toContain("Telefone: (34) 99999-0000"));
});
