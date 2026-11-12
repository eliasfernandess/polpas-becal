"use client";
import { useState, type FormEvent } from "react";
import { Minus, Plus } from "lucide-react";
import { Modal } from "@/components/admin/dialogs";
import type { AdminRepo } from "@/lib/admin-repo";
import { money } from "@/lib/money";
import type { Product } from "@/types/product";

/** Baixa vários sabores de uma vez, como "Venda". O pedido chega pelo WhatsApp; aqui ele vira saída de estoque. */
export function SaleDialog({ repo, products, onClose, onSaved }: { repo: AdminRepo; products: Product[]; onClose: () => void; onSaved: (units: number) => void }) {
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [note, setNote] = useState("");
  const [failure, setFailure] = useState("");
  const [busy, setBusy] = useState(false);
  const sellable = products.filter(p => p.stock > 0);
  const items = sellable.flatMap(p => quantities[p.id] ? [{ id: p.id, quantity: quantities[p.id] }] : []);
  const totalUnits = items.reduce((sum, item) => sum + item.quantity, 0);
  const totalCents = sellable.reduce((sum, p) => sum + (quantities[p.id] ?? 0) * p.priceInCents, 0);
  const set = (p: Product, value: number) => {
    setFailure("");
    setQuantities(current => ({ ...current, [p.id]: Math.max(0, Math.min(p.stock, Number.isFinite(value) ? Math.trunc(value) : 0)) }));
  };

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!items.length) { setFailure("Informe a quantidade de ao menos um sabor."); return; }
    setBusy(true); setFailure("");
    try { await repo.recordSale(items, note); onSaved(totalUnits); }
    catch (error) { setFailure(error instanceof Error ? error.message : "Não foi possível registrar a venda."); setBusy(false); }
  }

  return <Modal title="Registrar venda" onClose={onClose} busy={busy}>
    <form className="adm-form" onSubmit={submit} noValidate>
      <div className="adm-form-body">
        <ul className="adm-sale">
          {sellable.map(p => {
            const quantity = quantities[p.id] ?? 0;
            return <li key={p.id} data-picked={quantity > 0}>
              <span className={`adm-thumb tone-${p.tone}`}>{p.image && <img src={p.image} alt="" width="44" height="44" />}</span>
              <div><strong>{p.name}</strong><span>{money(p.priceInCents)} · {p.stock} em estoque</span></div>
              <div className="adm-qty">
                <button type="button" onClick={() => set(p, quantity - 1)} disabled={quantity === 0} aria-label={`Diminuir ${p.name}`}><Minus size={14} /></button>
                <input inputMode="numeric" value={quantity || ""} placeholder="0" onChange={event => set(p, Number(event.target.value.replace(/\D/g, "")))} aria-label={`Quantidade vendida de ${p.name}`} />
                <button type="button" onClick={() => set(p, quantity + 1)} disabled={quantity >= p.stock} aria-label={`Aumentar ${p.name}`}><Plus size={14} /></button>
              </div>
            </li>;
          })}
        </ul>
        <div className="adm-field">
          <label htmlFor="sale-note">Observação <small>opcional — cliente, pedido, forma de entrega</small></label>
          <input id="sale-note" value={note} onChange={event => setNote(event.target.value)} maxLength={200} autoComplete="off" />
        </div>
        <div className="adm-balance" aria-live="polite">
          <span>Total</span><strong>{totalUnits}</strong><span>un. · {money(totalCents)} a preço de catálogo</span>
        </div>
      </div>
      <footer className="adm-modal-foot">
        {failure && <p role="alert" className="adm-error">{failure}</p>}
        <button type="button" className="adm-btn adm-btn-quiet" onClick={onClose} disabled={busy}>Cancelar</button>
        <button type="submit" className="adm-btn adm-btn-primary" disabled={busy}>{busy ? "Registrando…" : "Registrar venda"}</button>
      </footer>
    </form>
  </Modal>;
}
