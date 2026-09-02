# Tık — kurulum

Sıfır lira. Alan adı satın alınmıyor; adres `https://tik.<kullanıcı-adın>.workers.dev`
olacak. Kredi kartı istenmiyor.

Bir uyarı baştan: **ürettiğin kısa bağlantı `workers.dev` adresiyle uzun görünür.**
Servis eksiksiz çalışır ama "kısa link" iddiası ancak kendi alan adını alınca
tam karşılanır. Alan adı tek masraf, o da yıllık.

---

## Gerekenler

- Node.js 18 veya üstü
- Cloudflare hesabı (ücretsiz)
- Google hesabı (isteğe bağlı — zararlı bağlantı kontrolü için)

---

## 1. Bağımlılığı kur

```bash
cd kisa-link
npm install
```

Tek bağımlılık `wrangler` (Cloudflare komut satırı aracı).

## 2. Cloudflare hesabına gir

```bash
npx wrangler login
```

Tarayıcı açılır, onay verirsin.

## 3. Veritabanını oluştur

```bash
npx wrangler d1 create tik
```

Komut şuna benzer bir çıktı verir:

```
database_id = "8f2a1c40-...."
```

Bu değeri `wrangler.toml` içindeki `BURAYA-D1-ID-GELECEK` yerine yapıştır.

## 4. Tabloları kur

```bash
npm run db:uzak      # canlı veritabanı
npm run db:local     # yerel geliştirme için (isteğe bağlı)
```

## 5. Yayına al

```bash
npx wrangler deploy
```

Çıktıda adresin yazar. Aç, bir bağlantı kısalt, kısa adrese tıkla, istatistik
bağlantısını aç — üçü de çalışmalı.

---

## İsteğe bağlı: zararlı bağlantı kontrolü

Kısa link servisleri oltalama için kötüye kullanılır. Bu kontrol açılmazsa
adresin spam listelerine ve tarayıcı uyarılarına takılabilir. **Açmanı öneririm.**

1. [Google Cloud Console](https://console.cloud.google.com) → APIs & Services → Library
2. **Safe Browsing API** → Enable
3. Credentials → Create credentials → API key
4. Anahtarı gizli değer olarak gir:

```bash
npx wrangler secret put SAFE_BROWSING_API_KEY
```

Anahtar tanımlı değilse uygulama çalışmaya devam eder, sadece bu kontrol atlanır.
Safe Browsing API ticari olmayan kullanımda ücretsizdir; ticari bir ürüne
dönüşürse Google'ın ücretli Web Risk API'sine geçmen gerekir.

## İsteğe bağlı: bot koruması

```bash
npx wrangler secret put TURNSTILE_SECRET_KEY
```

Site anahtarını `wrangler.toml` içindeki `TURNSTILE_SITE_KEY` alanına yaz.
Turnstile ücretsizdir ve kullanım sınırı yoktur. Not: widget'ı sayfaya
eklemek `challenges.cloudflare.com` adresine bir istek getirir — sayfa şu an
tamamen dışa kapalı, bu tercihi bilerek yap.

---

## Yerelde çalıştırma

```bash
cp .dev.vars.example .dev.vars   # anahtarları buraya yaz
npm run db:local
npm run dev
```

`.dev.vars` commit edilmez.

---

## Ücretsiz katman sınırları

Cloudflare Workers ve D1'in ücretsiz katmanları bu iş için fazlasıyla yeterli.
**Güncel sınırları kurmadan önce Cloudflare'in fiyatlandırma sayfasından teyit
et** — zaman içinde değişiyor, buraya rakam yazmıyorum.

---

## Ne nerede

| Dosya | İşi |
|---|---|
| `src/index.js` | Worker: kısaltma, yönlendirme, istatistik API'si |
| `schema.sql` | D1 tabloları (`links`, `clicks`) |
| `public/index.html` | Tanıtım sayfası ve kısaltma formu |
| `public/istatistik.html` | İstatistik sayfası |
| `wrangler.toml` | Cloudflare ayarları |
| `.dev.vars.example` | Hangi anahtarlar gerekiyor (değerler boş) |

Anahtarların hiçbiri kodda gömülü değildir.

---

## Sonraki adım: gerçek alan adı

Kısa bir alan adı alıp Cloudflare'e ekledikten sonra `wrangler.toml` içine
bir `route` tanımlaman yeterli. Veritabanı ve mevcut kısa bağlantılar aynen
çalışmaya devam eder; yalnızca önlerindeki adres değişir.
