"use client";
import { useState } from "react";
import { Bike, CalendarDays, Clock, Gift, MapPin, MessageCircle, PackageCheck, Store, Users } from "lucide-react";
import { Modal } from "@/components/admin/dialogs";
import type { AdminRepo } from "@/lib/admin-repo";
import { money } from "@/lib/money";
import { formatPhone, formatPostalCode } from "@/lib/validation";
import { whatsappUrl } from "@/lib/whatsapp";
import type { OrderRecord, OrderStatus, Product, QuoteRecord, QuoteStatus } from "@/types/product";

const message = (error: unknown) => error instanceof Error ? error.message : "Não foi possível concluir a operação.";

export const orderStatus: Record<OrderStatus, string> = { pending_whatsapp: "Novo", contacted: "Em contato", confirmed: "Confirmado", cancelled: "Cancelado" };
export const quoteStatus: Record<QuoteStatus, string> = { pending_whatsapp: "Novo", contacted: "Em contato", quoted: "Orçado", confirmed: "Confirmado", cancelled: "Cancelado" };

const relative = new Intl.RelativeTimeFormat("pt-BR", { numeric: "auto" });
/** "agora", "há 5 minutos", "ontem", "há 3 dias"; depois de uma semana, a data. */
export function timeAgo(iso: string, now = Date.now()): string {
  const minutes = Math.round((Date.parse(iso) - now) / 60000);
  if (Math.abs(minutes) < 1) return "agora";
  if (Math.abs(minutes) < 60) return relative.format(minutes, "minute");
  const hours = Math.round(minutes / 60);
  if (Math.abs(hours) < 24) return relative.format(hours, "hour");
  const days = Math.round(hours / 24);
  if (Math.abs(days) < 7) return relative.format(days, "day");
  return new Date(iso).toLocaleDateString("pt-BR");
}
const brDate = (iso: string) => iso.split("-").reverse().join("/");
const chat = (phone: string, text: string) => phone ? whatsappUrl(text, `+55${phone}`) : "";
/** Unidades de cada sabor que o pedido consome (kits abertos nos sabores). */
export function orderDemand(order: OrderRecord): Map<string, { name: string; units: number }> {
  const demand = new Map<string, { name: string; units: number }>();
  const add = (id: string, name: string, units: number) => { const entry = demand.get(id) ?? { name, units: 0 }; entry.units += units; demand.set(id, entry); };
  for (const item of order.items) {
    if (item.kind === "kit") for (const c of item.components ?? []) add(c.id, c.name, c.quantity * item.quantity);
    else add(item.id, item.name, item.quantity);
  }
  return demand;
}
const feeText = (order: OrderRecord) => order.deliveryFeeCents === null ? "taxa a combinar" : order.deliveryFeeCents === 0 ? "entrega grátis" : `taxa ${money(order.deliveryFeeCents)}`;

export function StatusBadge({ status, label }: { status: string; label: string }) {
  return <span className="adm-badge" data-status={status}>{label}</span>;
}

function Contact({ name, phone, text }: { name: string; phone: string; text: string }) {
  return <div className="adm-who">
    <strong>{name || "Cliente não informado"}</strong>
    {phone && <a href={chat(phone, text)} target="_blank" rel="noopener noreferrer" aria-label={`Conversar com ${name || "cliente"} no WhatsApp`}><MessageCircle size={14} /> {formatPhone(phone)}</a>}
  </div>;
}

/* ---------- Pedidos ---------- */

const orderFilters = [
  { id: "pending_whatsapp", label: "Novos" },
  { id: "contacted", label: "Em contato" },
  { id: "confirmed", label: "Confirmados" },
  { id: "cancelled", label: "Cancelados" },
  { id: "all", label: "Todos" },
] as const;
type OrderFilter = (typeof orderFilters)[number]["id"];

