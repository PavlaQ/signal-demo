// ---------------------------------------------------------------------------
// POST /api/send  { "externalId": "user_1234", "title": "...", "message": "..." }
//
// Wysyla powiadomienie do jednego uzytkownika po External ID. Nie wymaga
// segmentow ani platnego planu — to podstawowe API wysylkowe OneSignala.
// ---------------------------------------------------------------------------

const { callOneSignal, checkAdminToken, readBody } = require("./_onesignal");

const ID_PATTERN = /^[A-Za-z0-9_.@:-]{1,64}$/;

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Uzyj POST." });
  }

  const auth = checkAdminToken(req);
  if (!auth.ok) return res.status(auth.status).json({ error: auth.error });

  const body = readBody(req);
  const externalId = (body.externalId || "").trim();
  const title = (body.title || "").trim() || "Powiadomienie";
  const message = (body.message || "").trim();

  if (!ID_PATTERN.test(externalId)) {
    return res.status(400).json({ error: "externalId musi miec 1-64 znakow: litery, cyfry oraz _ . @ : -" });
  }
  if (!message) {
    return res.status(400).json({ error: "Tresc powiadomienia nie moze byc pusta." });
  }
  if (message.length > 512 || title.length > 128) {
    return res.status(400).json({ error: "Tytul do 128 znakow, tresc do 512." });
  }

  const result = await callOneSignal("https://api.onesignal.com/notifications", {
    method: "POST",
    body: JSON.stringify({
      app_id: (process.env.ONESIGNAL_APP_ID || "").trim(),
      target_channel: "push",
      include_aliases: { external_id: [externalId] },
      headings: { en: title },
      contents: { en: message },
    }),
  });

  if (result.error) {
    return res.status(result.status).json({ error: result.error, reason: result.reason });
  }

  // OneSignal odpowiada 200 takze wtedy, gdy nikogo nie da sie powiadomic —
  // puste "id" jest jedynym sygnalem, ze nic nie poszlo.
  const { id, errors, recipients } = result.payload;
  if (!id) {
    return res.status(200).json({
      status: "nobody",
      error: `Nikt nie odebral powiadomienia. OneSignal: ${JSON.stringify(errors || "brak odbiorcow")}`,
    });
  }

  return res.status(200).json({ status: "sent", notificationId: id, recipients: recipients ?? null });
};
