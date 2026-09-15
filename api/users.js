// ---------------------------------------------------------------------------
// GET /api/users
//
// Lista zapisanych uzytkownikow dla panelu wysylki. Jeden uzytkownik moze miec
// wiele urzadzen, wiec rekordy sa zgrupowane po user_id.
// ---------------------------------------------------------------------------

const { checkAdmin, methodGuard } = require("./_http");
const { listUsers } = require("./_db");

module.exports = async (req, res) => {
  if (!methodGuard(req, res, "GET")) return;

  const auth = checkAdmin(req);
  if (!auth.ok) return res.status(auth.status).json({ error: auth.error });

  try {
    const users = await listUsers();
    return res.status(200).json({
      users,
      totalDevices: users.reduce((sum, u) => sum + u.devices, 0),
      unprotected: auth.unprotected === true,
    });
  } catch (err) {
    return res.status(500).json({ error: `Nie udalo sie odczytac listy: ${err.message}` });
  }
};
