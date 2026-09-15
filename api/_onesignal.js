// ---------------------------------------------------------------------------
// Wspolna obsluga wywolan do OneSignala. Plik zaczyna sie od podkreslnika,
// wiec Vercel nie wystawia go jako endpointu.
// ---------------------------------------------------------------------------

// OneSignal wydaje dwa rodzaje kluczy aplikacji: nowszy App API Key uzywany
// ze schematem "Key" i starszy Legacy REST API Key dzialajacy z "Basic".
// Nie da sie ich rozroznic po wygladzie, wiec po odmowie 401 probujemy drugiego.
async function callOneSignal(url, options = {}) {
  const key = (process.env.ONESIGNAL_REST_API_KEY || "").trim();
  const appId = (process.env.ONESIGNAL_APP_ID || "").trim();
  if (!key || !appId) {
    return { error: "Brak ONESIGNAL_REST_API_KEY lub ONESIGNAL_APP_ID w zmiennych srodowiskowych.", status: 500 };
  }

  const attempt = (scheme) =>
    fetch(url.replace("{app_id}", appId), {
      ...options,
      headers: {
        Authorization: `${scheme} ${key}`,
        "Content-Type": "application/json",
        ...(options.headers || {}),
      },
    });

  let response;
  let scheme = options.preferBasic ? "Basic" : "Key";
  try {
    response = await attempt(scheme);
    if (response.status === 401) {
      scheme = scheme === "Key" ? "Basic" : "Key";
      response = await attempt(scheme);
    }
  } catch (err) {
    return { error: `Nie udalo sie polaczyc z OneSignal: ${err.message}`, status: 502 };
  }

  const payload = await response.json().catch(() => ({}));
  if (response.ok) return { payload, scheme };

  const detail = JSON.stringify(payload.errors || payload);
  if (response.status === 401) {
    return {
      status: 401,
      error:
        "OneSignal odrzucil klucz w obu schematach. Sprawdz, czy ONESIGNAL_REST_API_KEY " +
        "to App API Key tej aplikacji, i czy po zmianie zmiennych byl redeploy.",
    };
  }
  if (response.status === 403) {
    return {
      status: 403,
      reason: "plan",
      error: `To API nie jest dostepne na Twoim planie OneSignal. Odpowiedz: ${detail}`,
    };
  }
  return { status: response.status, error: `OneSignal odrzucil zadanie (HTTP ${response.status}): ${detail}` };
}

// Panel admina wysyla powiadomienia do wszystkich uzytkownikow, wiec powinien
// byc chroniony. Dopoki ADMIN_TOKEN nie jest ustawiony, endpointy sa otwarte —
// strona mowi o tym wprost, zeby nikt nie wdrozyl tego nieswiadomie.
function checkAdminToken(req) {
  const expected = (process.env.ADMIN_TOKEN || "").trim();
  if (!expected) return { ok: true, unprotected: true };

  const given = (req.headers["x-admin-token"] || "").trim();
  if (given !== expected) {
    return { ok: false, status: 401, error: "Nieprawidlowy token administratora." };
  }
  return { ok: true };
}

function readBody(req) {
  let body = req.body;
  if (typeof body === "string") {
    try { body = JSON.parse(body); } catch { body = {}; }
  }
  return body || {};
}

module.exports = { callOneSignal, checkAdminToken, readBody };
