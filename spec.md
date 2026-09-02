# spec.md — Kısayol

Kısa link üretme ve tıklama sayma uygulaması.

---

## 1. Uygulamanın tek işi

**Uzun bir bağlantıyı kısa bir bağlantıya çevirmek ve o kısa bağlantıya kaç
kez tıklandığını göstermek.**

Bir cümlede: kullanıcı uzun URL yapıştırır, kısa URL alır, sonra o kısa
URL'nin kaç tıklama aldığını görür.

Uygulama bunun dışında hiçbir iş yapmaz. Ek özellik önerisi geldiğinde
ölçüt bu cümledir: bu işe hizmet etmiyorsa kapsam dışıdır.

### Ürünün üç ekranı

1. **Oluşturma** — URL yapıştır, kısa link al.
2. **İstatistik** — bir kısa linkin tıklama sayısı ve günlük dağılımı.
3. **Yönlendirme** — kısa linke gelen ziyaretçiyi hedefe gönderir (arayüz yok).

Dördüncü bir ekran yok.

---

## 2. Kim kullanacak

**Birincil kitle: içeriğini birden fazla yerde paylaşan tek kişiler.**

- Bülten (newsletter) yazan, aynı linki farklı mecralara koyanlar
- Sosyal medyada iş paylaşan freelance'lar, küçük ajanslar
- Bio linki, QR kod veya basılı materyalde kısa adres gerektiren küçük işletmeler
- Kendi projesinin linkini paylaşıp kaç kişinin tıkladığını merak eden geliştiriciler

Bu kişilerin ortak hali: bir bağlantının işe yarayıp yaramadığını
merak ediyorlar ama bunun için analiz paneli kurmak istemiyorlar.
Cevabı tek sayıda arıyorlar.

### Kim kullanmayacak (hitap etmiyoruz)

- Kampanya yönetimi, A/B testi, dönüşüm hunisi kurmak isteyen pazarlama ekipleri
- Çok kullanıcılı, rol/yetki isteyen şirketler
- Kendi alan adını markalı kısa link olarak kullanmak isteyenler (en azından ilk sürümde)
- API üzerinden toplu link üretmek isteyen entegrasyoncular

---

## 3. Veri nereden geliyor

Verinin büyük kısmını kendimiz üretiyoruz. Harici API'ye bağımlılık
kasıtlı olarak düşük tutuldu.

### 3.1 Kendi ürettiğimiz veri

| Veri | Kaynak |
|---|---|
| Kısa kod (`abc123`) | Kendi kodumuz üretir — rastgele karakter dizisi, çakışma kontrolü |
| Hedef URL | Kullanıcı formdan girer |
| Oluşturma zamanı | Sunucu saati |
| Tıklama olayı | Yönlendirme isteği geldiğinde kaydedilir |
| Toplam tıklama | Tıklama kayıtlarının sayımı |

Bunlar için hiçbir dış servise ihtiyaç yok.

### 3.2 İsteğin kendisinden gelen veri (ücretsiz, API yok)

Ziyaretçi kısa linke tıkladığında HTTP isteğinin başlıklarında hazır gelenler:

| Veri | Nereden |
|---|---|
| Ülke | `CF-IPCountry` başlığı (Cloudflare üzerinden yayınlanırsa) |
| Yönlendiren site | `Referer` başlığı |
| Cihaz türü (kaba) | `User-Agent` başlığı |
| Zaman | Sunucu saati |

Not: Bu alanlar her istekte dolu gelmeyebilir. `Referer` çoğu zaman boş
gelir, bu normaldir. İstatistik ekranında "bilinmiyor" olarak gösterilecek,
tahmin üretilmeyecek.

**IP adresi saklanmayacak.** Sadece ülke bilgisi türetilip ham IP atılacak.

### 3.3 Google Cloud Console'dan açılacak API

**Tek bir API açman yeterli: Web Risk API** (veya Safe Browsing API).

- **Ne için:** Kullanıcı bir URL girdiğinde, o URL Google'ın zararlı site
  listesinde mi diye kontrol edilir. Oltalama/zararlı yazılım çıkarsa link
  oluşturulmaz.
- **Neden gerekli:** Kısa link servisleri oltalama için kötüye kullanılır.
  Bu kontrol yoksa alan adımız kısa sürede spam filtrelerine ve tarayıcı
  uyarılarına takılır. Ürünü yaşatan kontrol budur.
- **Nasıl açılır:** Google Cloud Console → APIs & Services → Library →
  "Web Risk API" → Enable → Credentials → API key oluştur.
- **Kullanım:** Sunucu tarafından çağrılır. Anahtar tarayıcıya asla düşmez.
- **Kota ve ücret:** `[DOĞRULANACAK]` — ücretsiz katman sınırını Cloud
  Console'daki güncel fiyatlandırma sayfasından teyit et, buraya yaz.

#### Bot koruması: Cloudflare Turnstile

Oluşturma formunu botlara karşı korur. Ücretsizdir, kullanım sınırı yoktur ve
ziyaretçiye bulmaca çözdürmez. Google Cloud faturalandırmasına girmemek için
reCAPTCHA yerine bu tercih edildi.