export function OrdersView({ repo, orders, products, failure, onChanged }: {
  repo: AdminRepo; orders: OrderRecord[] | null; products: Product[]; failure: string; onChanged: (notice: string) => void;
}) {
  const [filter, setFilter] = useState<OrderFilter>("pending_whatsapp");
  const [confirming, setConfirming] = useState<OrderRecord | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const tone = (id: string) => products.find(p => p.id === id)?.tone ?? "sand";
  const list = (orders ?? []).filter(o => filter === "all" || o.status === filter);

  async function change(order: OrderRecord, status: Exclude<OrderStatus, "confirmed">, notice: string) {
    setBusy(order.id); setError("");
    try { await repo.setOrderStatus(order.id, status); onChanged(notice); }
    catch (cause) { setError(message(cause)); }
    finally { setBusy(""); }
  }

  if (!repo.records) return <Unavailable what="pedidos" />;
  return <section aria-label="Pedidos" className="adm-stack">
    <Segments options={orderFilters.map(f => ({ ...f, count: f.id === "all" ? orders?.length ?? 0 : orders?.filter(o => o.status === f.id).length ?? 0 }))} value={filter} onChange={id => setFilter(id as OrderFilter)} label="Filtrar pedidos" />
    {(failure || error) && <p className="adm-banner adm-banner-error" role="alert">{failure || error}</p>}
    {!orders ? !failure && <p className="adm-empty" role="status">Carregando pedidos…</p>
      : !list.length ? <div className="adm-empty">
          <PackageCheck size={28} strokeWidth={1.5} />
          <strong>{filter === "pending_whatsapp" ? "Nenhum pedido novo." : "Nada por aqui."}</strong>
          <p>{filter === "pending_whatsapp" ? "Quando alguém finalizar um pedido no site, ele aparece aqui na hora." : "Nenhum pedido com essa situação."}</p>
        </div>
      : <ul className="adm-cards">{list.map(order => <li key={order.id} className="adm-order" data-status={order.status}>
          <header>
            <Contact name={order.customerName} phone={order.customerPhone} text={`Olá, ${order.customerName.split(" ")[0] || ""}! Aqui é da Polpas Becal, sobre o seu pedido ${order.id.slice(0, 8)}.`} />
            <div className="adm-meta"><StatusBadge status={order.status} label={orderStatus[order.status]} /><time dateTime={order.createdAt}>{timeAgo(order.createdAt)}</time></div>
          </header>
          <ul className="adm-chips-list" aria-label="Itens">{order.items.map(item => item.kind === "kit"
            ? <li key={item.id} title={(item.components ?? []).map(c => `${c.quantity}× ${c.name}`).join(", ")}><Gift size={13} aria-hidden="true" />{item.quantity}× {item.name}</li>
            : <li key={item.id}><i className={`tone-dot tone-${tone(item.id)}`} aria-hidden="true" />{item.quantity}× {item.name}</li>)}</ul>
          <p className="adm-where">
            {order.fulfillment === "entrega" ? <><Bike size={16} /> <span><b>Entrega</b> · {feeText(order)} · {[order.address.street, order.address.number, order.address.complement].filter(Boolean).join(", ")} — {order.address.district}, {order.address.city} · CEP {formatPostalCode(order.address.postalCode)}</span></>
              : order.fulfillment === "retirada" ? <><Store size={16} /> <span><b>Retirada</b> · combinar horário</span></>
              : <><Store size={16} /> <span>Pedido anterior ao checkout com endereço: combine pelo WhatsApp.</span></>}
          </p>
          <footer>
            <span className="adm-total">{money(order.totalInCents + (order.deliveryFeeCents ?? 0))} <small>{order.deliveryFeeCents ? `· com entrega · ` : "· "}{order.id.slice(0, 8)}</small></span>
            <div className="adm-row-actions">
              {(order.status === "pending_whatsapp" || order.status === "contacted") && <>
                {order.status === "pending_whatsapp" && <button className="adm-btn" disabled={busy === order.id} onClick={() => void change(order, "contacted", "Pedido marcado como em contato.")}>Em contato</button>}
                <button className="adm-btn adm-btn-quiet" disabled={busy === order.id} onClick={() => void change(order, "cancelled", "Pedido cancelado.")}>Cancelar</button>
                <button className="adm-btn adm-btn-primary" disabled={busy === order.id} onClick={() => setConfirming(order)}>Confirmar pedido</button>
              </>}
              {order.status === "cancelled" && <button className="adm-btn" disabled={busy === order.id} onClick={() => void change(order, "pending_whatsapp", "Pedido reaberto.")}>Reabrir</button>}
              {order.status === "confirmed" && <span className="adm-hint">Estoque já baixado.</span>}
            </div>
          </footer>
        </li>)}</ul>}

    {confirming && <ConfirmOrder repo={repo} order={confirming} products={products} onClose={() => setConfirming(null)} onDone={() => { setConfirming(null); onChanged("Pedido confirmado e estoque atualizado."); }} />}
  </section>;
}

