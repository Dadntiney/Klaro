// Service worker van Klaro: alleen voor pushmeldingen (geen opslag van pagina's of gegevens).
self.addEventListener("push", (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch { d = { body: e.data ? e.data.text() : "" }; }
  e.waitUntil(self.registration.showNotification(d.title || "Klaro", { body: d.body || "", tag: d.tag, icon: "/apple-icon.png", badge: "/apple-icon.png" }));
});
// Tik op de melding: Klaro openen (of naar voren halen als hij al open is).
self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  // De melding zelf zegt niets (meekijkers); Klaro laat dan meteen de echte tekst zien onder "Laatste meldingen".
  e.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((ws) => {
    if (!ws.length) return self.clients.openWindow("/?meldingen");
    ws[0].postMessage({ meldingen: 1 });
    return ws[0].focus();
  }));
});
