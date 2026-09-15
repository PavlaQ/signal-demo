// ---------------------------------------------------------------------------
// POST /api/unsubscribe  { "endpoint": "https://..." }
//
// Usuwa subskrypcje, gdy uzytkownik sam sie wypisze. Wygasle subskrypcje
// kasuje osobno wysylka, po odpowiedzi 404/410 z serwera push.
// ---------------------------------------------------------------------------

const { readBody, methodGuard } = require("./_http");
const { deleteSubscription } = require("./_db");

module.exports = async (req, res) => {
  if (!methodGuard(req, res, "POST")) return;

  const endpoint = (readBody(req).endpoint || "").trim();
  if (!endpoint) return res.status(400).json({ error: "Brak endpointu." });

  try {
    const removed = await deleteSubscription(endpoint);
    return res.status(200).json({ removed });
  } catch (err) {
    return res.status(500).json({ error: `Usuniecie nieudane: ${err.message}` });
  }
};
