// Web'de satın alma yok: Metro bu (.web) dosyayı native modül yerine paketler.
export const PRO_SKU = 'com.alvat.backgammon.pro';
export async function initIap(_onProChange?: () => void): Promise<void> {}
export async function buyPro(): Promise<void> {}
export async function restorePro(): Promise<boolean> {
  return false;
}
