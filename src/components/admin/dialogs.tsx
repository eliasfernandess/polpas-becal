"use client";
import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from "react";
import { ImagePlus, X } from "lucide-react";
import { optimizeImage, type AdminRepo } from "@/lib/admin-repo";
import { MAX_STOCK, parsePrice, productSchema, slugify } from "@/lib/catalog";
import { money } from "@/lib/money";
import { toneIds, type Product, type ProductData, type Tone } from "@/types/product";

const message = (error: unknown) => error instanceof Error ? error.message : "Não foi possível concluir a operação.";

/** Janela modal sobre <dialog> nativo: foco preso, Escape e fundo inerte por conta do navegador. */
export function Modal({ title, onClose, children, busy = false }: { title: string; onClose: () => void; children: ReactNode; busy?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
    return () => dialog?.close();
  }, []);
  return <dialog ref={ref} className="adm-modal" aria-labelledby={titleId} onCancel={event => { event.preventDefault(); if (!busy) onClose(); }}>
    <header className="adm-modal-head">
      <h2 id={titleId}>{title}</h2>
      <button type="button" className="adm-icon" aria-label="Fechar" onClick={onClose} disabled={busy}><X size={18} /></button>
    </header>
    {children}
  </dialog>;
}

/* ---------- Produto ---------- */

const toneNames: Record<Tone, string> = { pink: "Rosa", red: "Vermelho", yellow: "Amarelo", peach: "Laranja", lime: "Lima", sage: "Verde", purple: "Roxo", sand: "Areia" };

const wholeNumber = (value: string) => /^\d{1,6}$/.test(value.trim()) ? Number(value.trim()) : NaN;

