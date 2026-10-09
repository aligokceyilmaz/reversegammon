# seyirde

YouTube kanalının uzun süreli takip sistemi. Her gün otomatik veri toplar,
`seyirde/data/` altına commit eder. Böylece "son 3 ayda ne değişti", "hangi
video hâlâ çekiyor", "CTR'ım düşüyor mu" gibi sorular geçmişe bakarak
cevaplanabilir hale gelir.

Reversegammon uygulamasıyla ilgisi yok, ona hiç dokunmaz: sıfır bağımlılık,
sadece Node'un kendi `fetch`'i. Expo paketlemesine girmez.

## Neden iki ayrı API

| Ne istiyorsun | Nereden geliyor | Geçmiş veri |
|---|---|---|
| İzlenme, izlenme süresi, tamamlama %, abone +/-, trafik kaynağı, retention eğrisi | YouTube **Analytics API** (`reports.query`) | Kanalın başından beri var, geriye dönük çekilebilir |
| **Gösterim (impressions) ve CTR** | YouTube **Reporting API**, toplu reach raporları | **Yok.** Sadece job kaydettiğin günden itibaren birikir |

CTR ve gösterim, interaktif Analytics API'sinden hiçbir dimension/filter
kombinasyonuyla gelmiyor — bunlar yalnızca Reporting API'nin
`channel_reach_basic_a1` / `channel_reach_combined_a1` raporlarında var
(metrikler: `video_thumbnail_impressions`, `video_thumbnail_impressions_ctr`).

**Bunun pratik sonucu:** CTR geçmişi geri alınamıyor. Aşağıdaki 7. adımı ne
kadar erken koşarsan o kadar uzun CTR geçmişine sahip olursun. İlk rapor
24-48 saat sonra düşer.

---

## Kurulum

Bir kerelik, ~30 dakika. 1-6. adımlar senin bilgisayarında.

### 1. Google Cloud projesi

https://console.cloud.google.com → üstteki proje seçiciden **New Project** →
isim: `seyirde` → Create.

### 2. Üç API'yi etkinleştir

**APIs & Services → Library**'de sırayla ara ve her birinde **Enable**:

- `YouTube Data API v3`
- `YouTube Analytics API`
- `YouTube Reporting API`

Üçü de şart. Reporting'i atlarsan CTR gelmez.

### 3. OAuth consent screen

**APIs & Services → OAuth consent screen**:

- User Type: **External** → Create
- App name: `seyirde`, support email: kendi adresin
- Scopes ekranında **Add or remove scopes** → şu ikisini seç:
  - `.../auth/youtube.readonly`
  - `.../auth/yt-analytics.readonly`
- Test users: kendi Google hesabını ekle

### 4. "Production"a al — bu adımı atlama

Consent screen ekranında **Publish app** → Confirm.

**Neden kritik:** Uygulama "Testing" durumunda kalırsa Google'ın verdiği
refresh token **7 gün sonra ölür** ve sistem sessizce durur. Bir gün
`invalid_grant` hatası görürsün ve veri akışı çoktan kesilmiş olur.
Production'da bu süre sınırı yok.

Doğrulanmamış uygulama olduğu için izin verirken bir uyarı ekranı çıkacak.
Sadece sen kendi hesabınla kullandığın için sorun değil — Google doğrulaması
yalnızca başka kullanıcılara dağıtacaksan gerekiyor.

### 5. OAuth client oluştur

**APIs & Services → Credentials → Create Credentials → OAuth client ID**:

