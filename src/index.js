/**
 * Tık — kısa bağlantı üretir ve tıklamaları sayar.
 *
 * Yollar:
 *   POST /api/kisalt            → yeni kısa bağlantı üretir
 *   GET  /api/istatistik?kod&t  → bir bağlantının tıklama istatistiği (JSON)
 *   GET  /<kod>                 → tıklamayı kaydeder, hedefe yönlendirir
 *   diğer                       → public/ altındaki statik dosyalar
 *
 * Anahtarlar ortam değişkeninden okunur, kodda gömülü değer yoktur.
 * Anahtar tanımlı değilse ilgili kontrol atlanır ve uygulama çalışmaya devam eder.
 */

/* Karışabilen harfler (l, o, 1, 0) alfabede yok. */
const ALFABE = "abcdefghijkmnpqrstuvwxyz23456789";
const KOD_UZUNLUK = 6;
const AZAMI_URL = 2048;

/* Kısa kod olarak kullanılamayacak yollar. */
const AYRILMIS = new Set(["api", "public", "static", "assets", "robots", "sitemap", "favicon"]);

function rastgele(uzunluk) {
  const d = new Uint8Array(uzunluk);
  crypto.getRandomValues(d);
  let s = "";
  for (let i = 0; i < uzunluk; i++) s += ALFABE[d[i] % ALFABE.length];
  return s;
}

/* İstatistik bağlantısının gizli anahtarı. */
function jetonUret() {
  const d = new Uint8Array(24);
  crypto.getRandomValues(d);
  return Array.from(d, (b) => b.toString(16).padStart(2, "0")).join("");
}

/* Uzunluk sızdırmayan sabit süreli karşılaştırma. */
function esitMi(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
  let fark = 0;
  for (let i = 0; i < a.length; i++) fark |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return fark === 0;
}

function json(veri, durum = 200) {
  return new Response(JSON.stringify(veri), {
    status: durum,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

function hata(mesaj, durum = 400) {
  return json({ hata: mesaj }, durum);
}

/* ---------------------------------------------------------------- */
/* Girdi doğrulama                                                    */
/* ---------------------------------------------------------------- */

function adresiCozumle(ham, kendiHost) {
  let metin = String(ham || "").trim();
  if (!metin) return { hata: "Bir adres yazman gerekiyor." };
  if (metin.length > AZAMI_URL) return { hata: "Bu adres fazla uzun." };
  if (!/^https?:\/\//i.test(metin)) metin = "https://" + metin;

  let u;
  try {
    u = new URL(metin);
  } catch {
    return { hata: "Bu adres okunamadı. Örnek: https://ornek.com/sayfa" };
  }

  if (u.protocol !== "http:" && u.protocol !== "https:") {
    return { hata: "Yalnızca http ve https adresleri kısaltılabilir." };
  }
  /* Kendi üzerimize yönlendirme döngüsü kurulmasın. */
  if (u.hostname.toLowerCase() === String(kendiHost).toLowerCase()) {
    return { hata: "Kendi kısa bağlantımızı tekrar kısaltamayız." };
  }
  /* Alan adı en az bir nokta içermeli — localhost, intranet adresleri elenir. */
  if (!u.hostname.includes(".")) {
    return { hata: "Geçerli bir alan adı yazman gerekiyor." };
  }
  return { url: u.toString() };
}

/* ---------------------------------------------------------------- */
/* Google Safe Browsing — zararlı bağlantı kontrolü                   */
/* Anahtar yoksa kontrol atlanır (uygulama çalışmaya devam eder).     */
/* ---------------------------------------------------------------- */

async function zararliMi(adres, anahtar) {
  if (!anahtar) return { zararli: false, atlandi: true };

  const govde = {
    client: { clientId: "tik", clientVersion: "1.0.0" },
    threatInfo: {
      threatTypes: ["MALWARE", "SOCIAL_ENGINEERING", "UNWANTED_SOFTWARE"],
      platformTypes: ["ANY_PLATFORM"],
      threatEntryTypes: ["URL"],
      threatEntries: [{ url: adres }],
    },
  };

  try {
    const cevap = await fetch(
      "https://safebrowsing.googleapis.com/v4/threatMatches:find?key=" + encodeURIComponent(anahtar),
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(govde),
        signal: AbortSignal.timeout(4000),
      }
    );
    if (!cevap.ok) return { zararli: false, atlandi: true };
    const sonuc = await cevap.json();
    return { zararli: Array.isArray(sonuc.matches) && sonuc.matches.length > 0 };
  } catch {
    /* Servise ulaşılamazsa bağlantıyı reddetmiyoruz, kontrolü atlıyoruz. */
    return { zararli: false, atlandi: true };
  }
}

/* ---------------------------------------------------------------- */
/* Cloudflare Turnstile — bot koruması                                */
/* Gizli anahtar yoksa kontrol atlanır.                               */
/* ---------------------------------------------------------------- */

async function turnstileGecerliMi(jeton, gizli, ip) {
  if (!gizli) return true;
  if (!jeton) return false;
  try {
    const form = new FormData();
    form.append("secret", gizli);
    form.append("response", jeton);
    if (ip) form.append("remoteip", ip);
    const cevap = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      body: form,
      signal: AbortSignal.timeout(4000),
    });
    const sonuc = await cevap.json();
    return sonuc.success === true;
  } catch {
    return false;
  }
}

/* ---------------------------------------------------------------- */
/* Hedef sayfanın başlığı — dış API yok, sayfayı kendimiz okuyoruz.   */
/* ---------------------------------------------------------------- */

async function basligiOku(adres) {
  try {
    const cevap = await fetch(adres, {
      headers: { "user-agent": "TikBot/1.0 (+kisa baglanti onizlemesi)" },
      redirect: "follow",
      signal: AbortSignal.timeout(5000),
    });
    const tur = cevap.headers.get("content-type") || "";
    if (!cevap.ok || !tur.includes("text/html")) return null;

    /* Sayfanın tamamını okumuyoruz; başlık zaten baştadır. */
    const metin = (await cevap.text()).slice(0, 200000);
    const og = metin.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i);
    const baslik = og ? og[1] : (metin.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1];
    if (!baslik) return null;
    return baslik.replace(/\s+/g, " ").trim().slice(0, 200) || null;
  } catch {
    return null;
  }
}

