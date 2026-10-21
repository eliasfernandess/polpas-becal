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
export function createEventSchema(today = localToday()) {
  return z.object({
    name: line(2, 80, "Informe seu nome (mínimo de 2 caracteres)."),
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

