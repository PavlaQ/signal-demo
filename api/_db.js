// ---------------------------------------------------------------------------
// Dostep do bazy. Neon przez HTTP, bo klasyczne polaczenie TCP nie przezywa
// zimnego startu funkcji serverless.
// ---------------------------------------------------------------------------

const { neon } = require("@neondatabase/serverless");

let sqlClient;
function sql() {
  if (!sqlClient) {
    const url = (process.env.DATABASE_URL || "").trim();
    if (!url) throw new Error("Brak DATABASE_URL — podepnij baze Neon w Vercelu.");
    sqlClient = neon(url);
  }
  return sqlClient;
}

// Tabela zaklada sie sama przy pierwszym uzyciu. Przy jednej tabeli nie warto
// wprowadzac osobnego kroku migracji.
let schemaReady;
async function ensureSchema() {
  if (!schemaReady) {
    const db = sql();
    schemaReady = (async () => {
      await db`
        CREATE TABLE IF NOT EXISTS subscriptions (
          id          BIGSERIAL PRIMARY KEY,
          user_id     TEXT        NOT NULL,
          endpoint    TEXT        NOT NULL UNIQUE,
          p256dh      TEXT        NOT NULL,
          auth        TEXT        NOT NULL,
          user_agent  TEXT,
          created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
          last_seen   TIMESTAMPTZ NOT NULL DEFAULT now()
        )`;
      await db`CREATE INDEX IF NOT EXISTS subscriptions_user_id_idx ON subscriptions (user_id)`;
    })().catch((err) => {
      schemaReady = undefined; // kolejne wywolanie sprobuje ponownie
      throw err;
    });
  }
  return schemaReady;
}

// endpoint jest unikalny, wiec ponowny zapis z tej samej przegladarki
// aktualizuje wpis zamiast tworzyc duplikat. To takze sciezka zmiany
// wlasciciela subskrypcji, gdy ktos zapisze sie pod innym ID.
async function saveSubscription({ userId, endpoint, p256dh, auth, userAgent }) {
  await ensureSchema();
  const rows = await sql()`
    INSERT INTO subscriptions (user_id, endpoint, p256dh, auth, user_agent)
    VALUES (${userId}, ${endpoint}, ${p256dh}, ${auth}, ${userAgent})
    ON CONFLICT (endpoint) DO UPDATE
      SET user_id = EXCLUDED.user_id,
          p256dh = EXCLUDED.p256dh,
          auth = EXCLUDED.auth,
          user_agent = EXCLUDED.user_agent,
          last_seen = now()
    RETURNING id, (xmax = 0) AS inserted`;
  return rows[0];
}

async function deleteSubscription(endpoint) {
  await ensureSchema();
  const rows = await sql()`DELETE FROM subscriptions WHERE endpoint = ${endpoint} RETURNING id`;
  return rows.length;
}

async function listUsers() {
  await ensureSchema();
  return sql()`
    SELECT user_id                        AS "userId",
           COUNT(*)::int                  AS devices,
           MAX(last_seen)                 AS "lastSeen",
           MIN(created_at)                AS "createdAt"
    FROM subscriptions
    GROUP BY user_id
    ORDER BY MAX(last_seen) DESC`;
}

async function subscriptionsFor(userId) {
  await ensureSchema();
  return sql()`
    SELECT endpoint, p256dh, auth
    FROM subscriptions
    WHERE user_id = ${userId}`;
}

module.exports = {
  saveSubscription,
  deleteSubscription,
  listUsers,
  subscriptionsFor,
};
