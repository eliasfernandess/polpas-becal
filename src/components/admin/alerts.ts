"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { money } from "@/lib/money";
import type { OrderRecord } from "@/types/product";

const PREF_KEY = "becal:admin:alerts";
type Permission = NotificationPermission | "unsupported";
export interface OrderAlerts {
  /** Som + notificação ligados neste aparelho. */
  enabled: boolean;
  permission: Permission;
  enable: () => Promise<void>;
  disable: () => void;
  test: () => void;
}

const readPref = () => { try { return localStorage.getItem(PREF_KEY) === "on"; } catch { return false; } };
const writePref = (on: boolean) => { try { localStorage.setItem(PREF_KEY, on ? "on" : "off"); } catch { /* preferência só desta sessão */ } };
const currentPermission = (): Permission => typeof Notification === "undefined" ? "unsupported" : Notification.permission;

/** Dois toques curtos e agradáveis, gerados na hora (sem arquivo de áudio). */
function chime(context: AudioContext) {
  const now = context.currentTime;
  [[880, 0], [1318.5, 0.16]].forEach(([frequency, delay]) => {
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = "sine";
    oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(0.0001, now + delay);
    gain.gain.exponentialRampToValueAtTime(0.25, now + delay + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + delay + 0.45);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start(now + delay);
    oscillator.stop(now + delay + 0.5);
  });
}

const describe = (order: OrderRecord) => {
  const items = order.items.map(i => `${i.quantity}× ${i.name}`).join(", ");
  const total = money(order.totalInCents + (order.deliveryFeeCents ?? 0));
  const how = order.fulfillment === "entrega" ? "entrega" : order.fulfillment === "retirada" ? "retirada" : "combinar";
  return `${items} · ${total} · ${how}`;
};

/**
 * Avisa quando chega pedido novo enquanto o painel estiver aberto (mesmo em outra aba ou minimizado):
 * toca um som, mostra uma notificação do sistema e põe a contagem no título da aba.
 * Os pedidos que já existiam ao abrir o painel não disparam aviso.
 */
export function useOrderAlerts(orders: OrderRecord[] | null): OrderAlerts {
  const [enabled, setEnabled] = useState(false);
  const [permission, setPermission] = useState<Permission>("default");
  const audio = useRef<AudioContext | null>(null);
  const known = useRef<Set<string> | null>(null);
  const registration = useRef<ServiceWorkerRegistration | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => { setPermission(currentPermission()); setEnabled(readPref()); }, 0);
    // O service worker permite notificar no Android e abrir o painel ao tocar na notificação.
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/admin-sw.js", { scope: "/admin/" }).then(r => { registration.current = r; }).catch(() => {});
    // O navegador só libera som depois de um toque/clique na página.
    const unlock = () => { if (audio.current?.state === "suspended") void audio.current.resume(); };
    window.addEventListener("pointerdown", unlock);
    return () => { clearTimeout(timer); window.removeEventListener("pointerdown", unlock); };
  }, []);

  const notify = useCallback((order: OrderRecord) => {
    if (audio.current) { if (audio.current.state === "suspended") void audio.current.resume(); chime(audio.current); }
    if (currentPermission() !== "granted") return;
    const title = `Novo pedido — ${order.customerName || "cliente"}`;
    const options: NotificationOptions = { body: describe(order), tag: order.id, icon: "/icon.svg", data: { url: "/admin/" } };
    if (registration.current) void registration.current.showNotification(title, options);
    else { try { new Notification(title, options); } catch { /* Navegador sem notificação direta */ } }
  }, []);

  useEffect(() => {
    if (!orders) return;
    const pending = orders.filter(o => o.status === "pending_whatsapp");
    if (!known.current) { known.current = new Set(orders.map(o => o.id)); return; }
    const fresh = pending.filter(o => !known.current!.has(o.id));
    for (const order of orders) known.current.add(order.id);
    if (enabled) fresh.forEach(notify);
  }, [orders, enabled, notify]);

  // Contagem no título da aba, visível mesmo com outra aba aberta.
  useEffect(() => {
    const count = orders?.filter(o => o.status === "pending_whatsapp").length ?? 0;
    document.title = count ? `(${count}) Pedidos novos · Polpas Becal` : "Painel de estoque | Polpas Becal";
  }, [orders]);

  const enable = useCallback(async () => {
    try { audio.current ??= new AudioContext(); await audio.current.resume(); } catch { /* sem som neste navegador */ }
    let result = currentPermission();
    if (result === "default") result = await Notification.requestPermission();
    setPermission(result);
    setEnabled(true); writePref(true);
  }, []);
  const disable = useCallback(() => { setEnabled(false); writePref(false); }, []);
  const test = useCallback(() => {
    notify({ id: `teste-${Date.now()}`, createdAt: new Date().toISOString(), status: "pending_whatsapp", items: [{ id: "teste", name: "Polpa de teste", unitLabel: "100 g", priceInCents: 490, quantity: 2 }], totalInCents: 980, deliveryFeeCents: null, customerName: "Teste de aviso", customerPhone: "", fulfillment: "retirada", address: { postalCode: "", street: "", number: "", complement: "", district: "", city: "" } });
  }, [notify]);

  // Se o som estava ligado de uma visita anterior, prepara o áudio (ele destrava no primeiro toque).
  useEffect(() => { if (enabled && !audio.current) { try { audio.current = new AudioContext(); } catch { /* sem som */ } } }, [enabled]);

  return { enabled, permission, enable, disable, test };
}
