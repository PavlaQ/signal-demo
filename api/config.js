// ---------------------------------------------------------------------------
// GET /api/config
//
// Oddaje przegladarce publiczny klucz VAPID. Trzymanie go tutaj zamiast
// w kodzie strony sprawia, ze rotacja kluczy nie wymaga zmiany frontendu.
// ---------------------------------------------------------------------------

const { methodGuard } = require("./_http");

module.exports = async (req, res) => {
  if (!methodGuard(req, res, "GET")) return;

  const publicKey = (process.env.VAPID_PUBLIC_KEY || "").trim();
  if (!publicKey) {
    return res.status(500).json({ error: "Brak VAPID_PUBLIC_KEY w zmiennych srodowiskowych." });
  }

  return res.status(200).json({ vapidPublicKey: publicKey });
};