/* ---------------------------------------------------------------- */
/* POST /api/kisalt                                                   */
/* ---------------------------------------------------------------- */

async function kisalt(request, env, ctx, kendiUrl) {
  let govde;
  try {
    govde = await request.json();
  } catch {
    return hata("İstek okunamadı.");
  }

  const ip = request.headers.get("CF-Connecting-IP");
  if (!(await turnstileGecerliMi(govde.turnstile, env.TURNSTILE_SECRET_KEY, ip))) {
    return hata("Bot koruması doğrulanamadı. Sayfayı yenileyip tekrar dene.", 403);
  }

  const cozum = adresiCozumle(govde.url, kendiUrl.hostname);
  if (cozum.hata) return hata(cozum.hata);

  const kontrol = await zararliMi(cozum.url, env.SAFE_BROWSING_API_KEY);
  if (kontrol.zararli) {
    return hata("Bu adres Google'ın zararlı bağlantı listesinde görünüyor, kısaltılmadı.", 422);
  }

  const jeton = jetonUret();
  const simdi = Math.floor(Date.now() / 1000);

  /* Kod çakışırsa birkaç kez yeniden dene. */
  let kod = null;
  for (let deneme = 0; deneme < 6; deneme++) {
    const aday = rastgele(KOD_UZUNLUK);
    if (AYRILMIS.has(aday)) continue;
    try {
      await env.DB.prepare(
        "INSERT INTO links (code, target_url, title, owner_token, created_at) VALUES (?, ?, NULL, ?, ?)"
      )
        .bind(aday, cozum.url, jeton, simdi)
        .run();
      kod = aday;
      break;
    } catch (e) {
      /* PRIMARY KEY çakışması — yeni kod dene. */
      if (!String(e && e.message).includes("UNIQUE")) throw e;
    }
  }
  if (!kod) return hata("Kod üretilemedi, tekrar dener misin?", 503);

  /* Başlık okuma cevabı bekletmesin. */
  ctx.waitUntil(
    basligiOku(cozum.url).then((baslik) =>
      baslik
        ? env.DB.prepare("UPDATE links SET title = ? WHERE code = ?").bind(baslik, kod).run()
        : null
    )
  );

  return json({
    kod,
    kisa: kendiUrl.origin + "/" + kod,
    hedef: cozum.url,
    istatistik: kendiUrl.origin + "/istatistik.html?kod=" + kod + "&t=" + jeton,
    zararliKontrolu: kontrol.atlandi ? "atlandi" : "yapildi",
  });
}

