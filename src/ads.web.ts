// Web'de reklam yok: Metro bu dosyayı (.web) native modül yerine paketler,
// böylece web derlemesi react-native-google-mobile-ads'i çözmeye çalışmaz.
export function initAds(): void {}
export function showInterstitial(): boolean {
  return false;
}
