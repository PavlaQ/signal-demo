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

  // Wklejanie kluczy do panelu Vercela lubi zostawiac spacje i znak nowej linii,
  // a te trafiaja do naglowka i koncza sie odmowa 401.
  const restApiKey = (process.env.ONESIGNAL_REST_API_KEY || "").trim();
  const appId = (process.env.ONESIGNAL_APP_ID || "").trim();
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

  const segmentBody = JSON.stringify({
    name: externalId,
    filters: [{ field: "tag", key: UID_TAG, relation: "=", value: externalId }],
  });

  const send = (scheme) =>
    fetch(`https://api.onesignal.com/apps/${appId}/segments`, {
      method: "POST",
      headers: {
        Authorization: `${scheme} ${restApiKey}`,
        "Content-Type": "application/json",
      },
      body: segmentBody,
    });

  // Nowe aplikacje dostaja App API Key uzywany ze schematem "Key". Starsze
  // maja Legacy REST API Key, ktory dziala tylko z "Basic" — po 401 warto
  // sprobowac drugiego schematu, zanim uznamy klucz za nieprawidlowy.
  let response;
  let payload;
  let scheme = "Key";
  try {
    response = await send(scheme);
    if (response.status === 401) {
      scheme = "Basic";
      response = await send(scheme);
    }
    payload = await response.json().catch(() => ({}));
  } catch (err) {
    return res.status(502).json({ error: `Nie udalo sie polaczyc z OneSignal: ${err.message}` });
  }

  if (response.ok) {
    return res.status(201).json({ status: "created", segmentId: payload.id, name: externalId, scheme });
  }

  if (response.status === 401) {
    return res.status(401).json({
      error:
        "OneSignal odrzucil klucz w obu schematach (Key i Basic). Sprawdz, czy " +
        "ONESIGNAL_REST_API_KEY to App API Key tej aplikacji (nie Organization API Key) " +
        "i czy po zmianie zmiennych zrobiles redeploy.",
    });
  }

  // Powtorny zapis tego samego uzytkownika jest normalny — istniejacy segment
  // traktujemy jak sukces, zeby strona nie musiala tego rozrozniac.
  const message = JSON.stringify(payload.errors || payload);

  // Tworzenie segmentow przez API jest platne. Na darmowym planie ten endpoint
  // nie zadziala nigdy — to nie awaria, tylko ograniczenie konta.
  if (response.status === 403) {
    return res.status(403).json({
      error:
        "Tworzenie segmentow przez API nie jest dostepne na Twoim planie OneSignal. " +
        "Segmenty zakladaj recznie w panelu, albo wysylaj po External ID przez " +
        "include_aliases — to dziala na kazdym planie.",
      reason: "plan",
    });
  }
  if (response.status === 409 || /already|taken|exist/i.test(message)) {
    return res.status(200).json({ status: "exists", name: externalId, scheme });
  }

  return res.status(response.status).json({
    error: `OneSignal odrzucil zadanie (HTTP ${response.status}): ${message}`,
  });
};
