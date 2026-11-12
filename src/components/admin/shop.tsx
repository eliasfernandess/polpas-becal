"use client";
import { useEffect, useState, type FormEvent } from "react";
import { Eye, EyeOff, Gift, ImagePlus, MapPin, Minus, Pencil, Plus, Star, Trash2 } from "lucide-react";
import { Modal } from "@/components/admin/dialogs";
import { KitVisual } from "@/components/kits";
import { toKit } from "@/data/products";
import { optimizeImage, type AdminRepo } from "@/lib/admin-repo";
import { kitSchema, parsePrice, settingsSchema, slugify, toKitData, zoneSchema } from "@/lib/catalog";
import { money } from "@/lib/money";
import type { DeliveryZone, Kit, KitData, Product, StoreSettings } from "@/types/product";

const message = (error: unknown) => error instanceof Error ? error.message : "Não foi possível concluir a operação.";
const reais = (cents: number) => (cents / 100).toFixed(2).replace(".", ",");
const issues = (error: { issues: { path: PropertyKey[]; message: string }[] }) => {
  const found: Record<string, string> = {};
  for (const issue of error.issues) found[String(issue.path[0] ?? "form")] ||= issue.message;
  return found;
};

/* ---------- Kits ---------- */

export function KitsView({ repo, kits, products, manager, onChanged, onCreate }: {
  repo: AdminRepo; kits: Kit[] | null; products: Product[]; manager: boolean; onChanged: (notice: string) => void; onCreate: () => void;
}) {
  const [editing, setEditing] = useState<Kit | null>(null);
  const [removing, setRemoving] = useState<Kit | null>(null);
  const [error, setError] = useState("");
  const byId = new Map(products.map(p => [p.id, p]));

  async function toggle(kit: Kit) {
    setError("");
    try { await repo.saveKit({ ...toKitData(kit), active: !kit.active }, false); onChanged(kit.active ? `${kit.name} oculto da loja.` : `${kit.name} visível na loja.`); }
    catch (cause) { setError(message(cause)); }
  }

  return <section aria-label="Kits" className="adm-stack">
    {error && <p className="adm-banner adm-banner-error" role="alert">{error}</p>}
    {!kits ? <p className="adm-empty" role="status">Carregando kits…</p>
      : !kits.length ? <div className="adm-empty">
          <Gift size={28} strokeWidth={1.5} />
          <strong>Nenhum kit ainda.</strong>
          <p>Junte sabores com um preço especial, como “Kit semana: 7 sabores”. Vender um kit baixa o estoque de cada sabor.</p>
          {manager && <button className="adm-btn adm-btn-primary" onClick={onCreate}><Plus size={16} /> Novo kit</button>}
        </div>
      : <ul className="adm-cards">{kits.map(kit => {
          const live = toKit(kit, byId);
          const short = kit.items.filter(i => (byId.get(i.id)?.stock ?? 0) < i.quantity).map(i => byId.get(i.id)?.name ?? i.id);
          const saving = live.regularInCents - kit.priceInCents;
          return <li key={kit.id} className="adm-kit" data-hidden={!kit.active}>
            <div className="adm-kit-visual"><KitVisual kit={live} size="thumb" /></div>
            <div className="adm-kit-body">
              <div className="adm-kit-head">
                <strong>{kit.name}{kit.featured && <Star size={13} aria-label="Em destaque" />}</strong>
                <span className="adm-total">{money(kit.priceInCents)}</span>
              </div>
              <ul className="adm-chips-list" aria-label="Sabores">{kit.items.map(i => <li key={i.id}><i className={`tone-dot tone-${byId.get(i.id)?.tone ?? "sand"}`} aria-hidden="true" />{i.quantity}× {byId.get(i.id)?.name ?? i.id}</li>)}</ul>
              <p className="adm-hint">
                {saving > 0 ? <>Avulsas: {money(live.regularInCents)} · cliente economiza <b>{money(saving)}</b></> : <>Avulsas: {money(live.regularInCents)}{saving < 0 && " · o kit está mais caro que os sabores avulsos"}</>}
                {" · "}{!kit.active ? "oculto da loja" : short.length ? <span className="adm-warn-text">falta estoque de {short.join(", ")}</span> : <>dá para montar <b>{live.maxUnits}{live.maxUnits === 99 ? "+" : ""}</b></>}
              </p>
            </div>
            {manager && <div className="adm-actions">
              <button className="adm-icon" onClick={() => void toggle(kit)} aria-label={kit.active ? `Ocultar ${kit.name} da loja` : `Mostrar ${kit.name} na loja`} title={kit.active ? "Ocultar da loja" : "Mostrar na loja"}>{kit.active ? <Eye size={17} /> : <EyeOff size={17} />}</button>
              <button className="adm-icon" onClick={() => setEditing(kit)} aria-label={`Editar ${kit.name}`} title="Editar"><Pencil size={16} /></button>
              <button className="adm-icon adm-icon-danger" onClick={() => setRemoving(kit)} aria-label={`Excluir ${kit.name}`} title="Excluir"><Trash2 size={16} /></button>
            </div>}
          </li>;
        })}</ul>}

    {editing && <KitDialog repo={repo} kit={editing} products={products} nextSort={0} onClose={() => setEditing(null)} onSaved={name => { setEditing(null); onChanged(`${name} atualizado.`); }} />}
    {removing && <Modal title={`Excluir ${removing.name}?`} onClose={() => setRemoving(null)}>
      <div className="adm-form-body"><p>O kit sai da loja. Os sabores e o estoque não mudam. Para tirar da loja sem perder o kit, prefira ocultar.</p></div>
      <footer className="adm-modal-foot">
        <button type="button" className="adm-btn adm-btn-quiet" onClick={() => setRemoving(null)}>Cancelar</button>
        <button type="button" className="adm-btn adm-btn-danger" onClick={async () => {
          const kit = removing; setRemoving(null);
          try { await repo.removeKit(kit.id); onChanged(`${kit.name} excluído.`); } catch (cause) { setError(message(cause)); }
        }}>Excluir kit</button>
      </footer>
    </Modal>}
  </section>;
}

