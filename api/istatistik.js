/**
 * GET /api/istatistik?kod=abc123&t=<gizli anahtar>
 *
 * Cevap, Cloudflare Worker sürümüyle birebir aynı biçimde döner;
 * istatistik.html iki tarafta da değişmeden çalışır.
 */

import {
  depoBagliMi, depo, depoYokHatasi,
  esitMi, kodGecerliMi, json, hata,
} from "./_ortak.js";

/** Upstash HGETALL düz dizi döndürür: [alan, değer, alan, değer, ...] */
function hashCoz(ham, bosAd) {
  const cikti = [];
  if (Array.isArray(ham)) {
    for (let i = 0; i < ham.length; i += 2) {
      cikti.push({ ad: ham[i] || bosAd, n: Number(ham[i + 1]) || 0 });
    }
  } else if (ham && typeof ham === "object") {
    for (const [ad, n] of Object.entries(ham)) {
      cikti.push({ ad: ad || bosAd, n: Number(n) || 0 });
    }
  }
  return cikti.sort((a, b) => b.n - a.n).slice(0, 10);
}

export default async function handler(req, res) {
  if (req.method !== "GET") return hata(res, "Yalnızca GET.", 405);
  if (!depoBagliMi()) return depoYokHatasi(res);

  const kod = String(req.query.kod || "");
  const jeton = String(req.query.t || "");

  /* Kayıt yoksa da anahtar yanlışsa da aynı cevabı veriyoruz:
     hangi kodların var olduğu dışarıdan anlaşılmasın. */
  const gecersiz = () => hata(res, "Bu istatistik bağlantısı geçersiz.", 404);

  if (!kodGecerliMi(kod) || !jeton) return gecersiz();

  try {
    const [ham] = await depo([["GET", "link:" + kod]]);
    if (!ham) return gecersiz();

    const kayit = typeof ham === "string" ? JSON.parse(ham) : ham;
    if (!esitMi(jeton, kayit.jeton)) return gecersiz();

    /* Son 30 günün anahtarları — bugünden geriye. */
    const gunler = [];
    const bugun = new Date();
    bugun.setUTCHours(0, 0, 0, 0);
    for (let i = 29; i >= 0; i--) {
      const g = new Date(bugun.getTime() - i * 86400000);
      gunler.push(g.toISOString().slice(0, 10));
    }

    const [toplam, gunlukHam, ulkeHam, refHam] = await depo([
      ["GET", "tik:" + kod],
      ["MGET", ...gunler.map((g) => "gun:" + kod + ":" + g)],
      ["HGETALL", "ulke:" + kod],
      ["HGETALL", "ref:" + kod],
    ]);

    const gunluk = [];
    gunler.forEach((g, i) => {
      const n = Number(gunlukHam && gunlukHam[i]) || 0;
      if (n > 0) gunluk.push({ gun: g, n });
    });

    return json(res, {
      kod,
      hedef: kayit.hedef,
      baslik: kayit.baslik || null,
      olusturma: kayit.olusturma || null,
      toplam: Number(toplam) || 0,
      gunluk,
      ulkeler: hashCoz(ulkeHam, ""),
      yonlendirenler: hashCoz(refHam, ""),
    });
  } catch (e) {
    console.error("istatistik hatasi:", e);
    return hata(res, "İstatistik alınamadı. Birazdan tekrar dener misin?", 502);
  }
}
