# ALVAT — Ters Tavla 🎲

Klasik tavla ekipmanıyla oynanan ama **tersten** işleyen bir mobil oyun: tahta boş başlar, pullar elden oyuna sokulur, taş kırmak yerine rakibin pulunun **üstüne oturup kilitlersin**. 15 pulunu karşıya taşıyıp ilk toplayan kazanır.

Kuralların tamamı için: [RULES.md](./RULES.md)

## Özellikler

- iOS + Android (React Native / Expo, tek kod tabanı)
- Tek kişilik (bilgisayara karşı, sezgisel AI) ve aynı cihazda 2 kişilik (pass-and-play)
- Kilit/kule mekaniği görsel olarak kule diziliminde gösterilir
- Zorunlu hamle kuralları motor tarafından uygulanır (en çok zar oynama, tek zar oynanabiliyorsa büyüğü)
- Tur içi Geri Al, otomatik pas, açılış zarı

## Çalıştırma

```bash
npm install
npx expo start
```

- **Telefonda:** [Expo Go](https://expo.dev/go) uygulamasını indir, terminaldeki QR kodu okut. (Telefon ve bilgisayar aynı Wi-Fi ağında olmalı.)
- **Tarayıcıda:** `npx expo start --web`

## Geliştirme

```bash
npm test          # oyun motoru birim testleri (vitest)
npx tsc --noEmit  # tip kontrolü
```

Proje yapısı:

- `src/engine/` — UI'dan bağımsız oyun motoru (kurallar, hamle üretimi, kilit mantığı, AI) + testleri
- `src/ui/` — tahta çizimi (react-native-svg), oyun ekranı, menü
- `assets/tema-mevcut.png` — mevcut oyun ekranının görüntüsü (tema tasarımı için referans; yeni tasarım bu dosya üzerine yüklenip uygulanır)

## Yol Haritası (v2+)

- [ ] **Modern tema** — kullanıcı `assets` klasörüne tasarım görseli yükleyecek, arka plan ve tahta ona göre giydirilecek
- [ ] **Online mod (Firebase)** — menüye Online seçeneği; anonim giriş + canlı rastgele eşleşme + basit istatistik (oyun/galibiyet/%)
- [ ] **Tablet düzeni** — telefon sonrası tablete özel yerleşim
- [ ] **EAS build + mağaza** — Apple Developer ve Google Play hesapları hazır; "BACKGAMMON - ALVAT" adıyla yükleme
- [ ] **Reklam** — oyun araları tam ekran video (AdMob, build aşamasında; Expo Go'da çalışmaz)
- [ ] **Pro üyelik** — reklamsız oynama + ekstra özellikler (avatar paketi vb.), reklam istemeyenler için