export function KitDialog({ repo, kit, products, nextSort, onClose, onSaved }: {
  repo: AdminRepo; kit: Kit | null; products: Product[]; nextSort: number; onClose: () => void; onSaved: (name: string) => void;
}) {
  const editing = Boolean(kit);
  const [name, setName] = useState(kit?.name ?? "");
  const [customId, setCustomId] = useState<string | null>(null);
  const [description, setDescription] = useState(kit?.description ?? "");
  const [price, setPrice] = useState(kit ? reais(kit.priceInCents) : "");
  const [quantities, setQuantities] = useState<Record<string, number>>(() => Object.fromEntries((kit?.items ?? []).map(i => [i.id, i.quantity])));
  const [active, setActive] = useState(kit?.active ?? true);
  const [featured, setFeatured] = useState(kit?.featured ?? true);
  const [image, setImage] = useState(kit?.image ?? "");
  const [photo, setPhoto] = useState<{ blob: Blob; preview: string } | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [failure, setFailure] = useState("");
  const [busy, setBusy] = useState(false);
  const id = kit?.id ?? customId ?? slugify(name).slice(0, 55);
  useEffect(() => () => { if (photo) URL.revokeObjectURL(photo.preview); }, [photo]);

  const items = products.filter(p => quantities[p.id] > 0).map(p => ({ id: p.id, quantity: quantities[p.id] }));
  const regular = items.reduce((sum, i) => sum + (products.find(p => p.id === i.id)?.priceInCents ?? 0) * i.quantity, 0);
  const units = items.reduce((sum, i) => sum + i.quantity, 0);
  const priceCents = parsePrice(price);
  const setQty = (productId: string, value: number) => setQuantities(q => ({ ...q, [productId]: Math.max(0, Math.min(99, value)) }));

  async function pickPhoto(file: File | undefined) {
    if (!file) return;
    try { const blob = await optimizeImage(file, repo.mode === "local" ? 480 : 800); setPhoto({ blob, preview: URL.createObjectURL(blob) }); setErrors(e => ({ ...e, image: "" })); }
    catch (error) { setErrors(e => ({ ...e, image: message(error) })); }
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    const draft: KitData = { id, name, description, image, priceInCents: priceCents, items, active, featured, sort: kit?.sort ?? nextSort };
    const checked = kitSchema.safeParse(draft);
    if (!checked.success) { const found = issues(checked.error); if (found.id && !editing && customId === null) found.name ||= "Informe o nome do kit."; setErrors(found); return; }
    setErrors({}); setFailure(""); setBusy(true);
    try {
      const data = photo ? { ...checked.data, image: await repo.uploadImage(photo.blob, `kit-${checked.data.id}`) } : checked.data;
      await repo.saveKit(data, !editing);
      onSaved(data.name);
    } catch (error) { setFailure(message(error)); setBusy(false); }
  }
  const preview = photo?.preview ?? image;
  const err = (key: string) => errors[key] && <span id={`kd-${key}-error`} className="adm-error">{errors[key]}</span>;
  const aria = (key: string) => ({ "aria-invalid": Boolean(errors[key]), "aria-describedby": errors[key] ? `kd-${key}-error` : undefined });

  return <Modal title={editing ? `Editar ${kit!.name}` : "Novo kit"} onClose={onClose} busy={busy}>
    <form className="adm-form" onSubmit={submit} noValidate>
      <div className="adm-form-body">
        <div className="adm-fields">
          <div className="adm-field span-2"><label htmlFor="kd-name">Nome do kit</label><input id="kd-name" value={name} onChange={e => setName(e.target.value)} maxLength={60} placeholder="Ex.: Kit semana" autoComplete="off" {...aria("name")} />{err("name")}</div>
          {!editing && <div className="adm-field span-2"><label htmlFor="kd-id">Identificador <small>gerado a partir do nome</small></label><input id="kd-id" value={id} onChange={e => setCustomId(e.target.value.toLowerCase())} maxLength={55} spellCheck={false} autoComplete="off" {...aria("id")} />{err("id")}</div>}
          <div className="adm-field span-2"><label htmlFor="kd-desc">Descrição <small>opcional</small></label><input id="kd-desc" value={description} onChange={e => setDescription(e.target.value)} maxLength={240} placeholder="Ex.: Sete sabores para variar o suco todo dia." autoComplete="off" {...aria("description")} />{err("description")}</div>
        </div>

        <fieldset className="adm-field">
          <legend>Sabores do kit</legend>
          <ul className="adm-sale" aria-describedby={errors.items ? "kd-items-error" : undefined}>{products.map(p => {
            const q = quantities[p.id] ?? 0;
            return <li key={p.id} data-picked={q > 0}>
              <span className={`adm-thumb tone-${p.tone}`}>{p.image && <img src={p.image} alt="" width="40" height="40" />}</span>
              <div><strong>{p.name}</strong><span>{money(p.priceInCents)} · {p.stock} em estoque</span></div>
              <div className="adm-qty">
                <button type="button" onClick={() => setQty(p.id, q - 1)} disabled={q === 0} aria-label={`Tirar ${p.name} do kit`}><Minus size={14} /></button>
                <input inputMode="numeric" value={q || ""} placeholder="0" onChange={e => setQty(p.id, Number(e.target.value.replace(/\D/g, "")))} aria-label={`Quantidade de ${p.name} no kit`} />
                <button type="button" onClick={() => setQty(p.id, q + 1)} aria-label={`Pôr ${p.name} no kit`}><Plus size={14} /></button>
              </div>
            </li>;
          })}</ul>
          {err("items")}
        </fieldset>

        <div className="adm-fields">
          <div className="adm-field"><label htmlFor="kd-price">Preço do kit (R$)</label><input id="kd-price" inputMode="decimal" value={price} onChange={e => setPrice(e.target.value)} placeholder="29,90" autoComplete="off" {...aria("priceInCents")} />{err("priceInCents")}</div>
          <div className="adm-balance">
            <span>{units} polpas · avulsas</span><strong>{money(regular)}</strong>
            {Number.isFinite(priceCents) && priceCents > 0 && regular > 0 && <span>{priceCents < regular ? `economia de ${money(regular - priceCents)}` : "sem desconto"}</span>}
          </div>
        </div>

        <div className="adm-photo">
          <div className="adm-photo-tile tone-sand">{preview ? <img src={preview} alt="" /> : <ImagePlus size={28} strokeWidth={1.5} />}</div>
          <div className="adm-photo-actions">
            <label className="adm-btn" htmlFor="kd-photo">{preview ? "Trocar foto" : "Enviar foto"}</label>
            <input id="kd-photo" className="sr-only" type="file" accept="image/png,image/jpeg,image/webp" onChange={e => { void pickPhoto(e.target.files?.[0]); e.target.value = ""; }} />
            {preview && <button type="button" className="adm-btn adm-btn-quiet" onClick={() => { setPhoto(null); setImage(""); }}>Remover</button>}
            <span className="adm-hint">Opcional. Sem foto, a loja mostra as embalagens dos sabores.</span>
            {err("image")}
          </div>
        </div>
        <label className="adm-check"><input type="checkbox" checked={active} onChange={e => setActive(e.target.checked)} /><strong>Visível na loja</strong><small>Desmarque para preparar o kit antes de mostrar.</small></label>
        <label className="adm-check"><input type="checkbox" checked={featured} onChange={e => setFeatured(e.target.checked)} /><strong>Destaque</strong><small>Aparece primeiro na vitrine de kits.</small></label>
      </div>
      <footer className="adm-modal-foot">
        {failure && <p role="alert" className="adm-error">{failure}</p>}
        <button type="button" className="adm-btn adm-btn-quiet" onClick={onClose} disabled={busy}>Cancelar</button>
        <button type="submit" className="adm-btn adm-btn-primary" disabled={busy}>{busy ? "Salvando…" : editing ? "Salvar kit" : "Criar kit"}</button>
      </footer>
    </form>
  </Modal>;
}