export function ProductDialog({ repo, product, categories, nextSort, onClose, onSaved }: {
  repo: AdminRepo; product: Product | null; categories: string[]; nextSort: number; onClose: () => void; onSaved: (name: string) => void;
}) {
  const editing = Boolean(product);
  const [name, setName] = useState(product?.name ?? "");
  const [customId, setCustomId] = useState<string | null>(null);
  const [description, setDescription] = useState(product?.description ?? "");
  const [price, setPrice] = useState(product ? (product.priceInCents / 100).toFixed(2).replace(".", ",") : "");
  const [unitLabel, setUnitLabel] = useState(product?.unitLabel ?? "100 g");
  const [category, setCategory] = useState(product?.category ?? categories[0] ?? "Clássicos");
  const [tone, setTone] = useState<Tone>(product?.tone ?? "yellow");
  const [stock, setStock] = useState("0");
  const [lowStock, setLowStock] = useState(String(product?.lowStock ?? 20));
  const [active, setActive] = useState(product?.active ?? true);
  const [featured, setFeatured] = useState(product?.featured ?? false);
  const [image, setImage] = useState(product?.image ?? "");
  const [photo, setPhoto] = useState<{ blob: Blob; preview: string } | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [failure, setFailure] = useState("");
  const [busy, setBusy] = useState(false);
  const id = product?.id ?? customId ?? slugify(name);
  useEffect(() => () => { if (photo) URL.revokeObjectURL(photo.preview); }, [photo]);

  async function pickPhoto(file: File | undefined) {
    if (!file) return;
    try {
      const blob = await optimizeImage(file, repo.mode === "local" ? 480 : 800);
      setPhoto({ blob, preview: URL.createObjectURL(blob) });
      setErrors(current => ({ ...current, image: "" }));
    } catch (error) { setErrors(current => ({ ...current, image: message(error) })); }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    const draft: ProductData = {
      id, name, description, image, priceInCents: parsePrice(price), unitLabel, category, tone,
      stock: editing ? product!.stock : wholeNumber(stock), lowStock: wholeNumber(lowStock),
      active, featured, sort: product?.sort ?? nextSort,
    };
    const checked = productSchema.safeParse(draft);
    if (!checked.success) {
      const next: Record<string, string> = {};
      for (const issue of checked.error.issues) { const key = String(issue.path[0]); next[key] ||= issue.message; }
      if (next.id && !editing && customId === null) next.name ||= "Informe o nome do sabor.";
      setErrors(next); setFailure("");
      return;
    }
    setErrors({}); setFailure(""); setBusy(true);
    try {
      const data = photo ? { ...checked.data, image: await repo.uploadImage(photo.blob, checked.data.id) } : checked.data;
      if (editing) await repo.update(product!.id, data); else await repo.create(data);
      onSaved(data.name);
    } catch (error) { setFailure(message(error)); setBusy(false); }
  }

  const field = (key: string) => ({ "aria-invalid": Boolean(errors[key]), "aria-describedby": errors[key] ? `pf-${key}-error` : undefined });
  const error = (key: string) => errors[key] && <span id={`pf-${key}-error`} className="adm-error">{errors[key]}</span>;
  const preview = photo?.preview ?? image;

  return <Modal title={editing ? `Editar ${product!.name}` : "Novo produto"} onClose={onClose} busy={busy}>
    <form className="adm-form" onSubmit={submit} noValidate>
      <div className="adm-form-body">
        <div className="adm-photo">
          <div className={`adm-photo-tile tone-${tone}`}>{preview ? <img src={preview} alt="" /> : <ImagePlus size={28} strokeWidth={1.5} />}</div>
          <div className="adm-photo-actions">
            <label className="adm-btn" htmlFor="pf-photo">{preview ? "Trocar foto" : "Enviar foto"}</label>
            <input id="pf-photo" className="sr-only" type="file" accept="image/png,image/jpeg,image/webp" onChange={event => { void pickPhoto(event.target.files?.[0]); event.target.value = ""; }} />
            {preview && <button type="button" className="adm-btn adm-btn-quiet" onClick={() => { setPhoto(null); setImage(""); }}>Remover</button>}
            <span className="adm-hint">PNG, JPG ou WebP. De preferência com fundo transparente.</span>
            {error("image")}
          </div>
        </div>

        <div className="adm-fields">
          <div className="adm-field span-2">
            <label htmlFor="pf-name">Nome do sabor</label>
            <input id="pf-name" value={name} onChange={event => setName(event.target.value)} maxLength={60} placeholder="Ex.: Goiaba" autoComplete="off" {...field("name")} />
            {error("name")}
          </div>
          {!editing && <div className="adm-field span-2">
            <label htmlFor="pf-id">Identificador <small>gerado a partir do nome</small></label>
            <input id="pf-id" value={id} onChange={event => setCustomId(event.target.value.toLowerCase())} maxLength={60} spellCheck={false} autoComplete="off" {...field("id")} />
            {error("id")}
          </div>}
          <div className="adm-field span-2">
            <label htmlFor="pf-description">Descrição <small>aparece no cartão da loja</small></label>
            <textarea id="pf-description" rows={2} value={description} onChange={event => setDescription(event.target.value)} maxLength={240} {...field("description")} />
            {error("description")}
          </div>
          <div className="adm-field">
            <label htmlFor="pf-price">Preço (R$)</label>
            <input id="pf-price" inputMode="decimal" value={price} onChange={event => setPrice(event.target.value)} placeholder="4,90" autoComplete="off" {...field("priceInCents")} />
            {error("priceInCents")}
          </div>
          <div className="adm-field">
            <label htmlFor="pf-unit">Unidade</label>
            <input id="pf-unit" value={unitLabel} onChange={event => setUnitLabel(event.target.value)} maxLength={20} placeholder="100 g" autoComplete="off" {...field("unitLabel")} />
            {error("unitLabel")}
          </div>
          <div className="adm-field span-2">
            <label htmlFor="pf-category">Categoria</label>
            <input id="pf-category" list="pf-categories" value={category} onChange={event => setCategory(event.target.value)} maxLength={30} autoComplete="off" {...field("category")} />
            <datalist id="pf-categories">{categories.map(c => <option key={c} value={c} />)}</datalist>
            {error("category")}
          </div>
          <fieldset className="adm-field span-2 adm-tones">
            <legend>Cor do cartão</legend>
            <div>{toneIds.map(t => <label key={t} className={`tone-${t}`} title={toneNames[t]}>
              <input type="radio" name="pf-tone" className="sr-only" checked={tone === t} onChange={() => setTone(t)} />
              <span aria-hidden="true" /><span className="sr-only">{toneNames[t]}</span>
            </label>)}</div>
          </fieldset>
          {editing
            ? <p className="adm-hint span-2">Estoque atual: <strong>{product!.stock} un.</strong> Para alterar, use <em>Movimentar</em> na lista — assim a mudança fica registrada.</p>
            : <div className="adm-field">
                <label htmlFor="pf-stock">Estoque inicial (un.)</label>
                <input id="pf-stock" inputMode="numeric" value={stock} onChange={event => setStock(event.target.value)} autoComplete="off" {...field("stock")} />
                {error("stock")}
              </div>}
          <div className={`adm-field ${editing ? "span-2" : ""}`}>
            <label htmlFor="pf-low">Avisar estoque baixo a partir de (un.)</label>
            <input id="pf-low" inputMode="numeric" value={lowStock} onChange={event => setLowStock(event.target.value)} autoComplete="off" {...field("lowStock")} />
            {error("lowStock")}
          </div>
          <label className="adm-check span-2"><input type="checkbox" checked={active} onChange={event => setActive(event.target.checked)} /><strong>Visível na loja</strong><small>Desmarque para ocultar sem excluir.</small></label>
          <label className="adm-check span-2"><input type="checkbox" checked={featured} onChange={event => setFeatured(event.target.checked)} /><strong>Destaque na página inicial</strong><small>A página inicial mostra até quatro destaques.</small></label>
        </div>
      </div>
      <footer className="adm-modal-foot">
        {failure && <p role="alert" className="adm-error">{failure}</p>}
        <button type="button" className="adm-btn adm-btn-quiet" onClick={onClose} disabled={busy}>Cancelar</button>
        <button type="submit" className="adm-btn adm-btn-primary" disabled={busy}>{busy ? "Salvando…" : editing ? "Salvar alterações" : "Criar produto"}</button>
      </footer>
    </form>
  </Modal>;
}

