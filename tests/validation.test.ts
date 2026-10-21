import { describe, it, expect } from "vitest";
import { createEventSchema, isCalendarDate, localToday } from "@/lib/validation";
const schema = createEventSchema("2026-10-20");
const valid = { name: "Maria", type: "Aniversário", date: "2026-10-20", guests: "Até 50", location: "Salão Primavera" };
describe("formulário de evento", () => {
  it("aceita hoje sem opcionais", () => expect(schema.safeParse(valid).success).toBe(true));
  it("remove espaços e preenche opcionais com strings vazias", () => { const result = schema.parse({ ...valid, name: "  Maria  " }); expect(result.name).toBe("Maria"); expect(result.notes).toBe(""); });
  it("rejeita obrigatórios ausentes", () => expect(schema.safeParse({}).success).toBe(false));
  it.each(["", "20/10/2026", "2026-02-30", "2026-13-01", "2026-10-19", "2026-1-1"])("rejeita data inválida ou passada %s", date => expect(schema.safeParse({ ...valid, date }).success).toBe(false));
  it("aceita data bissexta real", () => { expect(isCalendarDate("2028-02-29")).toBe(true); expect(isCalendarDate("2027-02-29")).toBe(false); });
  it.each([{ name: "a".repeat(81) }, { location: "a".repeat(161) }, { notes: "a".repeat(601) }, { type: "invalid" }, { guests: "123" }, { time: "24:01" }, { time: "3:00" }, { duration: "10 dias" }, { name: "João\nLocal: outro" }, { extra: "surprise" }])("rejeita dados inesperados: %j", override => expect(schema.safeParse({ ...valid, ...override }).success).toBe(false));
  it("permite quebras de linha apenas nas observações", () => expect(schema.safeParse({ ...valid, notes: "Primeiro\nSegundo" }).success).toBe(true));
  it("produz a data local sem conversão para UTC", () => expect(localToday(new Date(2026, 9, 20, 0, 5))).toBe("2026-10-20"));
});

