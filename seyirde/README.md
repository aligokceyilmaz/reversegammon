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

Bir kerelik, ~30 dakika. 1-6. adımlar senin bilgisayarında, tarayıcıda.

### 1. Google Cloud projesi aç

→ https://console.cloud.google.com/projectcreate

İsim: `seyirde` → **Create**. Sonraki adımlarda bu projenin seçili olduğundan
emin ol (üstteki proje seçici).

### 2. Üç API'yi etkinleştir

Her linkte **Enable** / **Etkinleştir** butonuna bas:

- YouTube Data API v3 → https://console.cloud.google.com/apis/library/youtube.googleapis.com
- YouTube Analytics API → https://console.cloud.google.com/apis/library/youtubeanalytics.googleapis.com
- YouTube Reporting API → https://console.cloud.google.com/apis/library/youtubereporting.googleapis.com

Üçü de şart. Reporting'i atlarsan CTR ve gösterim verisi hiç gelmez.

### 3. OAuth izin ekranını kur

→ https://console.cloud.google.com/auth/overview

Google bu bölümü **"Google Auth Platform"** olarak yeniden adlandırdı. Eski
"OAuth consent screen" linkini görürsen
(https://console.cloud.google.com/apis/credentials/consent) buraya yönlendirir.

- **Branding**: App name `seyirde`, destek e-postası kendi adresin
- **Audience** → User type: **External**
- **Data Access** → *Add or remove scopes* → şu ikisini seç:
  - `.../auth/youtube.readonly`
  - `.../auth/yt-analytics.readonly`

### 4. Uygulamayı "In production"a al — BU ADIMI ATLAMA

→ https://console.cloud.google.com/auth/audience

Publishing status altında **Publish app** → Confirm. Durum
`Testing` → `In production` olmalı.

**Neden kritik:** "Testing" durumunda Google'ın verdiği refresh token
**7 gün sonra ölür** ve sistem sessizce durur. Bir gün `invalid_grant`
hatası görürsün, ama veri akışı haftalar önce kesilmiş olur.
"In production"da bu süre sınırı yok.

Doğrulanmamış uygulama olduğu için izin verirken bir uyarı ekranı çıkacak;
sadece kendi hesabınla kullandığın için sorun değil. Google doğrulaması
yalnızca uygulamayı başka kullanıcılara dağıtacaksan gerekiyor.

### 5. OAuth client oluştur

→ https://console.cloud.google.com/auth/clients

**Create client**:

- Application type: **Desktop app** — loopback yönlendirmesine izin verdiği
  için. "Web application" seçersen redirect URI'yi elle kaydetmen gerekir.
- Name: `seyirde-local` → **Create**

Çıkan **Client ID** ve **Client Secret**'ı kopyala.

### 6. Refresh token üret

Depoyu kendi bilgisayarına klonla, bu dala geç ve çalıştır:

```bash
git clone https://github.com/aligokceyilmaz/reversegammon.git
cd reversegammon
git checkout claude/gifted-dijkstra-3qyipe

YT_CLIENT_ID='....apps.googleusercontent.com' \
YT_CLIENT_SECRET='GOCSPX-...' \
node seyirde/scripts/get-refresh-token.mjs
```

Terminalde çıkan adresi tarayıcıda aç, **kanalın sahibi** Google hesabıyla
giriş yap. Uyarı ekranında *Advanced* → *Go to seyirde (unsafe)* ile devam et.
İzin verince refresh token terminale basılır.

Bu değeri hiçbir dosyaya yazıp commit etme.

### 7. GitHub Secrets'a üç değeri gir

→ https://github.com/aligokceyilmaz/reversegammon/settings/secrets/actions

**New repository secret** ile üç tane ekle:

| Secret adı | Değer |
|---|---|
| `YT_CLIENT_ID` | 5. adımdaki Client ID |
| `YT_CLIENT_SECRET` | 5. adımdaki Client Secret |
| `YT_REFRESH_TOKEN` | 6. adımda basılan token |

Bunlar şifreli saklanır, depoya yazılmaz, Actions log'una basılmaz.

### 8. Reach job'larını kaydet — EN ERKEN FIRSATTA

CTR geçmişi bu adımdan itibaren birikmeye başlar ve **geriye dönük
alınamaz**. Bugün koşarsan bugünden itibaren verin olur; bir ay beklersen
bir ay kaybedersin.

```bash
YT_CLIENT_ID='...' YT_CLIENT_SECRET='...' YT_REFRESH_TOKEN='...' \
  node seyirde/scripts/setup-reach-jobs.mjs
```

### 9. Geçmişi geriye dönük çek

Analytics verisi (izlenme, retention, trafik) kanalın başından beri
alınabiliyor. Bir kez yerelden:

```bash
node seyirde/scripts/collect.mjs --backfill
git add seyirde/data && git commit -m "seyirde: gecmis veri" && git push
```

### 10. Workflow'u varsayılan dala taşı — yoksa cron hiç çalışmaz

GitHub'da zamanlanmış workflow'lar **yalnızca deponun varsayılan dalındaki**
dosyadan çalışır. `workflow_dispatch` ("Run workflow" butonu) da workflow
dosyasının varsayılan dalda bulunmasını gerektirir.

Bu deponun varsayılan dalı şu an `claude/tavla-game-rules-nnhd7x`. Yani
`seyirde` dalı birleştirilmeden otomatik toplama **başlamaz**. İki seçenek:

- **Birleştir** (önerilen): https://github.com/aligokceyilmaz/reversegammon/compare/claude/tavla-game-rules-nnhd7x...claude/gifted-dijkstra-3qyipe
- Ya da varsayılan dalı değiştir:
  https://github.com/aligokceyilmaz/reversegammon/settings/branches

Birleştirdikten sonra ilk koşuyu elle tetikle:
https://github.com/aligokceyilmaz/reversegammon/actions/workflows/seyirde-collect.yml

Sonrasında her gün 10:00 UTC'de kendi çalışır.

### İşe yarayan diğer linkler

- Google hesabının uygulama izinleri (token sıfırlamak için):
  https://myaccount.google.com/permissions
- API kota kullanımı: https://console.cloud.google.com/apis/dashboard
- YouTube Studio analytics (elle CSV export için): https://studio.youtube.com

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
