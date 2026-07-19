import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'alvat:profile';
const OLD_KEY = 'r3v3rs3:profile'; // eski isimden geçiş

export interface Profile {
  name: string;
  /** Seçilen avatar (emoji) */
  avatar: string;
  /** Bilgisayara karşı oynanan toplam oyun */
  aiGames: number;
  /** Bilgisayara karşı kazanılan oyun */
  aiWins: number;
}

export const emptyProfile: Profile = {
  name: '',
  avatar: '',
  aiGames: 0,
  aiWins: 0,
};

/** Seçilebilir avatarlar (üst sıra kadın, alt sıra erkek) */
export const AVATARS = ['👩', '👩‍🦰', '👱‍♀️', '👧', '👨', '🧔', '👱‍♂️', '👦'];

export async function loadProfile(): Promise<Profile> {
  try {
    const raw =
      (await AsyncStorage.getItem(KEY)) ?? (await AsyncStorage.getItem(OLD_KEY));
    if (!raw) return { ...emptyProfile };
    return { ...emptyProfile, ...JSON.parse(raw) };
  } catch {
    return { ...emptyProfile };
  }
}

export async function saveProfile(p: Profile): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    // depolama hatası oyunu engellemesin
  }
}

/** AI'ya karşı biten bir oyunun sonucunu işler */
export async function recordAiResult(won: boolean): Promise<void> {
  const p = await loadProfile();
  p.aiGames += 1;
  if (won) p.aiWins += 1;
  await saveProfile(p);
}

export function winRate(p: Profile): number {
  return p.aiGames === 0 ? 0 : Math.round((p.aiWins / p.aiGames) * 100);
}