function ConfirmOrder({ repo, order, products, onClose, onDone }: { repo: AdminRepo; order: OrderRecord; products: Product[]; onClose: () => void; onDone: () => void }) {
  const [failure, setFailure] = useState("");
  const [busy, setBusy] = useState(false);
  const demand = [...orderDemand(order)];
  const short = demand.filter(([id, d]) => (products.find(p => p.id === id)?.stock ?? 0) < d.units).map(([, d]) => d);
  async function confirm() {
    setBusy(true); setFailure("");
    try { await repo.confirmOrder(order.id); onDone(); }
    catch (cause) { setFailure(message(cause)); setBusy(false); }
  }
  return <Modal title={`Confirmar pedido de ${order.customerName || "cliente"}?`} onClose={onClose} busy={busy}>
    <div className="adm-form-body">
      <p>Confirme só depois de combinar com o cliente. O estoque será baixado assim:</p>
      <ul className="adm-confirm-list">{demand.map(([id, d]) => {
        const stock = products.find(p => p.id === id)?.stock;
        return <li key={id} data-short={stock === undefined || stock < d.units}>
          <span>{d.units}× {d.name}</span>
          <span>{stock === undefined ? "produto removido" : `${stock} → ${stock - d.units} un.`}</span>
        </li>;
      })}</ul>
      {order.items.some(i => i.kind === "kit") && <p className="adm-hint">Os kits foram abertos nos sabores que levam.</p>}
      {short.length > 0 && <p className="adm-banner adm-banner-error">Falta estoque de {short.map(d => d.name).join(", ")}. Registre uma entrada antes de confirmar.</p>}
    </div>
    <footer className="adm-modal-foot">
      {failure && <p role="alert" className="adm-error">{failure}</p>}
      <button type="button" className="adm-btn adm-btn-quiet" onClick={onClose} disabled={busy}>Voltar</button>
      <button type="button" className="adm-btn adm-btn-primary" onClick={confirm} disabled={busy || short.length > 0}>{busy ? "Confirmando…" : "Confirmar e baixar estoque"}</button>
    </footer>
  </Modal>;
}

/* ---------- Orçamentos ---------- */

const quoteFilters = [
  { id: "pending_whatsapp", label: "Novos" },
  { id: "contacted", label: "Em contato" },
  { id: "quoted", label: "Orçados" },
  { id: "confirmed", label: "Confirmados" },
  { id: "all", label: "Todos" },
] as const;
type QuoteFilter = (typeof quoteFilters)[number]["id"];