- Application type: **Desktop app** (loopback yönlendirmesine izin verdiği
  için; Web application seçersen redirect URI'yi elle kaydetmen gerekir)
- Name: `seyirde-local` → Create

Çıkan **Client ID** ve **Client Secret**'ı kopyala.

### 6. Refresh token üret

Depoyu kendi bilgisayarına klonla ve:

```bash
YT_CLIENT_ID='....apps.googleusercontent.com' \
YT_CLIENT_SECRET='GOCSPX-...' \
node seyirde/scripts/get-refresh-token.mjs
```

Terminalde çıkan adresi tarayıcıda aç, kanalın sahibi hesapla giriş yap,
uyarı ekranında **Advanced → Go to seyirde (unsafe)** ile devam et. İzin
verince terminale refresh token basılır.

Bu değeri dosyaya yazıp commit etme.

### 7. GitHub Secrets

Depo sayfası → **Settings → Secrets and variables → Actions → New repository
secret**. Üç tane ekle:

| Secret adı | Değer |
|---|---|
| `YT_CLIENT_ID` | 5. adımdaki Client ID |
| `YT_CLIENT_SECRET` | 5. adımdaki Client Secret |
| `YT_REFRESH_TOKEN` | 6. adımda basılan token |

Bunlar sadece Actions'ın göreceği şifreli değerler; depoya yazılmaz, log'a
basılmaz ve sohbete yapıştırman gerekmez.

### 8. Reach job'larını kaydet — en erken fırsatta

CTR geçmişi bu adımdan itibaren birikmeye başlar, geriye dönük alınamaz.

Yerelden:

```bash
YT_CLIENT_ID='...' YT_CLIENT_SECRET='...' YT_REFRESH_TOKEN='...' \
  node seyirde/scripts/setup-reach-jobs.mjs
```

### 9. İlk toplamayı çalıştır

Actions sekmesi → **seyirde — YouTube verisi topla** → **Run workflow**.
Analytics geçmişinin tamamını almak için ilk koşuyu geriye dönük yap:

```bash
# yerelden, kanalın ilk gününden bugüne
node seyirde/scripts/collect.mjs --backfill
```

Sonrasında cron her gün 10:00 UTC'de son 14 günü tazeler ve değişiklik varsa
commit atar.

---

## Komutlar

```bash
node seyirde/scripts/collect.mjs              # son 14 günü tazele
node seyirde/scripts/collect.mjs --days 90    # son 90 gün
node seyirde/scripts/collect.mjs --backfill   # tüm geçmiş
node seyirde/scripts/report.mjs               # özet bas (API'ye gitmez)
node seyirde/scripts/report.mjs --days 90
```

Yerelde çalıştırırken `seyirde/.env` kullanabilirsin (gitignore'da):

```bash
set -a && . seyirde/.env && set +a && node seyirde/scripts/collect.mjs
```

## Veri dosyaları

Hepsi uzun-format CSV, anahtara göre upsert ediliyor — aynı günü tekrar
çekmek satır çoğaltmaz. Analytics son ~3 günü sonradan revize ettiği için
her koşu son 14 günü yeniden yazar.

| Dosya | Anahtar | İçerik |
|---|---|---|
| `channel_daily.csv` | `date` | Günlük izlenme, izlenme dakikası, ort. süre, abone +/-, beğeni, yorum |
| `channel_daily_snapshot.csv` | `date` | O gün ölçülen abone / toplam izlenme / video sayısı |
| `videos.csv` | `video_id` | Başlık, yayın tarihi, süre, etiketler, ömür boyu sayaçlar |
| `video_daily.csv` | `date` + `video` | Video bazlı günlük performans |
| `traffic_sources.csv` | `date` + kaynak tipi | İzlenmenin nereden geldiği |
| `retention.csv` | `video_id` + zaman oranı | İzleyici tutma eğrisi (en çok izlenen 10 video) |
| `reach_basic.csv` | `date` + `video_id` | Gösterim ve CTR |
| `last_run.json` | — | Son koşunun zamanı, penceresi, satır sayıları |

## Sorun giderme

**`invalid_grant`** — Refresh token ölmüş. Neredeyse her zaman sebebi OAuth
ekranının "Testing"de bırakılmış olması (4. adım). Production'a al, sonra
6. adımı tekrarlayıp `YT_REFRESH_TOKEN` secret'ını güncelle.

**`refresh token gelmedi`** — Bu hesaba daha önce izin verilmiş.
https://myaccount.google.com/permissions adresinden `seyirde`nin erişimini
kaldır ve 6. adımı tekrarla.

**CTR hâlâ boş** — 8. adım koşuldu mu? Koşulduysa 24-48 saat bekle;
`last_run.json` içindeki `reach_note` ne diyor?

**`reach rapor tipi görünmüyor`** — YouTube Reporting API etkin değil
(2. adım) ya da hesap bu raporlara erişemiyor.

**Retention boş** — İzlenmesi çok az olan videolarda YouTube Analytics veri
döndürmüyor. Beklenen davranış, hata değil.

## Maliyet

Data API kotası günde 10.000 birim; bu toplama koşusu ~100 birim harcıyor.
Actions tarafında koşu ~20 saniye sürüyor (private depoda aylık 2.000 dakika
ücretsiz kota var).
