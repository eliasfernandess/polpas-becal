"use client";
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, Bike, CheckCircle2, MessageCircle, Minus, Plus, ShoppingBag, Store, Trash2, X } from "lucide-react";
import { KitVisual } from "@/components/kits";
import { productById } from "@/data/products";
import { findZone } from "@/lib/catalog";
import { cartTotal, itemName, kitOf, lineTotal, roomFor, sanitizeCart, unitPrice } from "@/lib/cart";
import { money } from "@/lib/money";
import { saveOrder } from "@/lib/submissions";
import { supabaseConfigured } from "@/lib/supabase";
import { checkoutSchema, formatPhone, formatPostalCode, type Checkout, type CheckoutInput } from "@/lib/validation";
import { addressLine, orderMessage, whatsappUrl } from "@/lib/whatsapp";
import { useCart } from "@/store/cart-store";
import { useCatalog, useDelivery } from "@/store/catalog-store";
import type { CartItem } from "@/types/product";

type Step = "sacola" | "dados" | "entrega" | "endereco" | "confirmar";
type Field = keyof CheckoutInput;
const titles: Record<Step, string> = { sacola: "Meu pedido", dados: "Seus dados", entrega: "Entrega ou retirada?", endereco: "Onde entregar?", confirmar: "Confirme o pedido" };
const stepFields: Record<Step, Field[]> = { sacola: [], dados: ["name", "phone"], entrega: ["fulfillment"], endereco: ["postalCode", "street", "number", "complement", "district", "city"], confirmar: [] };
const empty: CheckoutInput = { name: "", phone: "", fulfillment: "" as CheckoutInput["fulfillment"], postalCode: "", street: "", number: "", complement: "", district: "", city: "" };
const OTHER_ZONE = "outro";

function CartLine({ item, items, onSet, onRemove }: { item: CartItem; items: CartItem[]; onSet: (quantity: number) => void; onRemove: () => void }) {
  const kit = kitOf(item.id);
  const product = productById.get(item.id);
  const price = unitPrice(item.id, item.quantity);
  const name = itemName(item.id);
  const bulkApplied = product && price < product.priceInCents;
  const bulkHint = product && product.bulkMin > 0 && !bulkApplied ? `Leve ${product.bulkMin} e pague ${money(product.bulkPriceInCents)} cada` : "";
  return <article className={`cart-item tone-${product?.tone ?? "sand"}`}>
    <div className="cart-image">
      {kit ? <KitVisual kit={kit} size="thumb" /> : product?.image && <img src={product.image} alt={`Polpa de ${name}`} width="78" height="78" />}
    </div>
    <div className="cart-item-info">
      <h3>{name}</h3>
      {kit
        ? <p>{kit.items.map(i => `${i.quantity > 1 ? `${i.quantity}× ` : ""}${productById.get(i.id)?.name ?? i.id}`).join(", ")} · {money(price)} / kit</p>
        : <p>{product?.unitLabel} · {money(price)} / un.{bulkApplied && <span className="cart-bulk"> · preço por quantidade</span>}</p>}
      {bulkHint && <small className="cart-bulk-hint">{bulkHint}</small>}
      <div className="stepper">
        <button type="button" aria-label={`Diminuir ${name}`} onClick={() => onSet(item.quantity - 1)}><Minus size={14} /></button>
        <span aria-live="polite">{item.quantity}</span>
        <button type="button" disabled={roomFor(item.id, items) <= 0} aria-label={`Aumentar ${name}`} onClick={() => onSet(item.quantity + 1)}><Plus size={14} /></button>
      </div>
    </div>
    <div className="cart-item-end">
      <strong>{money(lineTotal(item))}</strong>
      <button type="button" className="icon-button" aria-label={`Remover ${name}`} onClick={onRemove}><Trash2 size={17} /></button>
    </div>
  </article>;
}

