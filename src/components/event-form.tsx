"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { ArrowLeft, ArrowRight, ArrowUpRight, BriefcaseBusiness, Cake, Check, CheckCircle2, GraduationCap, Heart, LockKeyhole, MessageCircle, Sparkles, type LucideIcon } from "lucide-react";
import { saveEventRequest } from "@/lib/submissions";
import { supabaseConfigured } from "@/lib/supabase";
import { createEventSchema, durations, eventTypes, guestCounts, localToday } from "@/lib/validation";
import { eventMessage, whatsappUrl } from "@/lib/whatsapp";

type Field = "type" | "date" | "time" | "location" | "guests" | "duration" | "name" | "notes";
type Values = Record<Field, string>;
type Errors = Partial<Record<Field, string>>;

const empty: Values = { type: "", date: "", time: "", location: "", guests: "", duration: "", name: "", notes: "" };
const steps: { label: string; title: string; hint: string; fields: Field[] }[] = [
  { label: "Ocasião", title: "Qual é a ocasião?", hint: "Escolha a que mais se parece com o seu evento.", fields: ["type"] },
  { label: "Data e local", title: "Quando e onde vai ser?", hint: "Uma data aproximada já ajuda a consultar a agenda.", fields: ["date", "time", "location"] },
  { label: "Tamanho", title: "Para quantas pessoas?", hint: "Uma estimativa basta. Dá para ajustar depois.", fields: ["guests", "duration"] },
  { label: "Você", title: "Como podemos chamar você?", hint: "É o nome que vai na mensagem para a equipe.", fields: ["name", "notes"] },
  { label: "Revisão", title: "Tudo certo?", hint: "Confira antes de abrir o WhatsApp. Nada é enviado sem você.", fields: [] },
];
const last = steps.length - 1;
const typeIcons: Record<(typeof eventTypes)[number], LucideIcon> = { "Aniversário": Cake, "Casamento": Heart, "Evento corporativo": BriefcaseBusiness, "Formatura": GraduationCap, "Outros": Sparkles };
const brDate = (value: string) => value.split("-").reverse().join("/");