- Cloudflare panelinden site anahtarı (public) ve gizli anahtar (secret) alınır.
- Site anahtarı sayfada görünür, gizli anahtar yalnızca sunucuda doğrulama için kullanılır.
- Backend hazır olana kadar tanıtım sayfasına eklenmez.

#### Açmana gerek olmayanlar

| API | Neden gerekmiyor |
|---|---|
| Google URL Shortener (goo.gl) | Kapatıldı, mevcut linkler 25 Ağustos 2025'te servis edilmeyi bıraktı |
| Firebase Dynamic Links | Kullanımdan kaldırıldı, aynı tarihte kapatıldı |
| Google Analytics Data API | Tıklamayı kendimiz sayıyoruz, üçüncü tarafa göndermiyoruz |
| Google Maps / Geocoding | Ülke bilgisi istek başlığından ücretsiz geliyor |

### 3.4 Altyapı — karar verildi ve kuruldu

**Canlıdaki sürüm Vercel üzerinde çalışıyor.**

| İhtiyaç | Seçim | Durum |
|---|---|---|
| Barındırma + yönlendirme | Vercel Functions | Kuruldu (`api/`) |
| Veri saklama | Upstash Redis (REST) | Kuruldu, ücretsiz katman |
| Alan adı | `<proje>.vercel.app` | Ücretsiz alt alan adı |

Upstash seçildi çünkü REST API'si var: hiçbir paket kurmadan, yalnızca
`fetch` ile konuşuluyor. Projenin çalışma zamanı bağımlılığı yok.
Ülke bilgisi Vercel'in `x-vercel-ip-country` başlığından ücretsiz geliyor.

**İkinci sürüm:** Aynı uygulamanın Cloudflare Workers + D1 hâli
`src/index.js` ve `schema.sql` dosyalarında duruyor. İkisi aynı API
biçimini konuşur, `public/` altındaki sayfalar ikisiyle de değişmeden
çalışır. Depoları ayrıdır: bir tarafta üretilen bağlantı diğerinde bulunmaz.

**Bilinçli taviz:** Kısa alan adı satın alınmadığı için üretilen bağlantı
`vercel.app` uzantısıyla uzun görünür. Servis eksiksiz çalışır ama "kısa
link" iddiası ancak kendi alan adı alınınca tam karşılanır. Alan adı
projedeki tek masraf kalemidir.

---

### 3.5 Anahtar yönetimi

**Hiçbir API anahtarı koda gömülmeyecek.** Tüm anahtarlar `.env` dosyasında
tutulur, `.env` sürüm kontrolüne girmez. Depoda yalnızca `.env.example`
bulunur — içi boş, sadece hangi değişkenlerin gerektiğini gösterir.

| Değişken | Nerede kullanılır | Zorunlu mu | Tarayıcıya düşer mi |
|---|---|---|---|
| `UPSTASH_REDIS_REST_URL` | Sunucu — depo adresi | Evet | Hayır |
| `UPSTASH_REDIS_REST_TOKEN` | Sunucu — depo anahtarı | Evet | Hayır |
| `SAFE_BROWSING_API_KEY` | Sunucu — zararlı URL kontrolü | Hayır | Hayır |
| `TURNSTILE_SECRET_KEY` | Sunucu — bot doğrulaması (yalnızca Workers sürümü) | Hayır | Hayır |

Zorunlu iki değişken tanımlı değilse uygulama çökmez; API `503` ile
"depo bağlı değil" der ve hangi değişkenlerin eksik olduğunu yazar.
İsteğe bağlı olanlar tanımlı değilse ilgili kontrol atlanır.

Yayına alırken bu değerler barındırma sağlayıcısının ortam değişkenleri
ekranına girilir (Vercel: Settings → Environment Variables; Cloudflare:
`wrangler secret put`). Dosya olarak sunucuya yüklenmez. Depoda yalnızca
`.env.example` ve `.dev.vars.example` bulunur, ikisinin de içi boştur.

### 3.6 API gerektirmeyen ek veriler

Bu ikisi dış servise bağlanmadan, kendi kodumuzla elde edilir:

- **Hedef sayfanın başlığı** — link oluşturulurken sayfa bir kez çekilir,
  `<title>` ve `og:title` okunur. İstatistik ekranında kullanıcı hangi
  linkin hangisi olduğunu bu sayede anlar. Sayfa çekilemezse başlık boş
  bırakılır, tahmin üretilmez.
- **Favicon** — `https://www.google.com/s2/favicons?domain=...` anahtarsız
  ve ücretsiz çalışır. Google bunu resmî olarak dokümante etmiyor; bir gün
  kapanabilir. Sadece görsel bir detay olduğu için kırılırsa ürün çalışmaya
  devam eder.

### 3.7 İleride değerlendirilecek (ilk sürümde yok)

Hiçbiri ilk sürümü çalıştırmak için gerekli değil. Somut bir ihtiyaç
doğmadan eklenmeyecek.

