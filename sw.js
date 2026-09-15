// ---------------------------------------------------------------------------
// Service worker. Odbiera zdarzenie push od serwera przegladarki i wyswietla
// powiadomienie. To jedyny kod, ktory dziala, gdy karta jest zamknieta.
// ---------------------------------------------------------------------------

// Nowa wersja workera przejmuje kontrole od razu, bez czekania na zamkniecie
// wszystkich kart — inaczej poprawki wchodzilyby dopiero przy nastepnej wizycie.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    // Push wyslany spoza naszego backendu moze nie byc JSON-em.
    data = { title: "Powiadomienie", body: event.data ? event.data.text() : "" };
  }

  const title = data.title || "Powiadomienie";
  const options = {
    body: data.body || "",
    icon: "icon.png",
    badge: "icon.png",
    tag: data.tag || undefined,
    // Bez tego powiadomienie znika po kilku sekundach i latwo je przeoczyc.
    requireInteraction: true,
    data: { url: data.url || "./" },
  };

  event.waitUntil((async () => {
    try {
      await self.registration.showNotification(title, options);
    } catch (err) {
      // Przegladarka odmowila wyswietlenia — warto, zeby trafilo to do logu
      // strony, bo inaczej push wyglada na zgubiony.
      const tabs = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const tab of tabs) {
        tab.postMessage({ type: "push-error", error: String(err && err.message) });
      }
      return;
    }

    // Otwarte karty dostaja kopie do logu na zywo. To tylko podglad —
    // powiadomienie wyswietla sie niezaleznie od tego, czy ktos slucha.
    const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const client of clients) {
      client.postMessage({ type: "push-received", title, body: options.body });
    }
  })());
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || "./";

  event.waitUntil((async () => {
    const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const client of clients) {
      client.postMessage({ type: "push-clicked", title: event.notification.title });
      if ("focus" in client) return client.focus();
    }
    return self.clients.openWindow(target);
  })());
});
