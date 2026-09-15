// ---------------------------------------------------------------------------
// POST /api/create-segment  { "externalId": "user_1234" }
//
// Zaklada w OneSignalu segment o nazwie rownej ID uzytkownika, zebys mogl
// wybrac konkretna osobe w kompozytorze w panelu. Kompozytor celuje wylacznie
// w segmenty, a segment to zapisany filtr — dlatego strona nadaje tag "uid",
// a ten endpoint tworzy filtr na tym tagu.
//
// Osobny endpoint jest konieczny, bo tworzenie segmentu wymaga REST API Key.
// W przegladarce kazdy moglby go odczytac i wysylac powiadomienia w Twoim imieniu.
//
// Wymagane zmienne srodowiskowe w Vercelu:
//   ONESIGNAL_REST_API_KEY  — Settings -> Keys & IDs -> REST API Key
//   ONESIGNAL_APP_ID        — Settings -> Keys & IDs -> App ID
// ---------------------------------------------------------------------------

const UID_TAG = "uid";

// Segment per uzytkownik zapycha panel, wiec przynajmniej pilnujemy, zeby
// trafialy tu sensowne identyfikatory, a nie dowolny tekst z internetu.
const ID_PATTERN = /^[A-Za-z0-9_.@:-]{1,64}$/;

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Uzyj POST." });
  }

  const restApiKey = process.env.ONESIGNAL_REST_API_KEY;
  const appId = process.env.ONESIGNAL_APP_ID;
  if (!restApiKey || !appId) {
    return res.status(500).json({
      error: "Brak ONESIGNAL_REST_API_KEY lub ONESIGNAL_APP_ID w zmiennych srodowiskowych.",
    });
  }

  // Vercel parsuje JSON sam, ale przy nietypowym Content-Type body bywa stringiem.
  let body = req.body;
  if (typeof body === "string") {
    try { body = JSON.parse(body); } catch { body = {}; }
  }

  const externalId = (body?.externalId || "").trim();
  if (!ID_PATTERN.test(externalId)) {
    return res.status(400).json({
      error: "externalId musi miec 1-64 znakow: litery, cyfry oraz _ . @ : -",
    });
  }

  let response;
  let payload;
  try {
    response = await fetch(`https://api.onesignal.com/apps/${appId}/segments`, {
      method: "POST",
      headers: {
        Authorization: `Key ${restApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: externalId,
        filters: [{ field: "tag", key: UID_TAG, relation: "=", value: externalId }],
      }),
    });
    payload = await response.json().catch(() => ({}));
  } catch (err) {
    return res.status(502).json({ error: `Nie udalo sie polaczyc z OneSignal: ${err.message}` });
  }

  if (response.ok) {
    return res.status(201).json({ status: "created", segmentId: payload.id, name: externalId });
  }

  // Powtorny zapis tego samego uzytkownika jest normalny — istniejacy segment
  // traktujemy jak sukces, zeby strona nie musiala tego rozrozniac.
  const message = JSON.stringify(payload.errors || payload);
  if (response.status === 409 || /already|taken|exist/i.test(message)) {
    return res.status(200).json({ status: "exists", name: externalId });
  }

  return res.status(response.status).json({
    error: `OneSignal odrzucil zadanie (HTTP ${response.status}): ${message}`,
  });
};