/* ---------------------------------------------------------------- */
/* GET /<kod> — tıklamayı kaydet, yönlendir                           */
/* ---------------------------------------------------------------- */

async function yonlendir(kod, request, env, ctx) {
  const kayit = await env.DB.prepare("SELECT target_url FROM links WHERE code = ?")
    .bind(kod)
    .first();

  if (!kayit) {
    return new Response("Böyle bir kısa bağlantı yok.", {
      status: 404,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  }

  /* IP adresi saklanmıyor; yalnızca ülke kodu tutuluyor. */
  const ulke = request.headers.get("CF-IPCountry") || null;
  let yonlendiren = null;
  const ref = request.headers.get("Referer");
  if (ref) {
    try {
      yonlendiren = new URL(ref).hostname || null;
    } catch {
      yonlendiren = null;
    }
  }

  ctx.waitUntil(
    env.DB.prepare("INSERT INTO clicks (code, clicked_at, country, referrer) VALUES (?, ?, ?, ?)")
      .bind(kod, Math.floor(Date.now() / 1000), ulke, yonlendiren)
      .run()
  );

  return new Response(null, {
    status: 302,
    headers: { location: kayit.target_url, "cache-control": "no-store", "referrer-policy": "no-referrer" },
  });
}

/* ---------------------------------------------------------------- */
/* GET /api/istatistik?kod=..&t=..                                    */
/* ---------------------------------------------------------------- */

async function istatistik(env, url) {
  const kod = url.searchParams.get("kod") || "";
  const jeton = url.searchParams.get("t") || "";

  const kayit = await env.DB.prepare(
    "SELECT code, target_url, title, owner_token, created_at FROM links WHERE code = ?"
  )
    .bind(kod)
    .first();

  /* Kayıt yoksa da anahtar yanlışsa da aynı cevabı veriyoruz:
     hangi kodların var olduğu dışarıdan anlaşılmasın. */
  if (!kayit || !esitMi(jeton, kayit.owner_token)) {
    return hata("Bu istatistik bağlantısı geçersiz.", 404);
  }

  const otuzGunOnce = Math.floor(Date.now() / 1000) - 30 * 86400;

  const [toplam, gunluk, ulkeler, yonlendirenler] = await env.DB.batch([
    env.DB.prepare("SELECT COUNT(*) AS n FROM clicks WHERE code = ?").bind(kod),
    env.DB.prepare(
      `SELECT strftime('%Y-%m-%d', clicked_at, 'unixepoch') AS gun, COUNT(*) AS n
         FROM clicks WHERE code = ? AND clicked_at >= ?
        GROUP BY gun ORDER BY gun`
    ).bind(kod, otuzGunOnce),
    env.DB.prepare(
      `SELECT COALESCE(country, '') AS ad, COUNT(*) AS n
         FROM clicks WHERE code = ?
        GROUP BY ad ORDER BY n DESC LIMIT 10`
    ).bind(kod),
    env.DB.prepare(
      `SELECT COALESCE(referrer, '') AS ad, COUNT(*) AS n
         FROM clicks WHERE code = ?
        GROUP BY ad ORDER BY n DESC LIMIT 10`
    ).bind(kod),
  ]);

  return json({
    kod: kayit.code,
    hedef: kayit.target_url,
    baslik: kayit.title,
    olusturma: kayit.created_at,
    toplam: toplam.results[0] ? toplam.results[0].n : 0,
    gunluk: gunluk.results,
    ulkeler: ulkeler.results,
    yonlendirenler: yonlendirenler.results,
  });
}

/* ---------------------------------------------------------------- */

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const yol = url.pathname;

    if (yol === "/api/kisalt") {
      if (request.method !== "POST") return hata("Yalnızca POST.", 405);
      return kisalt(request, env, ctx, url);
    }

    if (yol === "/api/istatistik") {
      if (request.method !== "GET") return hata("Yalnızca GET.", 405);
      return istatistik(env, url);
    }

    /* Kısa kod: kökte, tam olarak 6 karakter. */
    const eslesme = yol.match(/^\/([a-z0-9]{6})$/);
    if (eslesme && request.method === "GET" && !AYRILMIS.has(eslesme[1])) {
      return yonlendir(eslesme[1], request, env, ctx);
    }

    /* Geri kalan her şey public/ altındaki dosyalar. */
    return env.ASSETS.fetch(request);
  },
};