export function EventForm() {
  const [values, setValues] = useState<Values>(empty);
  const [step, setStep] = useState(0);
  const [reached, setReached] = useState(0);
  const [errors, setErrors] = useState<Errors>({});
  const [link, setLink] = useState("");
  const [pending, setPending] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [today] = useState(() => localToday());
  const heading = useRef<HTMLHeadingElement>(null);
  const moved = useRef(false);
  // Mesmos dados, mesma referência: reenviar após uma falha não duplica o orçamento no banco.
  const attempt = useRef<{ signature: string; id: string } | null>(null);
  const busy = useRef(false);

  // Ao trocar de etapa, o foco vai para o título dela (leitores de tela e teclado acompanham).
  useEffect(() => { if (moved.current) heading.current?.focus(); }, [step]);

  const set = (field: Field, value: string) => {
    setValues(current => ({ ...current, [field]: value }));
    setErrors(current => ({ ...current, [field]: undefined }));
    setLink("");
    setSubmitError("");
  };
  const check = (fields: Field[]): Errors => {
    const result = createEventSchema().safeParse(values);
    const found: Errors = {};
    if (!result.success) for (const issue of result.error.issues) {
      const key = String(issue.path[0]) as Field;
      if (fields.includes(key)) found[key] ||= issue.message;
    }
    return found;
  };
  const [direction, setDirection] = useState<"forward" | "back">("forward");
  const go = (index: number) => { moved.current = true; setErrors({}); setDirection(index < step ? "back" : "forward"); setStep(index); setReached(current => Math.max(current, index)); };
  const fail = (found: Errors) => {
    setErrors(found);
    const first = Object.keys(found)[0];
    (document.getElementById(first) ?? document.querySelector<HTMLElement>(`[name="${first}"]`))?.focus();
  };

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy.current) return;
    if (step < last) {
      const found = check(steps[step].fields);
      if (Object.keys(found).length) fail(found); else go(step + 1);
      return;
    }
    const result = createEventSchema().safeParse(values);
    if (!result.success) {
      // Algo mudou depois da revisão: volta para a primeira etapa com pendência.
      const field = String(result.error.issues[0].path[0]) as Field;
      const index = steps.findIndex(s => s.fields.includes(field));
      go(index);
      setErrors(check(steps[index].fields));
      return;
    }
    if (!supabaseConfigured) {
      const url = whatsappUrl(eventMessage(result.data));
      setLink(url);
      window.open(url, "_blank", "noopener,noreferrer");
      return;
    }
    // Com o banco configurado, a solicitação é registrada antes; o WhatsApp leva a referência.
    // A janela não abre sozinha: depois da espera, o navegador a bloquearia.
    const signature = JSON.stringify(result.data);
    if (attempt.current?.signature !== signature) attempt.current = { signature, id: crypto.randomUUID() };
    const request = attempt.current;
    busy.current = true; setPending(true); setSubmitError(""); setLink("");
    try {
      await saveEventRequest(request.id, result.data);
      setLink(whatsappUrl(`${eventMessage(result.data)}\n\nReferência do orçamento: ${request.id}`));
    } catch (cause) {
      setSubmitError(cause instanceof Error ? cause.message : "Não foi possível registrar. Tente novamente.");
    } finally { busy.current = false; setPending(false); }
  }

  const input = (name: Field) => ({ id: name, name, value: values[name], "aria-invalid": Boolean(errors[name]), "aria-describedby": errors[name] ? `${name}-error` : undefined });
  const error = (name: Field) => errors[name] && <span id={`${name}-error`} className="field-error">{errors[name]}</span>;
  const hasErrors = Object.values(errors).some(Boolean);
  const chosen = [values.type, values.date && brDate(values.date), values.location, values.guests && `${values.guests} convidados`].filter(Boolean);
  const current = steps[step];

  return <form className="event-form" onSubmit={submit} noValidate>
    <div className="form-progress">
      <ol className="form-steps" aria-label="Etapas do orçamento">
        {steps.map((s, index) => <li key={s.label} data-state={index === step ? "current" : index < step ? "done" : "todo"}>
          <button type="button" onClick={() => go(index)} disabled={index > reached || index === step} aria-current={index === step ? "step" : undefined} aria-label={`Etapa ${index + 1}: ${s.label}`}>
            <span aria-hidden="true">{index < step ? <Check size={14} /> : index + 1}</span><em>{s.label}</em>
          </button>
        </li>)}
      </ol>
      <div className="form-bar" aria-hidden="true"><i style={{ width: `${(step / last) * 100}%` }} /></div>
    </div>

    <div className="form-intro">
      <span className="eyebrow">Etapa {step + 1} de {steps.length}</span>
      <h2 ref={heading} tabIndex={-1}>{current.title}</h2>
      <p>{current.hint}</p>
      {step > 0 && step < last && chosen.length > 0 && <p className="form-chosen" aria-label="Escolhas até aqui">{chosen.map(item => <span key={item}>{item}</span>)}</p>}
    </div>

    {hasErrors && <p role="alert" className="form-alert">Revise o que está indicado para continuar.</p>}

    {/* A chave muda a cada etapa: o conteúdo novo entra deslizando, na direção do avanço. */}
    <div className="form-step" key={step} data-direction={direction}>

    {step === 0 && <fieldset className="choice-grid" aria-describedby={errors.type ? "type-error" : undefined}>
      <legend className="sr-only">Tipo de evento</legend>
      {eventTypes.map(type => { const Icon = typeIcons[type]; return <label key={type} className="choice-card">
        <input type="radio" name="type" value={type} checked={values.type === type} onChange={() => set("type", type)} />
        <Icon size={24} strokeWidth={1.5} aria-hidden="true" /><span>{type}</span>
      </label>; })}
      {error("type")}
    </fieldset>}

    {step === 1 && <div className="form-grid">
      <div className="field"><label htmlFor="date">Data do evento <span>*</span></label><input {...input("date")} type="date" min={today} onChange={e => set("date", e.target.value)} required />{error("date")}</div>
      <div className="field"><label htmlFor="time">Horário <small>opcional</small></label><input {...input("time")} type="time" onChange={e => set("time", e.target.value)} />{error("time")}</div>
      <div className="field full-field"><label htmlFor="location">Cidade e local do evento <span>*</span></label><input {...input("location")} onChange={e => set("location", e.target.value)} placeholder="Ex.: Uberlândia — Salão Jardim" maxLength={160} required />{error("location")}</div>
    </div>}

    {step === 2 && <>
      <fieldset className="choice-grid" aria-describedby={errors.guests ? "guests-error" : undefined}>
        <legend>Estimativa de convidados <span>*</span></legend>
        {guestCounts.map((count, index) => <label key={count} className="choice-card">
          <input type="radio" name="guests" value={count} checked={values.guests === count} onChange={() => set("guests", count)} />
          <span className="choice-scale" aria-hidden="true">{guestCounts.map((_, dot) => <i key={dot} data-on={dot <= index} />)}</span><span>{count}</span>
        </label>)}
        {error("guests")}
      </fieldset>
      <fieldset className="choice-chips">
        <legend>Duração estimada <small>opcional</small></legend>
        {durations.map(duration => <label key={duration || "none"}>
          <input type="radio" name="duration" value={duration} checked={values.duration === duration} onChange={() => set("duration", duration)} />
          <span>{duration || "Ainda não sei"}</span>
        </label>)}
      </fieldset>
    </>}

    {step === 3 && <div className="form-grid">
      <div className="field full-field"><label htmlFor="name">Seu nome <span>*</span></label><input {...input("name")} onChange={e => set("name", e.target.value)} autoComplete="name" placeholder="Como podemos chamar você?" maxLength={80} required />{error("name")}</div>
      <div className="field full-field">
        <label htmlFor="notes">Algo mais que precisamos saber? <small>opcional</small></label>
        <textarea {...input("notes")} onChange={e => set("notes", e.target.value)} rows={3} maxLength={600} placeholder="Sabores preferidos, espaço coberto, tema da festa…" />
        {error("notes")}
        <small>{values.notes.length} de 600 caracteres. Evite informações sensíveis.</small>
      </div>
    </div>}

    {step === last && <>
      <dl className="form-review">
        {([
          [0, "Ocasião", values.type],
          [1, "Quando", [values.date && brDate(values.date), values.time && `às ${values.time}`].filter(Boolean).join(" ")],
          [1, "Onde", values.location],
          [2, "Convidados", [values.guests, values.duration].filter(Boolean).join(" · ")],
          [3, "Nome", values.name],
          ...(values.notes.trim() ? [[3, "Observações", values.notes.trim()] as const] : []),
        ] as const).map(([target, label, value]) => <div key={label}>
          <dt>{label}</dt><dd>{value || "—"}</dd>
          <button type="button" className="text-button" onClick={() => go(target)} aria-label={`Editar ${label.toLowerCase()}`}>Editar</button>
        </div>)}
      </dl>
      <p className="form-privacy"><LockKeyhole size={16} /> {supabaseConfigured
        ? "Ao solicitar, salvamos os dados do evento para preparar seu orçamento. Só a equipe tem acesso. A conversa continua pelo WhatsApp."
        : "Seus dados ficam apenas nesta página até você enviar a mensagem no WhatsApp. Não salvamos o formulário."}</p>
    </>}

    </div>

    {submitError && step === last && <p role="alert" className="form-alert">{submitError}</p>}

    <div className="form-nav">
      {step > 0 && <button type="button" className="button button-ghost" onClick={() => go(step - 1)} disabled={pending}><ArrowLeft size={17} /> Voltar</button>}
      {step < last
        ? <button className="button button-primary" type="submit">Continuar <ArrowRight size={17} /></button>
        : supabaseConfigured && link
          ? <a className="button button-primary" href={link} target="_blank" rel="noopener noreferrer"><MessageCircle size={18} /> Continuar no WhatsApp <ArrowUpRight size={17} /></a>
          : <button className="button button-primary" type="submit" disabled={pending}><MessageCircle size={18} /> {pending ? "Registrando…" : "Solicitar orçamento"} <ArrowUpRight size={17} /></button>}
    </div>
    {step === last && <p className="form-footnote">Disponibilidade e condições sob consulta. O formulário não representa reserva.</p>}

    {link && step === last && <div className="form-success" role="status"><CheckCircle2 size={22} /><div>
      {supabaseConfigured
        ? <><strong>Solicitação registrada.</strong><p>Agora é só <a href={link} target="_blank" rel="noopener noreferrer">continuar no WhatsApp</a> para combinar os detalhes com a equipe.</p></>
        : <><strong>Sua mensagem está pronta.</strong><p>Envie no WhatsApp para compartilhar a solicitação. Caso a janela não tenha aberto, <a href={link} target="_blank" rel="noopener noreferrer">continue por aqui</a>.</p></>}
    </div></div>}
  </form>;
}
