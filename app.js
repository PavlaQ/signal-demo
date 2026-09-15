// ---------------------------------------------------------------------------
// Demo OneSignal Web SDK v16.
//
// Glowna idea: uzytkownik nie zapisuje sie anonimowo. Najpierw podaje wlasne
// ID (External ID), dopiero potem prosimy przegladarke o zgode. Dzieki temu
// kazda subskrypcja jest od razu przypisana do konkretnej osoby i mozna do
// niej wyslac powiadomienie pojedynczo.
// ---------------------------------------------------------------------------

const $ = (id) => document.getElementById(id);
const cfg = window.DEMO_CONFIG;
const STORAGE_KEY = "demo_external_id";
const GROUP_TAG = "grupa";
// Segment nie potrafi filtrowac po External ID, wiec to samo ID ladzie tez w tagu.
const UID_TAG = "uid";

// Kolejka SDK. Wszystko co dotyka OneSignala wrzucamy tutaj — SDK laduje sie
// asynchronicznie (defer), wiec bezposrednie wywolania moglyby wyprzedzic init.
window.OneSignalDeferred = window.OneSignalDeferred || [];

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

// Zapamietane ID przezywa odswiezenie strony. Tryb prywatny potrafi rzucic
// wyjatkiem przy dostepie do localStorage, wiec kazde uzycie jest oslonione.
function rememberedId() {
  try { return localStorage.getItem(STORAGE_KEY) || ""; } catch { return ""; }
}
function rememberId(value) {
  try { value ? localStorage.setItem(STORAGE_KEY, value) : localStorage.removeItem(STORAGE_KEY); } catch {}
}

// --- snippet do wysylki ----------------------------------------------------

function renderCurl(payload) {
  return (
    `curl -X POST https://api.onesignal.com/notifications \\\n` +
    `  -H "Authorization: Key TWOJ_REST_API_KEY" \\\n` +
    `  -H "Content-Type: application/json" \\\n` +
    `  -d '${JSON.stringify(payload, null, 2).replace(/\n/g, "\n  ")}'`
  );
}

function renderSnippet(externalId) {
  const pre = $("curl-snippet");
  if (!externalId) {
    pre.textContent = "Zapisz sie z wlasnym ID, a polecenie pojawi sie tutaj.";
    pre.dataset.ready = "false";
    return;
  }
  const payload = {
    app_id: cfg.appId,
    target_channel: "push",
    include_aliases: { external_id: [externalId] },
    headings: { en: "Czesc!" },
    contents: { en: `To powiadomienie poszlo tylko do ${externalId}` },
  };
  pre.textContent = renderCurl(payload);
  pre.dataset.ready = "true";
}

// Grupa to zwykly tag o ustalonym kluczu. Wysylka celuje w nia filtrem
// liczonym w momencie wyslania, wiec segment w panelu jest zbedny.
function renderGroupSnippet(group) {
  const pre = $("curl-group");
  if (!group) {
    pre.textContent = "Przypisz sie do grupy, a polecenie pojawi sie tutaj.";
    pre.dataset.ready = "false";
    return;
  }
  pre.textContent = renderCurl({
    app_id: cfg.appId,
    target_channel: "push",
    filters: [{ field: "tag", key: GROUP_TAG, relation: "=", value: group }],
    headings: { en: "Czesc!" },
    contents: { en: `Push do calej grupy ${group}` },
  });
  pre.dataset.ready = "true";
}

// --- odswiezanie panelu statusu --------------------------------------------

function refreshStatus(OneSignal) {
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

  const externalId = OneSignal.User.externalId || "";
  $("stat-extid").textContent = externalId || "—";
  $("stat-subid").textContent = OneSignal.User.PushSubscription.id || "—";
  $("stat-osid").textContent = OneSignal.User.onesignalId || "—";
  renderSnippet(externalId);

  $("btn-unsubscribe").disabled = !optedIn;
  $("btn-logout").disabled = !externalId;
  syncSignupButton(native === "denied");
}

// Zapis jest mozliwy dopiero gdy pole ID nie jest puste — to pilnuje, zeby
// nikt nie wyladowal w bazie jako anonim.
function syncSignupButton(permissionDenied = false) {
  const hasId = $("external-id").value.trim().length > 0;
  $("btn-signup").disabled = !hasId || permissionDenied;
  $("id-hint").hidden = hasId;
}

function syncGroupButton() {
  $("btn-group").disabled = $("group-name").value.trim().length === 0;
}

