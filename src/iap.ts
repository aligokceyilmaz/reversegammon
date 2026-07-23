import { Platform } from 'react-native';
import { setPro } from './profile';

// ---------------------------------------------------------------------------
// Pro üyelik (tek seferlik, non-consumable satın alma): reklamsız + tüm temalar.
// - Yalnızca gerçek cihaz build'inde çalışır; Expo Go ve web'de no-op.
// - expo-iap'in tipleri karmaşık (Nitro) olduğundan modül sınırında `any`
//   kullanıyoruz; davranış cihazda App Store sandbox hesabıyla doğrulanır.
// ---------------------------------------------------------------------------

export const PRO_SKU = 'com.alvat.backgammon.pro';

let iap: any = null;
function getIap(): any {
  if (iap !== null) return iap;
  if (Platform.OS === 'web') {
    iap = false;
    return false;
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    iap = require('expo-iap');
  } catch {
    iap = false;
  }
  return iap;
}

let started = false;
let onChange: (() => void) | null = null;

async function grantPro(): Promise<void> {
  await setPro(true);
  onChange?.();
}

/** Açılışta / menüde bir kez: mağaza bağlantısı + satın alma dinleyicileri */
export async function initIap(onProChange?: () => void): Promise<void> {
  if (onProChange) onChange = onProChange;
  const m = getIap();
  if (!m || started) return;
  started = true;
  try {
    await m.initConnection();
    m.purchaseUpdatedListener(async (purchase: { productId?: string }) => {
      if (purchase?.productId === PRO_SKU) {
        try {
          await m.finishTransaction({ purchase, isConsumable: false });
        } catch {
          // yine de sahiplik verildi
        }
        await grantPro();
      }
    });
    m.purchaseErrorListener(() => {
      // kullanıcı iptal etti / hata — sessizce geç
    });
  } catch {
    // mağaza yoksa sessizce geç
  }
}

/** "Pro'ya Yükselt" — satın alma akışını başlatır (sonuç dinleyiciye düşer) */
export async function buyPro(): Promise<void> {
  const m = getIap();
  if (!m) return;
  try {
    await m.requestPurchase({
      request: { apple: { sku: PRO_SKU }, google: { skus: [PRO_SKU] } },
      type: 'in-app',
    });
  } catch {
    // sessizce geç
  }
}

/** Satın alımları geri yükler; Pro bulunursa true döner */
export async function restorePro(): Promise<boolean> {
  const m = getIap();
  if (!m) return false;
  try {
    const purchases = await m.getAvailablePurchases();
    if (
      Array.isArray(purchases) &&
      purchases.some((p: { productId?: string }) => p?.productId === PRO_SKU)
    ) {
      await grantPro();
      return true;
    }
  } catch {
    // sessizce geç
  }
  return false;
}
