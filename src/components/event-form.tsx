"use client";
import { useRef, useState, type FormEvent } from "react";
import { MessageCircle, ArrowUpRight, LockKeyhole, CheckCircle2 } from "lucide-react";
import { createEventSchema, eventTypes, guestCounts, durations, localToday } from "@/lib/validation";
import { eventMessage, whatsappUrl } from "@/lib/whatsapp";
import { supabaseConfigured } from "@/lib/supabase";
import { saveEventRequest } from "@/lib/submissions";
type Errors = Record<string, string>;
export function EventForm() {
  const [pending, setPending] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const attempt = useRef<{ signature: string; id: string } | null>(null);
  const busy = useRef(false);
  const [errors, setErrors] = useState<Errors>({});
  const [link, setLink] = useState("");
  const [today] = useState(() => localToday());
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy.current) return;
    setLink(""); setSubmitError("");
    const result = createEventSchema().safeParse(Object.fromEntries(new FormData(e.currentTarget)));
    if (!result.success) {
      const next: Errors = {};
      result.error.issues.forEach(i => { const key = String(i.path[0]); if (!next[key]) next[key] = i.message; });
      setErrors(next); setLink("");
      document.getElementById(String(result.error.issues[0].path[0]))?.focus();
      return;
    }
    setErrors({});
    busy.current = true; setPending(true);
    try {
      let reference = "";
      if (supabaseConfigured) {
        const signature = JSON.stringify(result.data);
        if (attempt.current?.signature !== signature) attempt.current = { signature, id: crypto.randomUUID() };
        await saveEventRequest(attempt.current.id, result.data);
        reference = `\n\nReferência do orçamento: ${attempt.current.id}`;
      }
      const url = whatsappUrl(eventMessage(result.data) + reference);
      setLink(url);
      if (!supabaseConfigured) window.open(url, "_blank", "noopener,noreferrer");
    } catch (cause) {
      setSubmitError(cause instanceof Error ? cause.message : "Não foi possível registrar. Tente novamente.");
    } finally { busy.current = false; setPending(false); }
  }
  const props = (name: string) => ({ id: name, name, "aria-invalid": Boolean(errors[name]), "aria-describedby": errors[name] ? `${name}-error` : undefined });
  const error = (name: string) => errors[name] && <span id={`${name}-error`} className="field-error">{errors[name]}</span>;
  return <form className="event-form" onSubmit={submit} noValidate>
    <div className="form-intro"><span className="eyebrow">VAMOS PLANEJAR ESSE MOMENTO?</span><h2>Conte sobre o seu evento<span>.</span></h2><p>Preencha os detalhes. A conversa continua pelo WhatsApp.</p></div>
    {Object.keys(errors).length > 0 && <p role="alert" className="form-alert">Revise os campos indicados para continuar.</p>}
    {submitError && <p role="alert" className="form-alert">{submitError}</p>}
    <fieldset disabled={pending} style={{ border: 0, padding: 0, margin: 0 }}><div className="form-grid">
      <div className="field full-field"><label htmlFor="name">Seu nome <span>*</span></label><input {...props("name")} autoComplete="name" placeholder="Como podemos chamar você?" maxLength={80} required />{error("name")}</div>
      <div className="field"><label htmlFor="type">Tipo de evento <span>*</span></label><select {...props("type")} defaultValue="" required><option value="" disabled>Selecione o tipo</option>{eventTypes.map(t => <option key={t}>{t}</option>)}</select>{error("type")}</div>
      <div className="field"><label htmlFor="date">Data do evento <span>*</span></label><input {...props("date")} type="date" min={today} required />{error("date")}</div>
      <div className="field"><label htmlFor="guests">Estimativa de convidados <span>*</span></label><select {...props("guests")} defaultValue="" required><option value="" disabled>Quantas pessoas?</option>{guestCounts.map(g => <option key={g}>{g}</option>)}</select>{error("guests")}</div>
      <div className="field"><label htmlFor="time">Horário <small>opcional</small></label><input {...props("time")} type="time" />{error("time")}</div>
      <div className="field full-field"><label htmlFor="location">Cidade e local do evento <span>*</span></label><input {...props("location")} placeholder="Ex.: Uberlândia — Salão Jardim" maxLength={160} required />{error("location")}</div>
      <div className="field full-field"><label htmlFor="duration">Duração estimada <small>opcional</small></label><select {...props("duration")} defaultValue=""><option value="">Selecione a duração</option>{durations.filter(Boolean).map(d => <option key={d}>{d}</option>)}</select>{error("duration")}</div>
      <div className="field full-field"><label htmlFor="notes">Algo mais que precisamos saber? <small>opcional</small></label><textarea {...props("notes")} rows={3} maxLength={600} placeholder="Conte um pouco sobre o seu evento..." />{error("notes")}<small>Até 600 caracteres. Evite informações sensíveis.</small></div>
    </div></fieldset><p className="form-privacy"><LockKeyhole size={16} /> {supabaseConfigured ? "Ao solicitar, salvamos os dados do evento para preparar seu orçamento. A equipe terá acesso a essas informações. Continue pelo WhatsApp para conversar conosco." : "Seus dados ficam apenas nesta página até você enviar a mensagem no WhatsApp. Não salvamos o formulário."}</p>
    <button className="button button-primary full" type="submit" disabled={pending}><MessageCircle size={19} /> {pending ? "Registrando solicitação..." : "Solicitar orçamento"} <ArrowUpRight size={18} /></button><p className="form-footnote">* Campos obrigatórios. Disponibilidade e condições sob consulta.</p>
    {link && <div className="form-success" role="status"><CheckCircle2 size={22} /><div><strong>{supabaseConfigured ? "Solicitação registrada." : "Sua mensagem está pronta."}</strong><p>Continue no WhatsApp para combinar os detalhes: <a href={link} target="_blank" rel="noopener noreferrer">continue por aqui</a>.</p></div></div>}
  </form>;
}

