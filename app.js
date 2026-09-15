// ---------------------------------------------------------------------------
// Demo OneSignal Web SDK v16. Cala logika strony siedzi tutaj.
// Kolejnosc: helpery UI -> init SDK -> nasluch zdarzen -> obsluga przyciskow.
// ---------------------------------------------------------------------------

const $ = (id) => document.getElementById(id);
const cfg = window.DEMO_CONFIG;

// Kolejka SDK. Wszystko co dotyka OneSignala wrzucamy tutaj — SDK laduje sie
// asynchronicznie (defer), wiec bezposrednie wywolania moglyby wyprzedzic init.
window.OneSignalDeferred = window.OneSignalDeferred || [];

// --- UI helpers ------------------------------------------------------------

function log(message, kind = "info") {
  const li = document.createElement("li");
  li.dataset.kind = kind;
  const time = new Date().toLocaleTimeString("pl-PL");
  li.innerHTML = `<span class="t"></span><span class="m"></span>`;
  li.querySelector(".t").textContent = time;
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

// --- odswiezanie panelu statusu --------------------------------------------

async function refreshStatus(OneSignal) {
  // Zgoda przegladarki: 'default' (jeszcze nie pytano), 'granted', 'denied'.
  const native = OneSignal.Notifications.permissionNative;
  const permMap = {
    granted: ["przyznana", "ok"],
    denied:  ["zablokowana", "bad"],
    default: ["nie pytano", "warn"],
  };
  const [permText, permKind] = permMap[native] || ["nieznana", "muted"];
  setPill("stat-permission", permText, permKind);
  $("perm-warning").hidden = native !== "denied";

  // optedIn = przegladarka dala zgode ORAZ uzytkownik nie wypisal sie recznie.
  const optedIn = OneSignal.User.PushSubscription.optedIn === true;
  setPill("stat-optedin", optedIn ? "aktywna" : "nieaktywna", optedIn ? "ok" : "muted");

  $("stat-subid").textContent = OneSignal.User.PushSubscription.id || "—";
  $("stat-osid").textContent = OneSignal.User.onesignalId || "—";
  $("stat-extid").textContent = OneSignal.User.externalId || "—";

  $("btn-subscribe").disabled = optedIn || native === "denied";
  $("btn-unsubscribe").disabled = !optedIn;
}

async function refreshTags(OneSignal) {
  const tags = (await OneSignal.User.getTags()) || {};
  const list = $("tag-list");
  list.innerHTML = "";

  const entries = Object.entries(tags);
  if (entries.length === 0) {
    list.innerHTML = '<li class="empty">Brak tagow.</li>';
    return;
  }

  for (const [key, value] of entries) {
    const li = document.createElement("li");
    li.innerHTML = `<span class="k"></span><span class="v"></span><button title="Usun">&times;</button>`;
    li.querySelector(".k").textContent = `${key} =`;
    li.querySelector(".v").textContent = value;
    li.querySelector("button").addEventListener("click", async () => {
      await OneSignal.User.removeTag(key);
      log(`Tag usuniety: ${key}`, "warn");
      await refreshTags(OneSignal);
    });
    list.appendChild(li);
  }
}

// --- start -----------------------------------------------------------------

$("foot-appid").textContent = cfg.appId;

OneSignalDeferred.push(async function (OneSignal) {
  try {
    await OneSignal.init({
      appId: cfg.appId,
      allowLocalhostAsSecureOrigin: cfg.allowLocalhostAsSecureOrigin,
      // Wlasne przyciski zamiast domyslnego dzwonka.
      notifyButton: { enable: false },
    });
  } catch (err) {
    // Najczestsza przyczyna: domena strony nie zgadza sie z Site URL
    // ustawionym w OneSignal -> Settings -> Push & In-App -> Web.
    log(`Init nieudany: ${err?.message || err}`, "bad");
    log(`Sprawdz, czy ${location.origin} jest wpisane jako Site URL w panelu OneSignal.`, "warn");
    setPill("stat-permission", "SDK niegotowe", "bad");
    setPill("stat-optedin", "SDK niegotowe", "bad");
    return;
  }

  log("SDK zainicjalizowane.", "ok");
  await refreshStatus(OneSignal);
  await refreshTags(OneSignal);

  // --- zdarzenia ----------------------------------------------------------

  // Zmiana zgody w przegladarce (takze gdy uzytkownik zmieni ja w ustawieniach).
  OneSignal.Notifications.addEventListener("permissionChange", async (granted) => {
    log(`Zgoda przegladarki: ${granted ? "przyznana" : "cofnieta"}`, granted ? "ok" : "warn");
    await refreshStatus(OneSignal);
  });

  // Subskrypcja: pojawienie sie ID, opt-in, opt-out.
  OneSignal.User.PushSubscription.addEventListener("change", async (event) => {
    const prev = event.previous || {};
    const curr = event.current || {};
    if (curr.optedIn !== prev.optedIn) {
      log(`Subskrypcja: ${curr.optedIn ? "aktywna" : "wylaczona"}`, curr.optedIn ? "ok" : "warn");
    }
    if (curr.id && curr.id !== prev.id) {
      log(`Subscription ID: ${curr.id}`);
    }
    await refreshStatus(OneSignal);
  });

  // Powiadomienie dotarlo, gdy karta jest otwarta i aktywna.
  OneSignal.Notifications.addEventListener("foregroundWillDisplay", (event) => {
    const n = event.notification || {};
    log(`Odebrane (karta otwarta): ${n.title || "bez tytulu"} — ${n.body || ""}`, "ok");
  });

  // Klikniecie w powiadomienie lub w przycisk akcji.
  OneSignal.Notifications.addEventListener("click", (event) => {
    const title = event.notification?.title || "bez tytulu";
    const action = event.result?.actionId;
    log(`Klikniete: ${title}${action ? ` (akcja: ${action})` : ""}`, "ok");
  });

  // Uzytkownik odrzucil powiadomienie.
  OneSignal.Notifications.addEventListener("dismiss", (event) => {
    log(`Odrzucone: ${event.notification?.title || "bez tytulu"}`, "warn");
  });

  // --- przyciski ----------------------------------------------------------

  $("btn-subscribe").addEventListener("click", async () => {
    if (OneSignal.Notifications.permissionNative === "granted") {
      // Zgoda juz jest — wystarczy wrocic do subskrypcji.
      await OneSignal.User.PushSubscription.optIn();
    } else {
      // Natywny prompt przegladarki. Da sie wywolac tylko z gestu uzytkownika.
      await OneSignal.Notifications.requestPermission();
    }
    await refreshStatus(OneSignal);
  });

  $("btn-unsubscribe").addEventListener("click", async () => {
    await OneSignal.User.PushSubscription.optOut();
    await refreshStatus(OneSignal);
  });

  $("btn-slidedown").addEventListener("click", async () => {
    // Miekki prompt OneSignala. Wyglad ustawiasz w panelu w Web Configuration.
    await OneSignal.Slidedown.promptPush();
  });

  $("tag-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const key = $("tag-key").value.trim();
    const value = $("tag-value").value.trim();
    if (!key || !value) return;
    await OneSignal.User.addTag(key, value);
    log(`Tag dodany: ${key} = ${value}`, "ok");
    $("tag-key").value = "";
    $("tag-value").value = "";
    await refreshTags(OneSignal);
  });

  $("btn-refresh-tags").addEventListener("click", () => refreshTags(OneSignal));

  $("login-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const id = $("external-id").value.trim();
    if (!id) return;
    await OneSignal.login(id);
    log(`Zalogowano jako: ${id}`, "ok");
    await refreshStatus(OneSignal);
  });

  $("btn-logout").addEventListener("click", async () => {
    await OneSignal.logout();
    log("Wylogowano — subskrypcja wrocila do anonimowej.", "warn");
    await refreshStatus(OneSignal);
  });

  // ID pojawiaja sie chwile po inicie, wiec odswiezamy jeszcze raz.
  setTimeout(() => refreshStatus(OneSignal), 2000);
});

// --- rzeczy niezalezne od SDK ----------------------------------------------

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

$("btn-clear-log").addEventListener("click", () => { $("log").innerHTML = ""; });
