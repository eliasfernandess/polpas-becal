import { z } from "zod";
export const eventTypes = ["Aniversário", "Casamento", "Evento corporativo", "Formatura", "Outros"] as const;
export const guestCounts = ["Até 50", "De 51 a 100", "De 101 a 200", "Acima de 200"] as const;
export const durations = ["", "Até 2 horas", "De 2 a 4 horas", "Mais de 4 horas", "A combinar"] as const;
export function localToday(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
export function isCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}
const line = (min: number, max: number, message: string) => z.string().trim().min(min, message).max(max, `Use no máximo ${max} caracteres.`).refine(v => !/[\u0000-\u001f\u007f]/.test(v), "Remova os caracteres de controle.");
/* ---------- Telefone e CEP ---------- */

export const digitsOnly = (value: string) => value.replace(/\D/g, "");
/** DDD + número: 10 dígitos (fixo) ou 11 (celular). */
export const isPhone = (digits: string) => /^[1-9][1-9]\d{8,9}$/.test(digits);
/** "34999990000" → "(34) 99999-0000", formatando enquanto a pessoa digita. */
export function formatPhone(value: string): string {
  const d = digitsOnly(value).slice(0, 11);
  if (d.length <= 2) return d.length ? `(${d}` : "";
  const rest = d.slice(2);
  const split = rest.length > 8 ? 5 : 4;
  return rest.length > split ? `(${d.slice(0, 2)}) ${rest.slice(0, split)}-${rest.slice(split)}` : `(${d.slice(0, 2)}) ${rest}`;
}
/** "38400000" → "38400-000". */
export function formatPostalCode(value: string): string {
  const d = digitsOnly(value).slice(0, 8);
  return d.length > 5 ? `${d.slice(0, 5)}-${d.slice(5)}` : d;
}
const phone = z.string().transform(digitsOnly).refine(isPhone, "Informe o telefone com DDD, ex.: (34) 99999-0000.");

/* ---------- Checkout ---------- */

export const fulfillments = ["entrega", "retirada"] as const;
export type Fulfillment = (typeof fulfillments)[number];
const optionalLine = (max: number) => z.string().trim().max(max, `Use no máximo ${max} caracteres.`).refine(v => !/[\u0000-\u001f\u007f]/.test(v), "Remova os caracteres de controle.");

export const checkoutSchema = z.object({
  name: line(2, 80, "Informe seu nome."),
  phone,
  fulfillment: z.enum(fulfillments, { error: "Escolha entrega ou retirada." }),
  postalCode: z.string().transform(digitsOnly),
  street: optionalLine(120),
  number: optionalLine(12),
  complement: optionalLine(60),
  district: optionalLine(60),
  city: optionalLine(60),
}).strict().superRefine((value, ctx) => {
  if (value.fulfillment !== "entrega") return;
  const need = (ok: boolean, path: string, message: string) => { if (!ok) ctx.addIssue({ code: "custom", path: [path], message }); };
  need(/^\d{8}$/.test(value.postalCode), "postalCode", "Informe o CEP com 8 números.");
  need(value.street.length >= 3, "street", "Informe a rua ou avenida.");
  need(value.number.length >= 1, "number", "Informe o número (ou \"s/n\").");
  need(value.district.length >= 2, "district", "Informe o bairro.");
  need(value.city.length >= 2, "city", "Informe a cidade.");
}).transform(value => value.fulfillment === "entrega" ? value : { ...value, postalCode: "", street: "", number: "", complement: "", district: "", city: "" });
export type CheckoutInput = z.input<typeof checkoutSchema>;
export type Checkout = z.output<typeof checkoutSchema>;

/* ---------- Orçamento da foodbike ---------- */

export function createEventSchema(today = localToday()) {
  return z.object({
    name: line(2, 80, "Informe seu nome (mínimo de 2 caracteres)."),
    phone,
    type: z.enum(eventTypes, { error: "Escolha o tipo de evento." }),
    date: z.string().refine(isCalendarDate, "Informe uma data válida.").refine(v => v >= today, "Escolha hoje ou uma data futura."),
    guests: z.enum(guestCounts, { error: "Informe a estimativa de convidados." }),
    location: line(3, 160, "Informe a cidade e o local do evento."),
    time: z.string().refine(v => v === "" || /^([01]\d|2[0-3]):[0-5]\d$/.test(v), "Informe um horário válido.").default(""),
    duration: z.enum(durations).default(""),
    notes: z.string().trim().max(600, "Use no máximo 600 caracteres.").refine(v => !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(v), "Remova os caracteres de controle.").default(""),
  }).strict();
}
export type EventRequest = z.infer<ReturnType<typeof createEventSchema>>;

