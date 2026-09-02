/**
 * POST /api/kisalt
 * Gövde: { "url": "https://..." }
 * Cevap: { kod, kisa, hedef, istatistik, zararliKontrolu }
 */

import {
  depoBagliMi, depo, depoYokHatasi,
  rastgele, jetonUret, json, hata,
  kendiAdresi, istekIp, adresiCozumle, zararliMi, basligiOku,
  SAATLIK_SINIR,
} from "./_ortak.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return hata(res, "Yalnızca POST.", 405);
  if (!depoBagliMi()) return depoYokHatasi(res);

  let govde = req.body;
  if (typeof govde === "string") {
    try { govde = JSON.parse(govde); } catch { return hata(res, "İstek okunamadı."); }
  }
  if (!govde || typeof govde !== "object") return hata(res, "İstek okunamadı.");

  const adres = kendiAdresi(req);
  const kendiHost = new URL(adres).hostname;

  const cozum = adresiCozumle(govde.url, kendiHost);
  if (cozum.hata) return hata(res, cozum.hata);

  try {
    /* --- Hız sınırı: aynı IP saatte en fazla SAATLIK_SINIR bağlantı --- */
    const ip = istekIp(req);
    if (ip) {
      const sayacAnahtar = "hiz:" + ip + ":" + new Date().toISOString().slice(0, 13);
      const [sayi] = await depo([
        ["INCR", sayacAnahtar],
        ["EXPIRE", sayacAnahtar, 3600],
      ]);
      if (Number(sayi) > SAATLIK_SINIR) {
        return hata(res, "Bu saat içinde çok fazla bağlantı oluşturdun. Biraz sonra tekrar dene.", 429);
      }
    }

    /* --- Zararlı bağlantı kontrolü (anahtar yoksa atlanır) --- */
    const kontrol = await zararliMi(cozum.url);
    if (kontrol.zararli) {
      return hata(res, "Bu adres Google'ın zararlı bağlantı listesinde görünüyor, kısaltılmadı.", 422);
    }

    /* --- Kod üret, çakışırsa yeniden dene --- */
    const jeton = jetonUret();
    const simdi = Math.floor(Date.now() / 1000);
    let kod = null;

    for (let deneme = 0; deneme < 6; deneme++) {
      const aday = rastgele();
      const kayit = JSON.stringify({
        hedef: cozum.url,
        baslik: null,
        jeton,
        olusturma: simdi,
      });
      /* NX: yalnızca anahtar yoksa yazar. Çakışmayı böyle yakalıyoruz. */
      const [sonuc] = await depo([["SET", "link:" + aday, kayit, "NX"]]);
      if (sonuc === "OK") { kod = aday; break; }
    }

    if (!kod) return hata(res, "Kod üretilemedi, tekrar dener misin?", 503);

    /* --- Hedef sayfanın başlığı (kısa zaman aşımı; bulunamazsa boş kalır) --- */
    const baslik = await basligiOku(cozum.url);
    if (baslik) {
      const kayit = JSON.stringify({ hedef: cozum.url, baslik, jeton, olusturma: simdi });
      await depo([["SET", "link:" + kod, kayit]]);
    }

    return json(res, {
      kod,
      kisa: adres + "/" + kod,
      hedef: cozum.url,
      istatistik: adres + "/istatistik.html?kod=" + kod + "&t=" + jeton,
      zararliKontrolu: kontrol.atlandi ? "atlandi" : "yapildi",
    });
  } catch (e) {
    console.error("kisalt hatasi:", e);
    return hata(res, "Bağlantı kaydedilemedi. Biraz sonra tekrar dener misin?", 502);
  }
}