/* ---------- Entrega ---------- */

export function DeliveryView({ repo, zones, settings, manager, onChanged }: {
  repo: AdminRepo; zones: DeliveryZone[] | null; settings: StoreSettings | null; manager: boolean; onChanged: (notice: string) => void;
}) {
  const [rules, setRules] = useState<{ delivery: boolean; pickup: boolean; minimum: string } | null>(null);
  const [rulesError, setRulesError] = useState("");
  const [draft, setDraft] = useState({ city: "", district: "", fee: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [failure, setFailure] = useState("");
  const [editing, setEditing] = useState<DeliveryZone | null>(null);
  const current = rules ?? (settings ? { delivery: settings.deliveryEnabled, pickup: settings.pickupEnabled, minimum: settings.minOrderCents ? reais(settings.minOrderCents) : "" } : null);
  const cities = [...new Set((zones ?? []).map(z => z.city))];

  async function saveRules(event: FormEvent) {
    event.preventDefault();
    if (!current) return;
    const minOrderCents = current.minimum.trim() ? parsePrice(current.minimum) : 0;
    const checked = settingsSchema.safeParse({ deliveryEnabled: current.delivery, pickupEnabled: current.pickup, minOrderCents: Number.isFinite(minOrderCents) ? minOrderCents : -1 });
    if (!checked.success) { setRulesError(checked.error.issues[0].message); return; }
    setRulesError("");
    try { await repo.saveSettings(checked.data); setRules(null); onChanged("Regras de entrega salvas."); }
    catch (cause) { setRulesError(message(cause)); }
  }
  async function addZone(event: FormEvent) {
    event.preventDefault();
    const fee = draft.fee.trim() ? parsePrice(draft.fee) : 0;
    const zone: DeliveryZone = { id: crypto.randomUUID(), city: draft.city, district: draft.district, feeCents: Number.isFinite(fee) ? fee : -1, active: true, sort: (zones?.length ?? 0) };
    const checked = zoneSchema.safeParse(zone);
    if (!checked.success) { setErrors(issues(checked.error)); return; }
    setErrors({}); setFailure("");
    try { await repo.saveZone(checked.data, true); setDraft(d => ({ ...d, district: "", fee: "" })); onChanged(`${checked.data.district} adicionado.`); document.getElementById("dz-district")?.focus(); }
    catch (cause) { setFailure(message(cause)); }
  }
  async function change(zone: DeliveryZone, patch: Partial<DeliveryZone>, notice: string) {
    setFailure("");
    try { await repo.saveZone({ ...zone, ...patch }, false); onChanged(notice); } catch (cause) { setFailure(message(cause)); }
  }

  return <section aria-label="Entrega" className="adm-stack">
    <form className="adm-card" onSubmit={saveRules} aria-labelledby="h-regras">
      <header><h2 id="h-regras">Como o cliente recebe</h2></header>
      {!current ? <p className="adm-quiet" role="status">Carregando…</p> : <>
        <div className="adm-rules">
          <label className="adm-check"><input type="checkbox" checked={current.delivery} disabled={!manager} onChange={e => setRules({ ...current, delivery: e.target.checked })} /><strong>Entrega</strong><small>O cliente informa o endereço no checkout.</small></label>
          <label className="adm-check"><input type="checkbox" checked={current.pickup} disabled={!manager} onChange={e => setRules({ ...current, pickup: e.target.checked })} /><strong>Retirada</strong><small>O cliente busca o pedido; sem taxa.</small></label>
          <div className="adm-field">
            <label htmlFor="dz-min">Pedido mínimo para entrega (R$) <small>vazio = sem mínimo</small></label>
            <input id="dz-min" inputMode="decimal" value={current.minimum} disabled={!manager} onChange={e => setRules({ ...current, minimum: e.target.value })} placeholder="0,00" autoComplete="off" />
          </div>
        </div>
        {rulesError && <p role="alert" className="adm-error">{rulesError}</p>}
        {manager && <div><button type="submit" className="adm-btn adm-btn-primary" disabled={!rules}>Salvar regras</button></div>}
      </>}
    </form>

    <section className="adm-card" aria-labelledby="h-bairros">
      <header><h2 id="h-bairros">Bairros atendidos</h2><span className="adm-hint">{zones?.length ? `${zones.filter(z => z.active).length} ativos` : ""}</span></header>
      <p className="adm-hint">Sem bairros cadastrados, a loja aceita qualquer endereço e a taxa é combinada pelo WhatsApp. Com bairros, o cliente escolhe na lista e a taxa entra no total.</p>
      {failure && <p role="alert" className="adm-error">{failure}</p>}
      {manager && <form className="adm-zone-form" onSubmit={addZone} noValidate>
        <div className="adm-field"><label htmlFor="dz-city">Cidade</label><input id="dz-city" list="dz-cities" value={draft.city} onChange={e => setDraft({ ...draft, city: e.target.value })} placeholder="Uberlândia" autoComplete="off" aria-invalid={Boolean(errors.city)} />{errors.city && <span className="adm-error">{errors.city}</span>}<datalist id="dz-cities">{cities.map(c => <option key={c} value={c} />)}</datalist></div>
        <div className="adm-field"><label htmlFor="dz-district">Bairro</label><input id="dz-district" value={draft.district} onChange={e => setDraft({ ...draft, district: e.target.value })} placeholder="Centro" autoComplete="off" aria-invalid={Boolean(errors.district)} />{errors.district && <span className="adm-error">{errors.district}</span>}</div>
        <div className="adm-field"><label htmlFor="dz-fee">Taxa (R$)</label><input id="dz-fee" inputMode="decimal" value={draft.fee} onChange={e => setDraft({ ...draft, fee: e.target.value })} placeholder="0,00 = grátis" autoComplete="off" aria-invalid={Boolean(errors.feeCents)} />{errors.feeCents && <span className="adm-error">{errors.feeCents}</span>}</div>
        <button type="submit" className="adm-btn adm-btn-primary"><Plus size={16} /> Adicionar bairro</button>
      </form>}
      {!zones ? <p className="adm-quiet" role="status">Carregando…</p>
        : !zones.length ? <div className="adm-empty adm-empty-flat"><MapPin size={24} strokeWidth={1.5} /><strong>Nenhum bairro ainda.</strong></div>
        : <ul className="adm-zones">{cities.map(city => <li key={city}>
            <h3>{city}</h3>
            <ul>{zones.filter(z => z.city === city).map(zone => <li key={zone.id} data-hidden={!zone.active}>
              <span>{zone.district}{!zone.active && <small> · pausado</small>}</span>
              <b>{zone.feeCents ? money(zone.feeCents) : "Grátis"}</b>
              {manager && <div className="adm-actions">
                <button className="adm-icon" onClick={() => void change(zone, { active: !zone.active }, zone.active ? `${zone.district} pausado.` : `${zone.district} ativo.`)} aria-label={zone.active ? `Pausar entrega em ${zone.district}` : `Voltar a entregar em ${zone.district}`} title={zone.active ? "Pausar" : "Reativar"}>{zone.active ? <Eye size={16} /> : <EyeOff size={16} />}</button>
                <button className="adm-icon" onClick={() => setEditing(zone)} aria-label={`Editar ${zone.district}`} title="Editar"><Pencil size={15} /></button>
                <button className="adm-icon adm-icon-danger" onClick={async () => { try { await repo.removeZone(zone.id); onChanged(`${zone.district} removido.`); } catch (cause) { setFailure(message(cause)); } }} aria-label={`Remover ${zone.district}`} title="Remover"><Trash2 size={15} /></button>
              </div>}
            </li>)}</ul>
          </li>)}</ul>}
    </section>

    {editing && <ZoneDialog repo={repo} zone={editing} onClose={() => setEditing(null)} onSaved={notice => { setEditing(null); onChanged(notice); }} />}
  </section>;
}

function ZoneDialog({ repo, zone, onClose, onSaved }: { repo: AdminRepo; zone: DeliveryZone; onClose: () => void; onSaved: (notice: string) => void }) {
  const [city, setCity] = useState(zone.city);
  const [district, setDistrict] = useState(zone.district);
  const [fee, setFee] = useState(reais(zone.feeCents));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [failure, setFailure] = useState("");
  async function submit(event: FormEvent) {
    event.preventDefault();
    const cents = fee.trim() ? parsePrice(fee) : 0;
    const checked = zoneSchema.safeParse({ ...zone, city, district, feeCents: Number.isFinite(cents) ? cents : -1 });
    if (!checked.success) { setErrors(issues(checked.error)); return; }
    try { await repo.saveZone(checked.data, false); onSaved(`${checked.data.district} atualizado.`); } catch (cause) { setFailure(message(cause)); }
  }
  return <Modal title={`Editar ${zone.district}`} onClose={onClose}>
    <form className="adm-form" onSubmit={submit} noValidate>
      <div className="adm-form-body"><div className="adm-fields">
        <div className="adm-field"><label htmlFor="ze-city">Cidade</label><input id="ze-city" value={city} onChange={e => setCity(e.target.value)} autoComplete="off" />{errors.city && <span className="adm-error">{errors.city}</span>}</div>
        <div className="adm-field"><label htmlFor="ze-district">Bairro</label><input id="ze-district" value={district} onChange={e => setDistrict(e.target.value)} autoComplete="off" />{errors.district && <span className="adm-error">{errors.district}</span>}</div>
        <div className="adm-field"><label htmlFor="ze-fee">Taxa (R$)</label><input id="ze-fee" inputMode="decimal" value={fee} onChange={e => setFee(e.target.value)} autoComplete="off" />{errors.feeCents && <span className="adm-error">{errors.feeCents}</span>}</div>
      </div></div>
      <footer className="adm-modal-foot">
        {failure && <p role="alert" className="adm-error">{failure}</p>}
        <button type="button" className="adm-btn adm-btn-quiet" onClick={onClose}>Cancelar</button>
        <button type="submit" className="adm-btn adm-btn-primary">Salvar</button>
      </footer>
    </form>
  </Modal>;
}
