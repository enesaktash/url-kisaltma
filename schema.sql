-- Kısayol — veritabanı şeması (Cloudflare D1 / SQLite)
-- Kurulum:  wrangler d1 execute tik --remote --file=./schema.sql

-- Kısa bağlantılar
CREATE TABLE IF NOT EXISTS links (
  code        TEXT PRIMARY KEY,        -- kısa kod, örn. a7f3k2
  target_url  TEXT NOT NULL,           -- hedef adres
  title       TEXT,                    -- hedef sayfanın <title> etiketi, okunabildiyse
  owner_token TEXT NOT NULL,           -- istatistiği kimin görebileceğini belirleyen gizli anahtar
  created_at  INTEGER NOT NULL         -- unix zaman damgası (saniye)
);

-- Tıklama olayları. IP adresi SAKLANMAZ; yalnızca ülke kodu tutulur.
CREATE TABLE IF NOT EXISTS clicks (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  code       TEXT NOT NULL,
  clicked_at INTEGER NOT NULL,         -- unix zaman damgası (saniye)
  country    TEXT,                     -- CF-IPCountry başlığından, yoksa NULL
  referrer   TEXT                      -- yönlendiren sitenin alan adı, yoksa NULL
);

CREATE INDEX IF NOT EXISTS idx_clicks_code      ON clicks(code, clicked_at);
CREATE INDEX IF NOT EXISTS idx_links_created_at ON links(created_at);