export function CartDrawer() {
  const { items: stored, open, setOpen, dispatch } = useCart();
  useCatalog(); // re-renderiza quando preços, kits ou estoque mudam
  const { zones, settings } = useDelivery();
  const ref = useRef<HTMLDialogElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  // Os dados ficam só na memória desta página (nada vai para o armazenamento do navegador).
  const [values, setValues] = useState<CheckoutInput>(empty);
  const [zoneChoice, setZoneChoice] = useState("");
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
  const [step, setStep] = useState<Step>("sacola");
  const [direction, setDirection] = useState<"forward" | "back">("forward");
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState("");
  const [saved, setSaved] = useState<{ signature: string; id: string } | null>(null);
  const attempt = useRef<{ signature: string; id: string } | null>(null);
  const busy = useRef(false);

  useEffect(() => {
    const dialog = ref.current;
    if (open && dialog && !dialog.open) dialog.showModal();
    if (!open && dialog?.open) dialog.close();
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previous; };
  }, [open]);

  // Mostra apenas o que ainda existe e tem estoque no catálogo atual.
  const items = sanitizeCart(stored);
  const subtotal = cartTotal(items);
  const activeZones = zones.filter(z => z.active);
  const belowMinimum = settings.minOrderCents > 0 && subtotal < settings.minOrderCents;
  const deliveryAllowed = settings.deliveryEnabled && !belowMinimum;
  const canCheckout = settings.pickupEnabled || deliveryAllowed;
  const delivering = values.fulfillment === "entrega";
  const zone = delivering && activeZones.length ? findZone(activeZones, values.city, values.district) : undefined;
  // Taxa: número (bairro cadastrado), null (sem bairros: a combinar) ou undefined (retirada / ainda não escolhido).
  const feeCents = !delivering ? undefined : activeZones.length ? zone?.feeCents : null;
  const grandTotal = subtotal + (feeCents ?? 0);

  const steps: Step[] = ["sacola", "dados", "entrega", ...(delivering ? ["endereco" as const] : []), "confirmar"];
  const current = items.length ? (steps.includes(step) ? step : "sacola") : "sacola";
  const index = steps.indexOf(current);
  const parsed = checkoutSchema.safeParse(values);
  const customer: Checkout | null = parsed.success ? parsed.data : null;
  const signature = JSON.stringify({ items, subtotal, customer, feeCents });
  const done = saved?.signature === signature ? saved : null;

  const go = (next: Step) => {
    setDirection(steps.indexOf(next) < index ? "back" : "forward");
    setErrors({}); setFailure(""); setStep(next);
    requestAnimationFrame(() => titleRef.current?.focus());
  };
  const set = (field: Field, value: string) => {
    setValues(v => ({ ...v, [field]: value }));
    setErrors(e => ({ ...e, [field]: undefined }));
  };
  const close = () => setOpen(false);
  const chooseZone = (id: string) => {
    setZoneChoice(id);
    const picked = activeZones.find(z => z.id === id);
    setValues(v => ({ ...v, district: picked?.district ?? "", city: picked?.city ?? "" }));
    setErrors(e => ({ ...e, district: undefined, city: undefined }));
  };

  function next(event?: FormEvent) {
    event?.preventDefault();
    if (current === "sacola" && !canCheckout) return;
    const fields = stepFields[current];
    const found: Partial<Record<Field, string>> = {};
    if (fields.length && !parsed.success) {
      for (const issue of parsed.error.issues) {
        const key = String(issue.path[0]) as Field;
        if (fields.includes(key)) found[key] ||= issue.message;
      }
    }
    if (current === "entrega" && delivering && !deliveryAllowed) found.fulfillment = belowMinimum ? `A entrega é para pedidos a partir de ${money(settings.minOrderCents)}.` : "No momento não estamos entregando.";
    if (current === "entrega" && values.fulfillment === "retirada" && !settings.pickupEnabled) found.fulfillment = "No momento não temos retirada.";
    if (current === "endereco" && activeZones.length && !zone) {
      found.district = zoneChoice === OTHER_ZONE ? "Ainda não entregamos nesse bairro. Volte e escolha retirada." : "Escolha o seu bairro na lista.";
      delete found.city;
    }
    if (Object.keys(found).length) {
      setErrors(found);
      const first = Object.keys(found)[0];
      (document.getElementById(`co-${first}`) ?? document.querySelector<HTMLElement>(`[name="co-${first}"]`))?.focus();
      return;
    }
    go(steps[index + 1]);
  }

  async function register() {
    if (busy.current || !customer) return;
    busy.current = true; setPending(true); setFailure("");
    // Mesmo pedido, mesma tentativa: repetir após uma falha não duplica o registro.
    if (attempt.current?.signature !== signature) attempt.current = { signature, id: crypto.randomUUID() };
    const request = attempt.current;
    try { await saveOrder(request.id, items, subtotal, customer, delivering ? feeCents ?? null : null); setSaved(request); }
    catch (cause) { setFailure(cause instanceof Error ? cause.message : "Não foi possível registrar. Tente novamente."); }
    finally { busy.current = false; setPending(false); }
  }
  const startOver = () => {
    dispatch({ type: "clear" });
    setValues(empty); setZoneChoice(""); setSaved(null); attempt.current = null; setStep("sacola"); close();
  };

  const message = customer && items.length ? orderMessage(items, undefined, customer, delivering ? feeCents ?? null : undefined) + (done ? `\n\nReferência do pedido: ${done.id.slice(0, 8)}` : "") : "";
  const field = (name: Field, label: ReactNode, props: React.InputHTMLAttributes<HTMLInputElement> = {}, full = true) => <div className={`field ${full ? "full-field" : ""}`}>
    <label htmlFor={`co-${name}`}>{label}</label>
    <input id={`co-${name}`} name={`co-${name}`} value={values[name]} onChange={e => set(name, e.target.value)}
      aria-invalid={Boolean(errors[name])} aria-describedby={errors[name] ? `co-${name}-error` : undefined} {...props} />
    {errors[name] && <span id={`co-${name}-error`} className="field-error">{errors[name]}</span>}
  </div>;
  const feeLabel = feeCents === undefined ? "" : feeCents === null ? "a combinar" : feeCents === 0 ? "grátis" : money(feeCents);
  const cities = [...new Set(activeZones.map(z => z.city))];

  return <dialog ref={ref} className="cart-dialog" aria-labelledby="cart-title" onCancel={close}>
    <form className="cart-panel" onSubmit={next} noValidate>
      <div className="cart-heading">
        <div>
          {items.length > 0 && <span className="eyebrow">Etapa {index + 1} de {steps.length}</span>}
          <h2 id="cart-title" ref={titleRef} tabIndex={-1}>{titles[current]}</h2>
        </div>
        <button type="button" className="icon-button" aria-label="Fechar carrinho" onClick={close}><X /></button>
      </div>
      {items.length > 0 && <div className="checkout-bar" aria-hidden="true">{steps.map((s, i) => <i key={s} data-on={i <= index} />)}</div>}

      {!items.length ? <div className="empty-cart">
        <span className="empty-icon"><ShoppingBag size={32} /></span>
        <h3>Tem espaço para muito sabor.</h3>
        <p>Escolha suas polpas favoritas para começar o seu pedido.</p>
        <Link href="/produtos/" className="button button-primary" onClick={close}>Explorar os sabores <ArrowRight size={16} /></Link>
      </div> : <>
        <div className="cart-body" key={current} data-direction={direction}>
          {current === "sacola" && <>
            <div className="cart-items">{items.map(item => <CartLine key={item.id} item={item} items={items}
              onSet={quantity => dispatch({ type: "set", id: item.id, quantity })} onRemove={() => dispatch({ type: "remove", id: item.id })} />)}</div>
            {settings.deliveryEnabled && settings.minOrderCents > 0 && <p className="checkout-minimum" data-ok={!belowMinimum}>
              {belowMinimum
                ? <>Faltam <b>{money(settings.minOrderCents - subtotal)}</b> para pedir com entrega (mínimo {money(settings.minOrderCents)}).{settings.pickupEnabled && " Para retirada, não há mínimo."}</>
                : <>Seu pedido já pode ser entregue.</>}
            </p>}
          </>}

          {current === "dados" && <div className="checkout-fields">
            <p className="checkout-hint">Para a equipe confirmar o pedido com você pelo WhatsApp.</p>
            {field("name", "Seu nome", { autoComplete: "name", maxLength: 80, placeholder: "Como podemos chamar você?" })}
            {field("phone", "Telefone com DDD", { type: "tel", inputMode: "tel", autoComplete: "tel-national", placeholder: "(34) 99999-0000", value: values.phone, onChange: e => set("phone", formatPhone(e.target.value)) })}
          </div>}

          {current === "entrega" && <fieldset className="checkout-choice" aria-describedby={errors.fulfillment ? "co-fulfillment-error" : undefined}>
            <legend className="sr-only">Como você quer receber?</legend>
            {settings.deliveryEnabled && <label className="choice-card" data-disabled={!deliveryAllowed}>
              <input type="radio" name="co-fulfillment" value="entrega" checked={values.fulfillment === "entrega"} disabled={!deliveryAllowed} onChange={() => set("fulfillment", "entrega")} />
              <Bike size={24} strokeWidth={1.6} aria-hidden="true" />
              <span><strong>Entregar no meu endereço</strong><small>{!deliveryAllowed
                ? `Disponível para pedidos a partir de ${money(settings.minOrderCents)}.`
                : activeZones.length ? `Taxa conforme o bairro, a partir de ${money(Math.min(...activeZones.map(z => z.feeCents)))}.` : "A taxa de entrega é combinada pelo WhatsApp."}</small></span>
            </label>}
            {settings.pickupEnabled && <label className="choice-card">
              <input type="radio" name="co-fulfillment" value="retirada" checked={values.fulfillment === "retirada"} onChange={() => set("fulfillment", "retirada")} />
              <Store size={24} strokeWidth={1.6} aria-hidden="true" />
              <span><strong>Vou retirar</strong><small>Sem taxa. Combinamos o horário e o local pelo WhatsApp.</small></span>
            </label>}
            {errors.fulfillment && <span id="co-fulfillment-error" className="field-error">{errors.fulfillment}</span>}
          </fieldset>}

          {current === "endereco" && <div className="checkout-fields form-grid">
            {activeZones.length > 0 && <div className="field full-field">
              <label htmlFor="co-district">Bairro</label>
              <select id="co-district" name="co-district" value={zone?.id ?? zoneChoice} onChange={e => chooseZone(e.target.value)}
                aria-invalid={Boolean(errors.district)} aria-describedby={errors.district ? "co-district-error" : "co-district-hint"}>
                <option value="" disabled>Escolha o seu bairro</option>
                {cities.map(city => <optgroup key={city} label={city}>
                  {activeZones.filter(z => z.city === city).map(z => <option key={z.id} value={z.id}>{z.district} · {z.feeCents ? money(z.feeCents) : "entrega grátis"}</option>)}
                </optgroup>)}
                <option value={OTHER_ZONE}>Meu bairro não está na lista</option>
              </select>
              {errors.district ? <span id="co-district-error" className="field-error">{errors.district}</span>
                : <small id="co-district-hint">{zone ? `Taxa de entrega: ${zone.feeCents ? money(zone.feeCents) : "grátis"}` : "Entregamos nos bairros da lista."}</small>}
            </div>}
            {field("postalCode", "CEP", { inputMode: "numeric", autoComplete: "postal-code", placeholder: "38400-000", value: values.postalCode, onChange: e => set("postalCode", formatPostalCode(e.target.value)) }, false)}
            {field("number", "Número", { autoComplete: "address-line2", maxLength: 12, placeholder: "123 ou s/n" }, false)}
            {field("street", "Rua ou avenida", { autoComplete: "address-line1", maxLength: 120 })}
            {field("complement", <>Complemento <small>opcional</small></>, { maxLength: 60, placeholder: "Apto, bloco, referência" })}
            {!activeZones.length && <>
              {field("district", "Bairro", { autoComplete: "address-level3", maxLength: 60 }, false)}
              {field("city", "Cidade", { autoComplete: "address-level2", maxLength: 60 }, false)}
            </>}
          </div>}

          {current === "confirmar" && customer && <div className="checkout-review">
            <section>
              <header><h3>Itens</h3><button type="button" className="text-button" onClick={() => go("sacola")} aria-label="Editar itens">Editar</button></header>
              <ul>{items.map(item => { const kit = kitOf(item.id); const p = productById.get(item.id);
                return <li key={item.id}><span className={`tone-dot tone-${p?.tone ?? "sand"}`} aria-hidden="true" />{item.quantity}× {kit ? kit.name : p?.name}<b>{money(lineTotal(item))}</b></li>; })}</ul>
            </section>
            <section>
              <header><h3>Seus dados</h3><button type="button" className="text-button" onClick={() => go("dados")} aria-label="Editar seus dados">Editar</button></header>
              <p>{customer.name} · {formatPhone(customer.phone)}</p>
            </section>
            <section>
              <header><h3>{delivering ? "Entrega" : "Retirada"}</h3><button type="button" className="text-button" onClick={() => go(delivering ? "endereco" : "entrega")} aria-label="Editar entrega">Editar</button></header>
              <p>{delivering ? addressLine(customer) : "Você retira o pedido. Combinamos o horário pelo WhatsApp."}</p>
            </section>
          </div>}
        </div>

        <div className="cart-checkout">
          {delivering && current === "confirmar" && <div className="cart-subtotals">
            <span>Subtotal</span><b>{money(subtotal)}</b>
            <span>Entrega</span><b>{feeLabel}</b>
          </div>}
          <div className="cart-total"><span>Total</span><strong>{money(current === "confirmar" ? grandTotal : subtotal)}</strong></div>
          {failure && <p role="alert" className="form-alert">{failure}</p>}
          {done && <p role="status" className="checkout-saved"><CheckCircle2 size={18} /> Pedido registrado! Agora é só enviar no WhatsApp.</p>}
          {current !== "confirmar"
            ? <button type="submit" className="button button-primary full" disabled={current === "sacola" && !canCheckout}>{current === "sacola" ? "Continuar" : "Próximo"} <ArrowRight size={16} /></button>
            : supabaseConfigured && !done
              ? <button type="button" className="button button-primary full" disabled={pending || !customer} onClick={register}>{pending ? "Registrando pedido…" : "Registrar pedido"} <ArrowRight size={16} /></button>
              : <a className="button button-primary full" href={whatsappUrl(message)} target="_blank" rel="noopener noreferrer"><MessageCircle size={18} /> Continuar no WhatsApp <ArrowRight size={16} /></a>}
          {current === "confirmar" && <small>{supabaseConfigured
            ? "Guardamos o pedido e os seus dados só para atender você. A confirmação e o pagamento são combinados pelo WhatsApp."
            : "A confirmação e o pagamento são combinados pelo WhatsApp."}</small>}
          {index > 0
            ? <button type="button" className="text-button" onClick={() => go(steps[index - 1])} disabled={pending}><ArrowLeft size={15} /> Voltar</button>
            : <button type="button" className="text-button" onClick={close}>Continuar escolhendo</button>}
          {done && <button type="button" className="text-button" onClick={startOver}>Fazer outro pedido</button>}
        </div>
      </>}
    </form>
  </dialog>;
}
