// ---------------------------------------------------------------------------
// Strona demo. Rejestruje service workera, tworzy subskrypcje push i wiaze ja
// z ID uzytkownika po stronie backendu.
//
// Zadnego SDK — to czyste Web Push API przegladarki.
// ---------------------------------------------------------------------------

const $ = (id) => document.getElementById(id);
const STORAGE_KEY = "demo_user_id";

// --- UI helpers ------------------------------------------------------------

function log(message, kind = "info") {
  const li = document.createElement("li");
  li.dataset.kind = kind;
  li.innerHTML = `<span class="t"></span><span class="m"></span>`;
  li.querySelector(".t").textContent = new Date().toLocaleTimeString("pl-PL");
  li.querySelector(".m").textContent = message;
  const list = $("log");
  list.prepend(li);
  while (list.children.length > 100) list.lastElementChild.remove();
}

let toastTimer;
function toast(message) {
  const el = $("toast");
  el.textContent = message;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, 2200);
}

function setPill(id, text, kind) {
  const el = $(id);
  el.textContent = text;
  el.className = `pill pill-${kind}`;
}

function rememberedId() {
  try { return localStorage.getItem(STORAGE_KEY) || ""; } catch { return ""; }
}
function rememberId(value) {
  try { value ? localStorage.setItem(STORAGE_KEY, value) : localStorage.removeItem(STORAGE_KEY); } catch {}
}

// Klucz VAPID jedzie w URL-safe base64, a pushManager oczekuje surowych bajtow.
function urlBase64ToUint8Array(base64) {
  const padded = (base64 + "=".repeat((4 - (base64.length % 4)) % 4))
    .replace(/-/g, "+")
    .replace(/_/g, "/");
  const raw = atob(padded);
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

// --- stan ------------------------------------------------------------------

let registration = null;

async function currentSubscription() {
  if (!registration) return null;
  return registration.pushManager.getSubscription();
}

async function refreshStatus() {
  const permission = Notification.permission;
  const permMap = {
    granted: ["przyznana", "ok"],
    denied:  ["zablokowana", "bad"],
    default: ["nie pytano", "warn"],
  };
  const [permText, permKind] = permMap[permission] || ["nieznana", "muted"];
  setPill("stat-permission", permText, permKind);
  $("perm-warning").hidden = permission !== "denied";

  setPill("stat-sw", registration ? "zarejestrowany" : "brak", registration ? "ok" : "muted");

  const sub = await currentSubscription();
  setPill("stat-subscribed", sub ? "aktywna" : "nieaktywna", sub ? "ok" : "muted");
  $("stat-endpoint").textContent = sub ? new URL(sub.endpoint).host : "—";
  $("stat-user").textContent = rememberedId() || "—";

  $("btn-unsubscribe").disabled = !sub;
  syncSignupButton(permission === "denied");
}

function syncSignupButton(permissionDenied = false) {
  const hasId = $("user-id").value.trim().length > 0;
  $("btn-signup").disabled = !hasId || permissionDenied;
  $("id-hint").hidden = hasId;
}

// --- zapis -----------------------------------------------------------------

async function subscribe(userId) {
  // 1. Zgoda. Musi wyjsc z gestu uzytkownika, inaczej przegladarka ja odrzuci.
  const before = Notification.permission;
  const permission = await Notification.requestPermission();
  log(`Prosba o zgode: ${before} -> ${permission}`);
  if (permission !== "granted") {
    log("Bez zgody nie da sie utworzyc subskrypcji.", "warn");
    await refreshStatus();
    return;
  }

  // 2. Publiczny klucz VAPID z backendu.
  const configRes = await fetch("/api/config");
  if (!configRes.ok) {
    const data = await configRes.json().catch(() => ({}));
    log(`Brak konfiguracji: ${data.error || `HTTP ${configRes.status}`}`, "bad");
    return;
  }
  const { vapidPublicKey } = await configRes.json();

  // 3. Subskrypcja w przegladarce. userVisibleOnly jest wymagane — przegladarki
  //    nie pozwalaja na ciche pushe do stron.
  let subscription = await registration.pushManager.getSubscription();
  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
    });
    log(`Subskrypcja utworzona (${new URL(subscription.endpoint).host}).`, "ok");
  }

  // 4. Zapis po stronie serwera, razem z ID uzytkownika.
  const res = await fetch("/api/subscribe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId, subscription: subscription.toJSON() }),
  });
  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    log(`Zapis nieudany: ${data.error || `HTTP ${res.status}`}`, "bad");
    return;
  }

  rememberId(userId);
  log(data.status === "created"
    ? `Zapisano jako ${userId}.`
    : `Zaktualizowano zapis — to urzadzenie nalezy teraz do ${userId}.`, "ok");
  toast("Zapisano");
}

async function unsubscribe() {
  const sub = await currentSubscription();
  if (!sub) return;

  // Kolejnosc ma znaczenie: najpierw kasujemy wpis w bazie, bo po
  // sub.unsubscribe() endpoint przestaje byc dostepny.
  await fetch("/api/unsubscribe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ endpoint: sub.endpoint }),
  }).catch(() => {});

  await sub.unsubscribe();
  rememberId("");
  log("Urzadzenie wypisane.", "warn");
  toast("Wypisano");
}

// --- start -----------------------------------------------------------------

async function init() {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
    setPill("stat-permission", "brak wsparcia", "bad");
    log("Ta przegladarka nie obsluguje Web Push.", "bad");
    $("btn-signup").disabled = true;
    return;
  }

  $("user-id").value = rememberedId();
  syncSignupButton();

  try {
    registration = await navigator.serviceWorker.register("sw.js");
    await navigator.serviceWorker.ready;
    log("Service worker zarejestrowany.", "ok");
  } catch (err) {
    log(`Rejestracja service workera nieudana: ${err.message}`, "bad");
  }

  // Powiadomienia odebrane przy otwartej karcie melduja sie tutaj.
  navigator.serviceWorker.addEventListener("message", (event) => {
    const { type, title, body } = event.data || {};
    if (type === "push-received") log(`Odebrane: ${title} — ${body}`, "ok");
    if (type === "push-clicked") log(`Klikniete: ${title}`, "ok");
  });

  await refreshStatus();
}

$("signup-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const userId = $("user-id").value.trim();
  if (!userId) return;
  const button = $("btn-signup");
  button.disabled = true;
  try {
    await subscribe(userId);
  } catch (err) {
    log(`Blad zapisu: ${err.message}`, "bad");
  } finally {
    await refreshStatus();
  }
});

$("btn-unsubscribe").addEventListener("click", async () => {
  try {
    await unsubscribe();
  } catch (err) {
    log(`Blad wypisania: ${err.message}`, "bad");
  } finally {
    await refreshStatus();
  }
});

$("user-id").addEventListener("input", () => syncSignupButton());
$("btn-clear-log").addEventListener("click", () => { $("log").innerHTML = ""; });

document.querySelectorAll("[data-copy]").forEach((btn) => {
  btn.addEventListener("click", async () => {
    const text = $(btn.dataset.copy).textContent.trim();
    if (!text || text === "—") return toast("Nie ma czego kopiowac");
    try {
      await navigator.clipboard.writeText(text);
      toast("Skopiowane");
    } catch {
      toast("Kopiowanie zablokowane przez przegladarke");
    }
  });
});

init();
