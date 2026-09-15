// ---------------------------------------------------------------------------
// Panel wysylki. Lista zapisanych uzytkownikow + osobne powiadomienie do kazdego.
//
// Dane pochodza z wlasnej bazy, a wysylka idzie wprost pod endpoint przegladarki,
// podpisana kluczem VAPID. Formularz "wyslij na wpisane ID" dziala niezaleznie
// od listy, zeby awaria odczytu nie unieruchomila calego panelu.
// ---------------------------------------------------------------------------

const $ = (id) => document.getElementById(id);
const TOKEN_KEY = "demo_admin_token";

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

function adminToken() {
  try { return sessionStorage.getItem(TOKEN_KEY) || ""; } catch { return ""; }
}
function storeToken(value) {
  try { value ? sessionStorage.setItem(TOKEN_KEY, value) : sessionStorage.removeItem(TOKEN_KEY); } catch {}
}

// Token trafia do naglowka tylko jesli zostal podany — panel bez ADMIN_TOKEN
// dziala bez niego i sam o tym ostrzega.
function headers() {
  const token = adminToken();
  return token
    ? { "Content-Type": "application/json", "X-Admin-Token": token }
    : { "Content-Type": "application/json" };
}

function relativeTime(timestamp) {
  if (!timestamp) return "—";
  // Postgres oddaje znacznik czasu jako ISO string, nie liczbe sekund.
  const then = new Date(timestamp).getTime();
  if (Number.isNaN(then)) return "—";
  const minutes = Math.round((Date.now() - then) / 60000);
  if (minutes < 1) return "przed chwila";
  if (minutes < 60) return `${minutes} min temu`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} godz. temu`;
  return `${Math.round(hours / 24)} dni temu`;
}

// --- wysylka ---------------------------------------------------------------

async function sendTo(userId, title, message, button) {
  const label = button.textContent;
  button.disabled = true;
  button.textContent = "Wysylam…";

  try {
    const res = await fetch("/api/send", {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({ userId, title, message }),
    });
    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      log(`${userId}: ${data.error || `HTTP ${res.status}`}`, "bad");
      toast("Nie wyslano");
      return false;
    }

    // Wygasle subskrypcje sa kasowane po drodze, wiec warto o nich powiedziec —
    // inaczej znikajace urzadzenia wygladalyby na blad.
    const expired = data.removedExpired ? `, usunieto wygaslych: ${data.removedExpired}` : "";
    if (data.delivered === 0) {
      log(`${userId}: nic nie doszlo${expired}. ${data.failures.join("; ")}`, "bad");
      toast("Nie wyslano");
      return false;
    }

    log(`${userId}: dostarczone na ${data.delivered} urzadzen${expired}`, "ok");
    if (data.failures.length) log(`${userId}: bledy — ${data.failures.join("; ")}`, "warn");
    toast("Wyslane");
    return true;
  } catch (err) {
    log(`${userId}: blad sieci — ${err.message}`, "bad");
    return false;
  } finally {
    button.disabled = false;
    button.textContent = label;
  }
}

// --- lista uzytkownikow ----------------------------------------------------

function renderUsers(users) {
  const box = $("users");
  box.innerHTML = "";

  if (users.length === 0) {
    box.innerHTML = '<p class="hint">Nikt nie jest jeszcze zapisany. Otworz demo i zapisz sie z wlasnym ID.</p>';
    return;
  }

  for (const user of users) {
    const row = document.createElement("div");
    row.className = "user-row";

    const head = document.createElement("div");
    head.className = "user-head";
    const name = document.createElement("code");
    name.textContent = user.userId;
    const meta = document.createElement("span");
    meta.className = "user-meta";
    const devices = user.devices === 1 ? "1 urzadzenie" : `${user.devices} urzadzenia`;
    meta.textContent = `${devices} · ${relativeTime(user.lastSeen)}`;
    head.append(name, meta);

    const form = document.createElement("form");
    form.className = "inline-form";
    form.innerHTML = `
      <input type="text" class="u-title" placeholder="tytul (opcjonalnie)" autocomplete="off" />
      <input type="text" class="u-message" placeholder="tresc powiadomienia" autocomplete="off" required />
      <button class="btn btn-primary" type="submit">Wyslij</button>`;

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const message = form.querySelector(".u-message").value.trim();
      if (!message) return;
      const ok = await sendTo(
        user.userId,
        form.querySelector(".u-title").value.trim(),
        message,
        form.querySelector("button"),
      );
      if (ok) form.querySelector(".u-message").value = "";
    });

    row.append(head, form);
    box.appendChild(row);
  }
}

async function loadUsers() {
  const box = $("users");
  box.innerHTML = '<p class="hint">Ladowanie…</p>';

  let res;
  try {
    res = await fetch("/api/users", { headers: headers() });
  } catch (err) {
    box.innerHTML = '<p class="hint">Backend nieosiagalny. Uzyj formularza ponizej.</p>';
    log(`Lista niedostepna: ${err.message}`, "warn");
    return;
  }

  if (res.status === 401) {
    $("token-card").hidden = false;
    box.innerHTML = '<p class="hint">Podaj token administratora, zeby zobaczyc liste.</p>';
    return;
  }

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    // Lista bywa niedostepna (plan, brak endpointu), ale wysylka na wpisane ID
    // dziala nadal — panel ma wtedy zostac uzyteczny, nie pusty.
    box.innerHTML = '<p class="hint">Lista niedostepna — uzyj formularza "Wyslij na wpisane ID" ponizej.</p>';
    log(`Lista niedostepna: ${data.error || `HTTP ${res.status}`}`, "warn");
    $("user-count").textContent = "";
    return;
  }

  $("token-card").hidden = true;
  $("warn-open").hidden = data.unprotected !== true;
  $("user-count").textContent = `${data.users.length} zapisanych · ${data.totalDevices} urzadzen`;
  renderUsers(data.users);
}

// --- start -----------------------------------------------------------------

$("token-form").addEventListener("submit", (e) => {
  e.preventDefault();
  storeToken($("admin-token").value.trim());
  $("admin-token").value = "";
  loadUsers();
});

$("manual-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const id = $("manual-id").value.trim();
  const message = $("manual-message").value.trim();
  if (!id || !message) return;
  const ok = await sendTo(id, $("manual-title").value.trim(), message, e.submitter);
  if (ok) $("manual-message").value = "";
});

$("btn-refresh").addEventListener("click", loadUsers);
$("btn-clear-log").addEventListener("click", () => { $("log").innerHTML = ""; });

loadUsers();