async function refreshTags(OneSignal) {
  const tags = (await OneSignal.User.getTags()) || {};

  // Tag grupy ma wlasna sekcje, wiec nie dubluje sie na liscie ponizej.
  const group = tags[GROUP_TAG] || "";
  $("stat-group").textContent = group || "—";
  $("btn-leave-group").disabled = !group;
  if (group && !$("group-name").value.trim()) $("group-name").value = group;
  renderGroupSnippet(group);
  syncGroupButton();

  const list = $("tag-list");
  list.innerHTML = "";

  const hidden = new Set([GROUP_TAG, UID_TAG]);
  const entries = Object.entries(tags).filter(([key]) => !hidden.has(key));
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
$("external-id").value = rememberedId();
renderSnippet("");
renderGroupSnippet("");
syncSignupButton();
syncGroupButton();

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
    $("btn-signup").disabled = true;
    $("btn-group").disabled = true;
    $("id-hint").hidden = true;
    return;
  }

  log("SDK zainicjalizowane.", "ok");

  // Odtworzenie tozsamosci po odswiezeniu strony.
  const saved = rememberedId();
  if (saved && !OneSignal.User.externalId) {
    await OneSignal.login(saved);
    log(`Przywrocono ID z poprzedniej wizyty: ${saved}`);
  }

  refreshStatus(OneSignal);
  await refreshTags(OneSignal);

  // --- zdarzenia ----------------------------------------------------------

  // Zmiana zgody w przegladarce (takze gdy uzytkownik zmieni ja w ustawieniach).
  OneSignal.Notifications.addEventListener("permissionChange", (granted) => {
    log(`Zgoda przegladarki: ${granted ? "przyznana" : "cofnieta"}`, granted ? "ok" : "warn");
    refreshStatus(OneSignal);
  });

  // Subskrypcja: pojawienie sie ID, opt-in, opt-out.
  OneSignal.User.PushSubscription.addEventListener("change", (event) => {
    const prev = event.previous || {};
    const curr = event.current || {};
    if (curr.optedIn !== prev.optedIn) {
      log(`Subskrypcja: ${curr.optedIn ? "aktywna" : "wylaczona"}`, curr.optedIn ? "ok" : "warn");
    }
    if (curr.id && curr.id !== prev.id) {
      log(`Subscription ID: ${curr.id}`);
    }
    refreshStatus(OneSignal);
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

  // Jedno klikniecie = przypisanie ID + prosba o zgode. Kolejnosc ma znaczenie:
  // login() przed opt-inem sprawia, ze subskrypcja od razu powstaje pod
  // wlasciwym uzytkownikiem, zamiast najpierw anonimowo i dopiero potem migrowac.
  $("signup-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const id = $("external-id").value.trim();
    if (!id) return;

    await OneSignal.login(id);
    rememberId(id);
    log(`Przypisano External ID: ${id}`, "ok");

    // Tag z wlasnym ID zostaje, bo pozwala zalozyc segment recznie w panelu,
    // gdyby kiedys byl potrzebny.
    await OneSignal.User.addTag(UID_TAG, id);

    if (OneSignal.Notifications.permissionNative === "granted") {
      // Zgoda juz jest — wystarczy wrocic do subskrypcji, prompt sie nie pokaze.
      await OneSignal.User.PushSubscription.optIn();
    } else {
      // Natywny prompt przegladarki. Da sie wywolac tylko z gestu uzytkownika.
      const before = OneSignal.Notifications.permissionNative;
      await OneSignal.Notifications.requestPermission();
      const after = OneSignal.Notifications.permissionNative;
      log(`Prosba o zgode: ${before} -> ${after}`);

      // Chrome potrafi stlumic prompt ("quieter messaging") — wtedy zamiast
      // okna pojawia sie tylko przekreslony dzwonek w pasku adresu, a stan
      // zgody nie zmienia sie wcale. Bez tego wpisu wyglada to jak martwy przycisk.
      if (before === "default" && after === "default") {
        log("Przegladarka nie pokazala okna i nie zmienila zgody — sprawdz ikone w pasku adresu.", "warn");
      }
    }
    refreshStatus(OneSignal);
  });

  $("btn-unsubscribe").addEventListener("click", async () => {
    await OneSignal.User.PushSubscription.optOut();
    refreshStatus(OneSignal);
  });

  $("btn-logout").addEventListener("click", async () => {
    await OneSignal.logout();
    rememberId("");
    log("ID odpiete — subskrypcja wrocila do anonimowej.", "warn");
    refreshStatus(OneSignal);
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

  $("group-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const group = $("group-name").value.trim();
    if (!group) return;
    await OneSignal.User.addTag(GROUP_TAG, group);
    log(`Przypisano do grupy: ${group}`, "ok");
    await refreshTags(OneSignal);
  });

  $("btn-leave-group").addEventListener("click", async () => {
    await OneSignal.User.removeTag(GROUP_TAG);
    $("group-name").value = "";
    log("Wyjscie z grupy.", "warn");
    await refreshTags(OneSignal);
  });

  $("btn-refresh-tags").addEventListener("click", () => refreshTags(OneSignal));

  // Subscription ID i OneSignal ID pojawiaja sie chwile po inicie.
  setTimeout(() => refreshStatus(OneSignal), 2000);
});

// --- rzeczy niezalezne od SDK ----------------------------------------------

$("external-id").addEventListener("input", () => syncSignupButton());
$("group-name").addEventListener("input", () => syncGroupButton());

document.querySelectorAll("[data-copy]").forEach((btn) => {
  btn.addEventListener("click", async () => {
    const source = $(btn.dataset.copy);
    const text = source.textContent.trim();
    if (!text || text === "—" || source.dataset.ready === "false") {
      return toast("Nie ma czego kopiowac");
    }
    try {
      await navigator.clipboard.writeText(text);
      toast("Skopiowane");
    } catch {
      toast("Kopiowanie zablokowane przez przegladarke");
    }
  });
});

$("btn-clear-log").addEventListener("click", () => { $("log").innerHTML = ""; });
