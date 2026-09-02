/**
 * GET /api/git?kod=abc123
 *
 * vercel.json içindeki rewrite sayesinde ziyaretçi bunu "/abc123" olarak görür.
 * Tıklamayı kaydeder ve hedefe 302 ile yönlendirir.
 *
 * Ziyaretçinin IP adresi SAKLANMAZ; yalnızca ülke kodu tutulur.
 */

import {
  depoBagliMi, depo, kodGecerliMi, bugunAnahtari, GUN_SAKLAMA,
} from "./_ortak.js";

function sayfa(res, durum, baslik, metin) {
  res.status(durum);
  res.setHeader("content-type", "text/html; charset=utf-8");
  res.setHeader("cache-control", "no-store");
  res.send(`<!doctype html>
<html lang="tr"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${baslik} — Tık</title>
<style>
  body{margin:0;min-height:100vh;display:grid;place-items:center;
    background:#08080b;color:#f4f1eb;
    font-family:"Segoe UI Variable Display","Segoe UI",system-ui,-apple-system,Arial,sans-serif;
    padding:1.5rem;text-align:center;line-height:1.6}
  h1{font-size:1.5rem;letter-spacing:-.03em;margin:0 0 .6rem}
  p{margin:0 0 1.5rem;color:#a8a299;max-width:38ch}
  a{color:#ff6b4a}
</style></head>
<body><main><h1>${baslik}</h1><p>${metin}</p>
<p><a href="/">Yeni bir bağlantı kısalt</a></p></main></body></html>`);
}

export default async function handler(req, res) {
  const kod = String(req.query.kod || "");

  if (!kodGecerliMi(kod)) {
    return sayfa(res, 404, "Böyle bir bağlantı yok", "Adresteki kod geçerli bir kısa bağlantı değil.");
  }
  if (!depoBagliMi()) {
    return sayfa(res, 503, "Servis bağlı değil",
      "Depo ortam değişkenleri tanımlı değil, bu yüzden yönlendirme yapılamıyor.");
  }

  try {
    const [ham] = await depo([["GET", "link:" + kod]]);
    if (!ham) {
      return sayfa(res, 404, "Böyle bir bağlantı yok",
        "Bu kısa bağlantı hiç oluşturulmamış ya da silinmiş.");
    }

    const kayit = typeof ham === "string" ? JSON.parse(ham) : ham;

    /* Ülke: Vercel istek başlığında gönderiyor. IP saklanmıyor. */
    const ulke = req.headers["x-vercel-ip-country"] || "";

    let yonlendiren = "";
    const ref = req.headers.referer || req.headers.referrer;
    if (ref) {
      try { yonlendiren = new URL(String(ref)).hostname || ""; } catch { yonlendiren = ""; }
    }

    const gun = bugunAnahtari();
    const gunAnahtar = "gun:" + kod + ":" + gun;

    await depo([
      ["INCR", "tik:" + kod],
      ["INCR", gunAnahtar],
      ["EXPIRE", gunAnahtar, GUN_SAKLAMA],
      ["HINCRBY", "ulke:" + kod, ulke, 1],
      ["HINCRBY", "ref:" + kod, yonlendiren, 1],
    ]);

    res.setHeader("cache-control", "no-store");
    res.setHeader("referrer-policy", "no-referrer");
    res.redirect(302, kayit.hedef);
  } catch (e) {
    console.error("yonlendirme hatasi:", e);
    return sayfa(res, 502, "Yönlendirme yapılamadı",
      "Depoya ulaşılamadı. Birazdan tekrar dener misin?");
  }
}