export function QuotesView({ repo, quotes, failure, onChanged }: { repo: AdminRepo; quotes: QuoteRecord[] | null; failure: string; onChanged: (notice: string) => void }) {
  const [filter, setFilter] = useState<QuoteFilter>("pending_whatsapp");
  const [error, setError] = useState("");
  const list = (quotes ?? []).filter(q => filter === "all" || q.status === filter);
  async function change(quote: QuoteRecord, status: QuoteStatus) {
    setError("");
    try { await repo.setQuoteStatus(quote.id, status); onChanged(`Orçamento de ${quote.name}: ${quoteStatus[status].toLowerCase()}.`); }
    catch (cause) { setError(message(cause)); }
  }
  if (!repo.records) return <Unavailable what="orçamentos" />;
  return <section aria-label="Orçamentos" className="adm-stack">
    <Segments options={quoteFilters.map(f => ({ ...f, count: f.id === "all" ? quotes?.length ?? 0 : quotes?.filter(q => q.status === f.id).length ?? 0 }))} value={filter} onChange={id => setFilter(id as QuoteFilter)} label="Filtrar orçamentos" />
    {(failure || error) && <p className="adm-banner adm-banner-error" role="alert">{failure || error}</p>}
    {!quotes ? !failure && <p className="adm-empty" role="status">Carregando orçamentos…</p>
      : !list.length ? <div className="adm-empty">
          <CalendarDays size={28} strokeWidth={1.5} />
          <strong>{filter === "pending_whatsapp" ? "Nenhum orçamento novo." : "Nada por aqui."}</strong>
          <p>Pedidos de orçamento da foodbike, feitos na página de eventos, aparecem aqui.</p>
        </div>
      : <ul className="adm-cards">{list.map(quote => <li key={quote.id} className="adm-order" data-status={quote.status}>
          <header>
            <Contact name={quote.name} phone={quote.phone} text={`Olá, ${quote.name.split(" ")[0]}! Aqui é da Polpas Becal, sobre o orçamento da foodbike para ${brDate(quote.date)}.`} />
            <div className="adm-meta"><StatusBadge status={quote.status} label={quoteStatus[quote.status]} /><time dateTime={quote.createdAt}>{timeAgo(quote.createdAt)}</time></div>
          </header>
          <dl className="adm-facts">
            <div><dt><CalendarDays size={15} /> Quando</dt><dd>{quote.type} · {brDate(quote.date)}{quote.time && ` às ${quote.time}`}</dd></div>
            <div><dt><Users size={15} /> Convidados</dt><dd>{quote.guests}</dd></div>
            <div><dt><MapPin size={15} /> Local</dt><dd>{quote.location}</dd></div>
            {quote.duration && <div><dt><Clock size={15} /> Duração</dt><dd>{quote.duration}</dd></div>}
          </dl>
          {quote.notes && <p className="adm-notes">“{quote.notes}”</p>}
          <footer>
            <span className="adm-hint">Pedido {quote.id.slice(0, 8)}</span>
            <label className="adm-select">
              <span>Situação</span>
              <select value={quote.status} onChange={e => void change(quote, e.target.value as QuoteStatus)} aria-label={`Situação do orçamento de ${quote.name}`}>
                {(Object.keys(quoteStatus) as QuoteStatus[]).map(s => <option key={s} value={s}>{quoteStatus[s]}</option>)}
              </select>
            </label>
          </footer>
        </li>)}</ul>}
  </section>;
}

/* ---------- Comuns ---------- */

export function Segments({ options, value, onChange, label }: { options: { id: string; label: string; count?: number }[]; value: string; onChange: (id: string) => void; label: string }) {
  return <div className="adm-segments" role="group" aria-label={label}>
    {options.map(o => <button key={o.id} aria-pressed={value === o.id} onClick={() => onChange(o.id)}>{o.label}{o.count !== undefined && <span>{o.count}</span>}</button>)}
  </div>;
}

function Unavailable({ what }: { what: string }) {
  return <div className="adm-empty">
    <strong>Os {what} aparecem aqui quando o site estiver ligado ao Supabase.</strong>
    <p>No modo demonstração, a loja manda tudo direto para o WhatsApp e não guarda registros.</p>
  </div>;
}
