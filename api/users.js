// ---------------------------------------------------------------------------
// GET /api/users
//
// Zwraca liste zapisanych uzytkownikow (unikalne External ID) wraz z liczba
// urzadzen i czasem ostatniej aktywnosci.
//
// Korzysta z legacy endpointu /api/v1/players, bo jako jedyny listuje wszystkie
// subskrypcje naraz. Nowe API pozwala pobrac uzytkownika wylacznie po znanym
// juz aliasie, co do wypisania listy sie nie nadaje.
// ---------------------------------------------------------------------------

const { callOneSignal, checkAdminToken } = require("./_onesignal");

module.exports = async (req, res) => {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Uzyj GET." });
  }

  const auth = checkAdminToken(req);
  if (!auth.ok) return res.status(auth.status).json({ error: auth.error });

  const appId = (process.env.ONESIGNAL_APP_ID || "").trim();
  const result = await callOneSignal(
    `https://onesignal.com/api/v1/players?app_id=${appId}&limit=300`,
    { method: "GET", preferBasic: true },
  );

  if (result.error) {
    return res.status(result.status).json({ error: result.error, reason: result.reason });
  }

  // Jeden uzytkownik moze miec wiele urzadzen — lista ma pokazywac osoby,
  // nie subskrypcje, wiec scalamy rekordy po External ID.
  const byUser = new Map();
  for (const player of result.payload.players || []) {
    const externalId = player.external_user_id;
    if (!externalId) continue; // anonimowi nie daja sie zaadresowac

    const existing = byUser.get(externalId);
    const lastActive = player.last_active || 0;
    if (existing) {
      existing.devices += 1;
      existing.lastActive = Math.max(existing.lastActive, lastActive);
      existing.subscribed = existing.subscribed || !player.invalid_identifier;
    } else {
      byUser.set(externalId, {
        externalId,
        devices: 1,
        lastActive,
        subscribed: !player.invalid_identifier,
        tags: player.tags || {},
      });
    }
  }

  const users = [...byUser.values()].sort((a, b) => b.lastActive - a.lastActive);

  // OneSignal potrafi zwrocic ujemny total_count dla aplikacji z uszkodzonymi
  // licznikami audiencji — wtedy liczba zbudowana z faktycznych rekordow jest
  // jedyna sensowna.
  const reported = result.payload.total_count;
  const totalSubscriptions = Number.isInteger(reported) && reported >= 0
    ? reported
    : (result.payload.players || []).length;

  return res.status(200).json({
    users,
    totalSubscriptions,
    reportedCount: reported,
    unprotected: auth.unprotected === true,
  });
};
