/**
 * Kısayol — Vercel Functions için ortak yardımcılar.
 *
 * Depo: Upstash Redis (REST API). Paket kurulmuyor, sadece fetch kullanılıyor.
 * Anahtarlar ortam değişkeninden okunur, kodda gömülü değildir.
 *
 * Dosya adı alt çizgiyle başladığı için Vercel bunu bir uç nokta olarak
 * yayınlamaz; yalnızca diğer dosyalar içe aktarır.
 */

/* Ortam değişkenleri modül yüklenirken değil, her çağrıda okunur;
   böylece yükleme sırasına bağlı sürprizler olmaz. */
function depoAyarlari() {
  return {
    url: process.env.UPSTASH_REDIS_REST_URL,
    jeton: process.env.UPSTASH_REDIS_REST_TOKEN,
  };
}

/* Karışabilen harfler (l, o, 1, 0) alfabede yok. */
const ALFABE = "abcdefghijkmnpqrstuvwxyz23456789";
const KOD_UZUNLUK = 6;
const AZAMI_URL = 2048;
const GUN_SAKLAMA = 40 * 24 * 60 * 60;   // günlük sayaçlar 40 gün sonra silinir
const SAATLIK_SINIR = 30;                // aynı IP saatte en fazla bu kadar link

const AYRILMIS = new Set(["api", "public", "static", "assets", "robots", "sitemap", "favicon"]);

export function depoBagliMi() {
  const a = depoAyarlari();
  return Boolean(a.url && a.jeton);
}

/**
 * Upstash REST üzerinde bir dizi komutu tek istekte çalıştırır.
 * @param {Array<Array<string|number>>} komutlar
 * @returns {Promise<Array<any>>} her komutun sonucu, sırayla
 */
export async function depo(komutlar) {
  const ayar = depoAyarlari();
  const cevap = await fetch(ayar.url + "/pipeline", {
    method: "POST",
    headers: {
      authorization: "Bearer " + ayar.jeton,
      "content-type": "application/json",
    },
    body: JSON.stringify(komutlar),
  });

  if (!cevap.ok) {
    throw new Error("depo-hatasi-" + cevap.status);
  }
  const veri = await cevap.json();
  return veri.map((satir) => satir.result);
}

/* ---------------------------------------------------------------- */

export function rastgele(uzunluk = KOD_UZUNLUK) {
  const d = new Uint8Array(uzunluk);
  crypto.getRandomValues(d);
  let s = "";
  for (let i = 0; i < uzunluk; i++) s += ALFABE[d[i] % ALFABE.length];
  return s;
}

export function jetonUret() {
  const d = new Uint8Array(24);
  crypto.getRandomValues(d);
  return Array.from(d, (b) => b.toString(16).padStart(2, "0")).join("");
}

/* Uzunluk sızdırmayan sabit süreli karşılaştırma. */
export function esitMi(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
  let fark = 0;
  for (let i = 0; i < a.length; i++) fark |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return fark === 0;
}

export function kodGecerliMi(kod) {
  return typeof kod === "string" &&
    new RegExp("^[a-z0-9]{" + KOD_UZUNLUK + "}$").test(kod) &&
    !AYRILMIS.has(kod);
}

export function bugunAnahtari(d = new Date()) {
  return d.toISOString().slice(0, 10);
}

/* ---------------------------------------------------------------- */

export function json(res, veri, durum = 200) {
  res.status(durum);
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.setHeader("cache-control", "no-store");
  res.send(JSON.stringify(veri));
}

export function hata(res, mesaj, durum = 400) {
  json(res, { hata: mesaj }, durum);
}

/** Depo bağlı değilse ne olduğunu açıkça söyle, sessizce çökme. */
export function depoYokHatasi(res) {
  hata(
    res,
    "Depo bağlı değil: UPSTASH_REDIS_REST_URL ve UPSTASH_REDIS_REST_TOKEN " +
      "ortam değişkenleri tanımlı değil. Kurulum için depodaki README dosyasına bak.",
    503
  );
}

/** İsteğin geldiği adresi (protokol + host) döndürür. */
export function kendiAdresi(req) {
  const host = req.headers["x-forwarded-host"] || req.headers.host || "localhost";
  const protokol = req.headers["x-forwarded-proto"] || "https";
  return protokol + "://" + host;
}

export function istekIp(req) {
  const ham = req.headers["x-forwarded-for"];
  if (!ham) return null;
  return String(ham).split(",")[0].trim() || null;
}

/* ---------------------------------------------------------------- */
/* Girdi doğrulama                                                    */
/* ---------------------------------------------------------------- */

export function adresiCozumle(ham, kendiHost) {
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
  if (u.hostname.toLowerCase() === String(kendiHost).toLowerCase()) {
    return { hata: "Kendi kısa bağlantımızı tekrar kısaltamayız." };
  }
  if (!u.hostname.includes(".")) {
    return { hata: "Geçerli bir alan adı yazman gerekiyor." };
  }
  return { url: u.toString() };
}

/* ---------------------------------------------------------------- */
/* Google Safe Browsing — anahtar yoksa kontrol atlanır               */
/* ---------------------------------------------------------------- */

export async function zararliMi(adres) {
  const anahtar = process.env.SAFE_BROWSING_API_KEY;
  if (!anahtar) return { zararli: false, atlandi: true };

  const govde = {
    client: { clientId: "kisayol", clientVersion: "1.0.0" },
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
/* Hedef sayfanın başlığı — dış API yok, sayfayı kendimiz okuyoruz    */
/* ---------------------------------------------------------------- */

export async function basligiOku(adres) {
  try {
    const cevap = await fetch(adres, {
      headers: { "user-agent": "KisayolBot/1.0 (+kisa baglanti onizlemesi)" },
      redirect: "follow",
      signal: AbortSignal.timeout(2500),
    });
    const tur = cevap.headers.get("content-type") || "";
    if (!cevap.ok || !tur.includes("text/html")) return null;

    const metin = (await cevap.text()).slice(0, 200000);
    const og = metin.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i);
    const baslik = og ? og[1] : (metin.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1];
    if (!baslik) return null;
    return baslik.replace(/\s+/g, " ").trim().slice(0, 200) || null;
  } catch {
    return null;
  }
}

export { ALFABE, KOD_UZUNLUK, GUN_SAKLAMA, SAATLIK_SINIR };
