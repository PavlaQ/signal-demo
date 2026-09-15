// ---------------------------------------------------------------------------
// Drobiazgi wspolne dla endpointow: odczyt ciala, walidacja ID, ochrona panelu.
// ---------------------------------------------------------------------------

const ID_PATTERN = /^[A-Za-z0-9_.@:-]{1,64}$/;

function readBody(req) {
  let body = req.body;
  if (typeof body === "string") {
    try { body = JSON.parse(body); } catch { body = {}; }
  }
  return body || {};
}

function validUserId(value) {
  return ID_PATTERN.test((value || "").trim());
}

// Panel wysylki siega do wszystkich subskrybentow, wiec powinien byc chroniony.
// Dopoki ADMIN_TOKEN nie jest ustawiony, dziala bez tokenu, a panel mowi o tym
// wprost — zeby nikt nie wystawil tego publicznie nieswiadomie.
function checkAdmin(req) {
  const expected = (process.env.ADMIN_TOKEN || "").trim();
  if (!expected) return { ok: true, unprotected: true };
  const given = (req.headers["x-admin-token"] || "").trim();
  if (given !== expected) return { ok: false, status: 401, error: "Nieprawidlowy token administratora." };
  return { ok: true };
}

function methodGuard(req, res, method) {
  if (req.method === method) return true;
  res.setHeader("Allow", method);
  res.status(405).json({ error: `Uzyj ${method}.` });
  return false;
}

module.exports = { readBody, validUserId, checkAdmin, methodGuard, ID_PATTERN };
