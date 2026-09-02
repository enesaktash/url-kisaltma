# Kısayol

Uzun bir bağlantıyı kısaltır ve o bağlantıya kaç kez tıklandığını gösterir.
Yaptığı iş bu. Kampanya paneli, dönüşüm hunisi, ekip yönetimi yok.

Örnek proje.

![Tanıtım sayfası](ekran-goruntuleri/ana-sayfa.png)

---

## Çalıştırmak için gereken tek şey: iki ortam değişkeni

Uygulama Vercel'de çalışır. Kalıcı depo olarak **Upstash Redis** kullanır —
ücretsiz katmanı var ve REST API'si olduğu için hiçbir paket kurulmaz,
yalnızca `fetch` kullanılır. Projenin çalışma zamanı bağımlılığı yoktur.

### 1. Upstash'te bir Redis veritabanı aç

1. [upstash.com](https://upstash.com) → ücretsiz hesap
2. **Create Database** → bir isim ve bölge seç (Avrupa'ya yakın bir bölge iyi olur)
3. Veritabanı sayfasında **REST API** bölümünü aç
4. İki değeri kopyala: `UPSTASH_REDIS_REST_URL` ve `UPSTASH_REDIS_REST_TOKEN`

### 2. Bu iki değeri Vercel'e gir

Vercel → proje → **Settings → Environment Variables**:

| Değişken | Değer |
|---|---|
| `UPSTASH_REDIS_REST_URL` | Upstash'ten kopyaladığın URL |
| `UPSTASH_REDIS_REST_TOKEN` | Upstash'ten kopyaladığın token |

### 3. Yeniden dağıt

Vercel → **Deployments** → son dağıtım → **Redeploy**.
Ortam değişkenleri yalnızca yeni dağıtımlara uygulanır.

Bu kadar. Sayfaya gir, bir adres yapıştır, kısalt, kısa adrese tıkla,
istatistik bağlantısını aç.

> Ortam değişkenleri tanımlı değilse uygulama çökmez: form
> "Depo bağlı değil" der ve hangi değişkenlerin eksik olduğunu yazar.

---

## İsteğe bağlı: zararlı bağlantı kontrolü

Kısa link servisleri oltalama için kötüye kullanılır. Bu kontrol açılmazsa
adresin zamanla spam listelerine ve tarayıcı uyarılarına takılabilir.
**Açmanı öneririm.**

1. [Google Cloud Console](https://console.cloud.google.com) → APIs & Services → Library
2. **Safe Browsing API** → Enable → Credentials → API key
3. Vercel'de `SAFE_BROWSING_API_KEY` olarak ekle, yeniden dağıt

Anahtar yoksa kontrol atlanır ve uygulama çalışmaya devam eder. Kontrolün
gerçekten yapılıp yapılmadığı, bağlantı üretildikten sonra ekranda yazar.

Safe Browsing API ticari olmayan kullanımda ücretsizdir. Ticari bir ürüne
dönüşürse Google'ın ücretli Web Risk API'sine geçmek gerekir.

---

## Ne nerede

| Dosya | İşi |
|---|---|
| `public/index.html` | Tanıtım sayfası ve kısaltma formu |
| `public/istatistik.html` | Tıklama istatistiği ve günlük grafik |
| `api/kisalt.js` | POST — yeni kısa bağlantı üretir |
| `api/git.js` | Kısa adrese gelen isteği sayar ve yönlendirir |
| `api/istatistik.js` | GET — tıklama istatistiği (JSON) |
| `api/_ortak.js` | Depo erişimi, doğrulama, güvenlik kontrolleri |
| `vercel.json` | `/:kod` → `/api/git` yönlendirme kuralı |
| `spec.md` | Kapsam, veri kaynakları, alınan kararlar |

Sayfalar tek dosyadır: harici font, CDN, analitik veya görsel isteği yoktur.

### Veri modeli (Redis anahtarları)

| Anahtar | Tür | İçerik |
|---|---|---|
| `link:<kod>` | string | JSON: hedef, başlık, gizli anahtar, oluşturma zamanı |
| `tik:<kod>` | sayaç | toplam tıklama |
| `gun:<kod>:<YYYY-MM-DD>` | sayaç | günlük tıklama (40 gün sonra kendini siler) |
| `ulke:<kod>` | hash | ülke kodu → sayı |
| `ref:<kod>` | hash | yönlendiren alan adı → sayı |
| `hiz:<ip>:<saat>` | sayaç | hız sınırı (1 saat sonra kendini siler) |

---

## Cloudflare Workers sürümü

`src/index.js`, `schema.sql` ve `wrangler.toml` aynı uygulamanın Cloudflare
Workers + D1 üzerinde çalışan sürümüdür. Kendi kısa alan adını alıp oraya
taşımak istersen [KURULUM.md](KURULUM.md) dosyasına bak. İki sürüm aynı API
biçimini konuşur; `public/` altındaki sayfalar ikisiyle de değişmeden çalışır.

**Not:** İkisi ayrı depo kullanır (Redis / D1). Aynı anda ikisini birden
çalıştırırsan bir tarafta üretilen kısa bağlantı diğerinde bulunmaz.

---

## Gizlilik

Tıklama sayılırken ziyaretçinin IP adresi saklanmaz; yalnızca ülke kodu
tutulur. Yönlendiren site bilgisi tarayıcı gönderirse kaydedilir,
göndermezse "bilinmiyor" olarak görünür — tahmin üretilmez.

IP adresi yalnızca hız sınırı sayacında, saatlik ve kendini silen bir
anahtarda geçici olarak kullanılır.

## Güvenlik

- Yalnızca `http` ve `https` adresleri kabul edilir (`javascript:` reddedilir)
- Kendi kısa bağlantımız tekrar kısaltılamaz (yönlendirme döngüsü olmasın)
- İstatistik yalnızca oluşturma anında verilen gizli anahtarla görülebilir
- Kayıt yoksa da anahtar yanlışsa da aynı cevap döner; hangi kodların var
  olduğu dışarıdan anlaşılmaz
- Aynı IP saatte en fazla 30 bağlantı oluşturabilir
- Hiçbir API anahtarı kodda gömülü değildir

## Eksikler

- Hesap yok; istatistik bağlantısını kaybeden sayıları bir daha göremez
- Kısa alan adı alınmadı; `vercel.app` adresiyle üretilen bağlantı uzun görünür
- Tıklama toplamları süresiz saklanır (günlük kırılım 40 gün sonra silinir)
