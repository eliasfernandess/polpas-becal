// Service worker do painel (escopo /admin/). Só mostra notificações de pedido novo e,
// ao tocar nelas, abre ou traz para frente o painel. Não guarda nada em cache.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", event => event.waitUntil(self.clients.claim()));
self.addEventListener("notificationclick", event => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/admin/";
  event.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(windows => {
    const open = windows.find(client => new URL(client.url).pathname.startsWith("/admin"));
    return open ? open.focus() : self.clients.openWindow(url);
  }));
});
