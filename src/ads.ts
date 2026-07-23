import { Platform } from 'react-native';

// ---------------------------------------------------------------------------
// AdMob interstitial (oyunlar arası tam ekran reklam).
// - Yalnızca gerçek cihaz build'inde çalışır; Expo Go ve web'de sessizce no-op.
// - Geliştirmede Google TEST reklamları kullanılır (kendi reklamına tıklamak
//   hesabı askıya aldırır). Production'da aşağıdaki gerçek birim ID'leri gerekir.
// ---------------------------------------------------------------------------

// TODO: AdMob panelinden gelen GERÇEK interstitial birim ID'lerini buraya yaz.
//   iOS App ID (~'li) app.json'daki plugin ayarına; birim ID'leri (/'li) buraya.
const REAL_INTERSTITIAL: { ios: string; android: string } = {
  ios: '', // ör. 'ca-app-pub-XXXXXXXX/ZZZZZZZZ'
  android: '', // ör. 'ca-app-pub-XXXXXXXX/ZZZZZZZZ'
};

type Ads = typeof import('react-native-google-mobile-ads');

let adsMod: Ads | null | false = null;

/** Modülü tembel yükler; yoksa (Expo Go/web) false döner */
function getAds(): Ads | false {
  if (adsMod !== null) return adsMod;
  if (Platform.OS === 'web') {
    adsMod = false;
    return false;
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    adsMod = require('react-native-google-mobile-ads') as Ads;
  } catch {
    adsMod = false;
  }
  return adsMod;
}

function unitId(ads: Ads): string {
  if (__DEV__) return ads.TestIds.INTERSTITIAL;
  const real = Platform.OS === 'ios' ? REAL_INTERSTITIAL.ios : REAL_INTERSTITIAL.android;
  // Gerçek ID henüz girilmemişse güvenli tarafta kal: test reklamı göster.
  return real || ads.TestIds.INTERSTITIAL;
}

let interstitial: ReturnType<Ads['InterstitialAd']['createForAdRequest']> | null =
  null;
let loaded = false;
let started = false;

function preload(ads: Ads): void {
  try {
    interstitial = ads.InterstitialAd.createForAdRequest(unitId(ads), {
      requestNonPersonalizedAdsOnly: true,
    });
    loaded = false;
    interstitial.addAdEventListener(ads.AdEventType.LOADED, () => {
      loaded = true;
    });
    interstitial.addAdEventListener(ads.AdEventType.CLOSED, () => {
      loaded = false;
      preload(ads); // bir sonraki için yeniden yükle
    });
    interstitial.addAdEventListener(ads.AdEventType.ERROR, () => {
      loaded = false;
    });
    interstitial.load();
  } catch {
    // sessizce geç
  }
}

/** Uygulama açılışında bir kez: SDK'yı başlat ve ilk reklamı ön-yükle */
export function initAds(): void {
  if (started) return;
  started = true;
  const ads = getAds();
  if (!ads) return;
  try {
    ads.default().initialize().then(() => preload(ads)).catch(() => {});
  } catch {
    // sessizce geç
  }
}

/** Hazır bir interstitial varsa gösterir. Döner: gösterildi mi */
export function showInterstitial(): boolean {
  const ads = getAds();
  if (!ads || !interstitial || !loaded) return false;
  try {
    interstitial.show();
    return true;
  } catch {
    return false;
  }
}
