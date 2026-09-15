// ---------------------------------------------------------------------------
// POST /api/send  { "userId": "user_1234", "title": "...", "message": "..." }
//
// Wysyla powiadomienie na wszystkie urzadzenia jednego uzytkownika. Zadanie
// idzie wprost pod endpoint, ktory dala przegladarka, podpisane kluczem VAPID —
// zadnej uslugi posredniczacej.
// ---------------------------------------------------------------------------

const webpush = require("web-push");
const { readBody, validUserId, checkAdmin, methodGuard } = require("./_http");
const { subscriptionsFor, deleteSubscription } = require("./_db");

function configureVapid() {
  const publicKey = (process.env.VAPID_PUBLIC_KEY || "").trim();
  const privateKey = (process.env.VAPID_PRIVATE_KEY || "").trim();
  const subject = (process.env.VAPID_SUBJECT || "").trim() || "mailto:admin@example.com";
  if (!publicKey || !privateKey) {
    throw new Error("Brak VAPID_PUBLIC_KEY lub VAPID_PRIVATE_KEY w zmiennych srodowiskowych.");
  }
  webpush.setVapidDetails(subject, publicKey, privateKey);
}

module.exports = async (req, res) => {
  if (!methodGuard(req, res, "POST")) return;

  const auth = checkAdmin(req);
  if (!auth.ok) return res.status(auth.status).json({ error: auth.error });

  const body = readBody(req);
  const userId = (body.userId || "").trim();
  const title = (body.title || "").trim() || "Powiadomienie";
  const message = (body.message || "").trim();

  if (!validUserId(userId)) {
    return res.status(400).json({ error: "userId musi miec 1-64 znakow: litery, cyfry oraz _ . @ : -" });
  }
  if (!message) return res.status(400).json({ error: "Tresc powiadomienia nie moze byc pusta." });
  if (message.length > 512 || title.length > 128) {
    return res.status(400).json({ error: "Tytul do 128 znakow, tresc do 512." });
  }

  try {
    configureVapid();
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }

  let subs;
  try {
    subs = await subscriptionsFor(userId);
  } catch (err) {
    return res.status(500).json({ error: `Nie udalo sie odczytac subskrypcji: ${err.message}` });
  }

  if (subs.length === 0) {
    return res.status(404).json({ error: `Uzytkownik "${userId}" nie ma zadnej zapisanej subskrypcji.` });
  }

  const payload = JSON.stringify({ title, body: message, sentAt: Date.now() });
  let delivered = 0;
  let removed = 0;
  const failures = [];

  // Kazde urzadzenie dostaje osobne zadanie; jedno wygasle nie moze przerwac
  // wysylki na pozostale.
  await Promise.all(
    subs.map(async (row) => {
      const subscription = {
        endpoint: row.endpoint,
        keys: { p256dh: row.p256dh, auth: row.auth },
      };
      try {
        await webpush.sendNotification(subscription, payload, { TTL: 60 * 60 });
        delivered += 1;
      } catch (err) {
        // 404/410 to jedyny sygnal, ze uzytkownik odsubskrybowal albo wyczyscil
        // dane przegladarki. Bez sprzatania baza zapelnia sie martwymi wpisami.
        if (err.statusCode === 404 || err.statusCode === 410) {
          await deleteSubscription(row.endpoint).catch(() => {});
          removed += 1;
        } else {
          failures.push(`HTTP ${err.statusCode || "?"}: ${err.body || err.message}`);
        }
      }
    }),
  );

  return res.status(200).json({
    status: delivered > 0 ? "sent" : "failed",
    delivered,
    removedExpired: removed,
    failures,
  });
};
