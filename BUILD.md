# ALVAT — Build ve Mağaza Kılavuzu

Bu adımlar **senin Mac'inde** çalıştırılır (Expo Go değil; gerçek uygulama build'i).
Reklam, Pro satın alma ve Game Center gibi özellikler yalnızca bu build'lerde
çalışır — Expo Go'da çalışmaz.

## 0. Hazırlık (bir kere)

```bash
cd ~/reversegammon
npm install -g eas-cli   # yükleme aracı
eas login                # Expo hesabınla giriş (yoksa expo.dev'den ücretsiz aç)
```

Sonra projeyi Expo hesabına bağla (proje ID'si oluşturur):

```bash
eas init
```

## 1. Test build'i (kendi telefonunda denemek için)

En hızlı yol — mağazaya gerek yok, telefonuna kurulabilen bir sürüm:

- **Android (APK):**
  ```bash
  eas build --platform android --profile preview
  ```
  Bittiğinde bir indirme linki verir; telefonda aç, APK'yı indir, kur.

- **iOS (kendi cihazın):** Apple Developer hesabı gerekir. İlk build'de EAS
  seni yönlendirir (Apple ID ile giriş, sertifikaları otomatik oluşturur):
  ```bash
  eas build --platform ios --profile preview
  ```
  iOS'ta cihaza kurmak için cihazını kaydetmen gerekebilir; EAS adım adım sorar.

## 2. Mağaza build'i ve gönderim

- **App Store (TestFlight/yayın):**
  ```bash
  eas build --platform ios --profile production
  eas submit --platform ios --profile production
  ```
- **Google Play:**
  ```bash
  eas build --platform android --profile production
  eas submit --platform android --profile production
  ```

`eas submit` ilk kullanımda Apple/Google hesap bilgilerini ister
(App Store Connect API anahtarı / Google Play servis hesabı JSON'u).

## Kimlikler

- Uygulama adı: **ALVAT** (mağaza sayfası adını "BACKGAMMON - ALVAT" yapabilirsin)
- Bundle ID / package: `com.aligokceyilmaz.alvat`
  (Developer hesabındaki App ID ile aynı olmalı; farklıysa app.json'da değiştir,
  bana söyle güncelleyeyim.)

## Sırada ne var (bu build alındıktan sonra)

- **AdMob reklam** (oyun arası tam ekran video) — gerçek build'de test edilir
- **Pro satın alma** (reklamsız + temalar) — App Store / Play içi satın alma
- **Game Center / Google Play Games** girişi

Bunları ilk başarılı build'den sonra sırayla ekleyeceğiz.