| API / kaynak | Ne zaman gerekir | Not |
|---|---|---|
| urlscan.io | Web Risk yeni oltalama sayfalarını kaçırırsa | Ücretsiz katman, anahtar gerekiyor |
| URLhaus (abuse.ch) | İkinci bir kara liste kaynağı istenirse | Ücretsiz, kayıt gerekiyor |
| MaxMind GeoLite2 | Cloudflare kullanılmazsa ülke bilgisi için | API değil, indirilen veritabanı |
| Resend / Brevo / Mailgun | İstatistik bağlantısı e-postayla yollanacaksa | Ücretsiz katman sınırları `[DOĞRULANACAK]` |

**Kullanmayacaklarımız:** `ip-api.com` ve benzeri bazı ücretsiz IP
servislerinin ücretsiz katmanı yalnızca ticari olmayan kullanıma açık.
Ücretli bir ürün planlanıyorsa lisansı ihlal eder.

---

## 4. Veri modeli

İki tablo yeterli.

**links**
- `code` — kısa kod, birincil anahtar
- `target_url` — hedef adres
- `title` — hedef sayfanın `<title>` etiketi, okunabildiyse (bkz. 3.6)
- `owner_token` — istatistiği kimin görebileceğini belirleyen gizli anahtar
- `created_at` — oluşturma zamanı

**clicks**
- `code` — hangi linke ait
- `clicked_at` — zaman
- `country` — ülke kodu veya boş
- `referrer` — yönlendiren sitenin alan adı veya boş

Toplam tıklama ayrı bir alanda tutulmaz, `clicks` üzerinden sayılır.
Şema `schema.sql` dosyasında; bu tablo onunla birebir aynıdır.

---

## 5. Akışlar

### Link oluşturma
1. Kullanıcı URL girer.
2. Biçim doğrulanır (yalnızca `http` ve `https` kabul edilir).
3. Web Risk API'ye sorulur. Zararlıysa reddedilir, sebebi yazılır.
4. Kısa kod üretilir, kaydedilir.
5. Kısa link ve istatistik bağlantısı kullanıcıya gösterilir.

### Yönlendirme
1. `/{code}` isteği gelir.
2. Kod bulunamazsa açık bir "bu link yok" sayfası gösterilir.
3. Tıklama kaydedilir.
4. Hedefe 302 ile yönlendirilir.

### İstatistik görüntüleme
1. Kullanıcı `owner_token` içeren bağlantıyı açar.
2. Toplam tıklama, son 30 günün günlük dağılımı, ülke ve yönlendiren kırılımı gösterilir.

İlk sürümde hesap ve şifre yok. İstatistiğe erişim, oluşturma anında verilen
gizli bağlantı ile olur. Bağlantıyı kaybeden istatistiği göremez — bu sayfada
açıkça yazılacak.

---

## 6. Kapsam dışı (ilk sürümde yok)

- Kullanıcı hesabı, giriş, şifre
- Markalı/özel alan adı
- Özel kısa kod seçme
- Link düzenleme veya silme
- QR kod üretimi
- Link son kullanma tarihi, şifreli link
- UTM etiketi oluşturucu
- A/B testi, kampanya grupları
- Ekip, rol, yetki
- Dışarıya açık API
- Tıklama verisi dışa aktarma

Bu liste tanıtım sayfasında da açıkça yer alacak. Dar kapsam gizlenecek
bir eksik değil, ürünün tanımı.

---

## 7. Tanıtım sayfasının tek işi

Ziyaretçiye ne yaptığımızı anlatmak ve tek eyleme yönlendirmek:
**URL yapıştır, kısa link al.** Form sayfanın üstünde, deneme için giriş
gerektirmeyecek.

Aynı eylem çağrısı sayfada tekrarlanmayacak.

---

## 8. Karara bağlanacaklar

Bu bir **örnek proje**, ama çalışan bir örnek: kısaltma, yönlendirme ve
istatistik yerelde uçtan uca denendi. Aşağıdaki değerler seçildi; gerçek
bir ürüne dönüşürse hepsi yeniden ele alınmalı.

| Konu | Değer | Nasıl belirlendi |
|---|---|---|
| Ürün adı | Kısayol | Seçildi — marka tescili araştırılmadı |
| Alan adı | `<worker>.workers.dev` | Ücretsiz; kısa alan adı alınmadı |
| Barındırma ve veritabanı | Cloudflare Workers + D1 | Ülke bilgisi ücretsiz geldiği için |
| İletişim adresi | `merhaba@tik.co` | Örnek |
| Fiyat | Ücretsiz | Ücretsiz katmanda çalıştığı için ücret alınmıyor |
| Tıklama kaydının saklanma süresi | Sınırsız (temizlik işi yok) | Gerçek kullanımda süre sınırı konmalı |
| Zararlı bağlantı kontrolü | Safe Browsing API | Anahtar yoksa atlanır; kota `[DOĞRULANACAK]` |

Gerçek yayına geçilecekse önce şunlar yapılmalı: alan adı müsaitliği ve
marka çakışması kontrolü, Safe Browsing API kotasının teyidi, kötüye
kullanıma karşı hız sınırı (rate limit), ve eski tıklama kayıtlarını
temizleyen bir iş. Kurulum adımları `kisa-link/KURULUM.md` dosyasında.
