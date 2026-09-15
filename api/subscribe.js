// ---------------------------------------------------------------------------
// POST /api/subscribe
// { "userId": "user_1234", "subscription": { endpoint, keys: { p256dh, auth } } }
//
// Zapisuje subskrypcje push przegladarki i wiaze ja z ID uzytkownika.
// Endpoint jest publiczny — zapisuje sie kazdy odwiedzajacy, tak jak
// w kazdym serwisie z powiadomieniami.
// ---------------------------------------------------------------------------

const { readBody, validUserId, methodGuard } = require("./_http");
const { saveSubscription } = require("./_db");

module.exports = async (req, res) => {
  if (!methodGuard(req, res, "POST")) return;

  const body = readBody(req);
  const userId = (body.userId || "").trim();
  const sub = body.subscription || {};
  const keys = sub.keys || {};

  if (!validUserId(userId)) {
    return res.status(400).json({ error: "userId musi miec 1-64 znakow: litery, cyfry oraz _ . @ : -" });
  }
  if (typeof sub.endpoint !== "string" || !sub.endpoint.startsWith("https://")) {
    return res.status(400).json({ error: "Brak poprawnego endpointu subskrypcji." });
  }
  if (!keys.p256dh || !keys.auth) {
    return res.status(400).json({ error: "Subskrypcja bez kluczy p256dh/auth — przegladarka nie zwrocila pelnych danych." });
  }

  try {
    const row = await saveSubscription({
      userId,
      endpoint: sub.endpoint,
      p256dh: keys.p256dh,
      auth: keys.auth,
      userAgent: (req.headers["user-agent"] || "").slice(0, 300),
    });
    return res.status(200).json({ status: row.inserted ? "created" : "updated" });
  } catch (err) {
    return res.status(500).json({ error: `Zapis nieudany: ${err.message}` });
  }
};