/* ---------- Movimentação de estoque ---------- */

const kinds = {
  in: { label: "Entrada", reasons: ["Produção", "Reposição", "Devolução"] },
  out: { label: "Saída", reasons: ["Venda", "Evento ou degustação", "Perda ou vencimento"] },
  set: { label: "Contagem", reasons: ["Inventário"] },
} as const;
type Kind = keyof typeof kinds;

export function StockDialog({ repo, product, onClose, onSaved }: { repo: AdminRepo; product: Product; onClose: () => void; onSaved: (stock: number) => void }) {
  const [kind, setKind] = useState<Kind>("in");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState<string>(kinds.in.reasons[0]);
  const [note, setNote] = useState("");
  const [failure, setFailure] = useState("");
  const [busy, setBusy] = useState(false);
  const quantity = wholeNumber(amount);
  const after = Number.isNaN(quantity) ? null : kind === "in" ? product.stock + quantity : kind === "out" ? product.stock - quantity : quantity;
  const problem = after === null ? "" : after < 0 ? `Só há ${product.stock} un. em estoque.` : after > MAX_STOCK ? "Quantidade acima do limite." : "";

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (after === null) { setFailure("Informe a quantidade em unidades inteiras."); return; }
    if (problem) { setFailure(problem); return; }
    const delta = after - product.stock;
    if (delta === 0) { setFailure(kind === "set" ? "A contagem é igual ao saldo atual." : "Informe uma quantidade maior que zero."); return; }
    setFailure(""); setBusy(true);
    try { onSaved(await repo.adjustStock(product.id, delta, reason, note)); }
    catch (error) { setFailure(message(error)); setBusy(false); }
  }

  return <Modal title={`Movimentar ${product.name}`} onClose={onClose} busy={busy}>
    <form className="adm-form" onSubmit={submit} noValidate>
      <div className="adm-form-body">
        <div className="adm-segment" role="radiogroup" aria-label="Tipo de movimentação">
          {(Object.keys(kinds) as Kind[]).map(k => <label key={k}>
            <input type="radio" name="sd-kind" className="sr-only" checked={kind === k} onChange={() => { setKind(k); setReason(kinds[k].reasons[0]); setFailure(""); }} />
            <span>{kinds[k].label}</span>
          </label>)}
        </div>
        <div className="adm-fields">
          <div className="adm-field">
            <label htmlFor="sd-amount">{kind === "set" ? "Unidades contadas" : "Quantidade (un.)"}</label>
            {/* eslint-disable-next-line jsx-a11y/no-autofocus -- o diálogo existe só para digitar esta quantidade */}
            <input id="sd-amount" inputMode="numeric" value={amount} onChange={event => { setAmount(event.target.value); setFailure(""); }} autoComplete="off" autoFocus aria-invalid={Boolean(problem)} />
          </div>
          <div className="adm-field">
            <label htmlFor="sd-reason">Motivo</label>
            <select id="sd-reason" value={reason} onChange={event => setReason(event.target.value)}>{kinds[kind].reasons.map(r => <option key={r}>{r}</option>)}</select>
          </div>
          <div className="adm-field span-2">
            <label htmlFor="sd-note">Observação <small>opcional</small></label>
            <input id="sd-note" value={note} onChange={event => setNote(event.target.value)} maxLength={200} placeholder="Ex.: lote da manhã, pedido da Ana…" autoComplete="off" />
          </div>
        </div>
        <div className="adm-balance" data-problem={Boolean(problem)} aria-live="polite">
          <span>Saldo</span>
          <strong>{product.stock}</strong>
          <span aria-hidden="true">→</span>
          <strong>{after === null ? "—" : after}</strong>
          <span>un.{after !== null && !problem && after !== product.stock && ` · ${money(after * product.priceInCents)} em produto`}</span>
        </div>
      </div>
      <footer className="adm-modal-foot">
        {(failure || problem) && <p role="alert" className="adm-error">{failure || problem}</p>}
        <button type="button" className="adm-btn adm-btn-quiet" onClick={onClose} disabled={busy}>Cancelar</button>
        <button type="submit" className="adm-btn adm-btn-primary" disabled={busy}>{busy ? "Registrando…" : `Registrar ${kinds[kind].label.toLowerCase()}`}</button>
      </footer>
    </form>
  </Modal>;
}

/* ---------- Exclusão ---------- */

export function DeleteDialog({ repo, product, onClose, onDeleted }: { repo: AdminRepo; product: Product; onClose: () => void; onDeleted: () => void }) {
  const [failure, setFailure] = useState("");
  const [busy, setBusy] = useState(false);
  async function confirm() {
    setBusy(true);
    try { await repo.remove(product.id); onDeleted(); }
    catch (error) { setFailure(message(error)); setBusy(false); }
  }
  return <Modal title={`Excluir ${product.name}?`} onClose={onClose} busy={busy}>
    <div className="adm-form-body">
      <p>O produto sai da loja e do painel{product.stock > 0 && <>, junto com as <strong>{product.stock} un.</strong> em estoque</>}. O histórico de movimentações é mantido. Para tirar da loja sem perder o cadastro, prefira ocultar.</p>
    </div>
    <footer className="adm-modal-foot">
      {failure && <p role="alert" className="adm-error">{failure}</p>}
      <button type="button" className="adm-btn adm-btn-quiet" onClick={onClose} disabled={busy}>Cancelar</button>
      <button type="button" className="adm-btn adm-btn-danger" onClick={confirm} disabled={busy}>{busy ? "Excluindo…" : "Excluir produto"}</button>
    </footer>
  </Modal>;
}
