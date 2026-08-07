import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

// ---------------------------------------------------------------------------
// Çoklu dil (i18n). Varsayılan: İngilizce. Şimdilik EN + TR; ileride yeni
// diller sadece DICTS'e eklenerek genişletilir.
// ---------------------------------------------------------------------------

export type Lang = 'en' | 'tr';
export const LANGS: Lang[] = ['en', 'tr'];
const LANG_KEY = 'alvat:lang';

/** Dilin kendi adı (dil seçici butonunda gösterilir) */
export const LANG_NATIVE: Record<Lang, string> = {
  en: 'English',
  tr: 'Türkçe',
};

type Dict = Record<string, string>;
type Params = Record<string, string | number>;

const en: Dict = {
  // Menü
  'menu.subtitle': 'Reverse backgammon · Lock · First to bear off wins',
  'menu.chooseAvatar': 'Choose your avatar and name',
  'menu.namePlaceholder': 'e.g. AliG',
  'menu.save': 'Save',
  'menu.change': 'edit',
  'menu.statsAi': '🤖 Computer: {games} games · {wins} wins · {rate}%',
  'menu.statsOnline': '🌍 Online: {games} games · {wins} wins · {rate}%',
  'menu.series': 'Series:',
  'menu.seriesGameOne': '{n} Game',
  'menu.seriesGameMany': '{n} Games',
  'menu.online': '🌍 Play Online',
  'menu.single': '🤖 Single Player',
  'menu.local': '👥 2 Players (same phone)',
  'menu.themes': '🎨 Themes',
  'menu.howto': '❓ How to Play?',

  // Temalar
  'themes.title': '🎨 Board Themes',
  'themes.hint': 'Pro themes unlock with membership. (Toggle Pro for testing)',
  'themes.proLocked': '🔒 PRO',
  'themes.proUnlocked': '⭐ PRO',
  'themes.proOn': '🟢 Pro: ON (test)',
  'themes.proOff': '⚪ Pro: off — tap to enable (test)',
  'pro.upgrade': '⭐ Upgrade to Pro',
  'pro.upgradeSub': 'Remove ads + unlock all themes',
  'pro.restore': 'Restore Purchases',
  'pro.active': '🟢 Pro active — ads off, all themes unlocked',
  'pro.restoredTitle': 'Restored',
  'pro.restoredBody': 'Your Pro membership has been restored.',
  'pro.noneTitle': 'Not found',
  'pro.noneBody': 'No Pro purchase was found on this account.',
  'theme.classic': 'Classic Wood',
  'theme.neon': 'Neon',
  'theme.obsidian': 'Obsidian',
  'theme.emerald': 'Emerald',
  'theme.midnight': 'Midnight Blue',
  'theme.crimson': 'Crimson',
  'theme.slate': 'Slate',

  // Nasıl oynanır
  'howto.back': '‹ Back',
  'howto.next': 'Next ›',
  'howto.done': 'Done ✓',
  'howto.p1.title': '1 · Empty Board, Start from the Deck',
  'howto.p1.text':
    'The board starts empty; your 15 checkers wait in the deck on the center bar. Using the dice you bring checkers into YOUR own zone (points 1–6 at the bottom right). E.g. if you roll 5 and 2, you can place a checker on point 5 and one on point 2.',
  'howto.p2.title': '2 · Advance and Combine',
  'howto.p2.text':
    'You can place checkers from your hand one by one, or move by the SUM of the dice in one go. E.g. you roll 5+2: place on point 5 then advance 2 — or place directly 7 points ahead in a single move. Green: first point 5, then 2 beyond it. Doubles work the same: roll 4-4 and you get 4 moves; you can carry the same checker 4+4 or 4+4+4 ahead at once. Placing is not mandatory; you can also advance a checker already on the board.',
  'howto.p3.title': '3 · Lock!',
  'howto.p3.text':
    'If you sit on top of the opponent’s SINGLE checker, you LOCK it: it cannot move until your checker leaves. In the left tower, White has locked Black. A point with 2 opponent checkers stacked is closed to you.',
  'howto.p4.title': '4 · Tower Chain',
  'howto.p4.text':
    'The opponent can also sit on your locking single checker: towers chain up (black-white-black...). The moment there are 2 checkers of the same color on top, that point closes completely and the ones beneath wait.',
  'howto.p5.title': '5 · Bear Off and Win',
  'howto.p5.text':
    'Once all 15 of your checkers reach the far zone (the last 6 points), bearing off begins: checkers leave the board by dice value. The first to bear off all 15 wins the game!',

  // Oyun ekranı
  'game.you': 'You',
  'game.opponent': 'Opponent',
  'game.white': 'White',
  'game.black': 'Black',
  'game.computer': 'Computer',
  'game.youSuffix': '(You)',
  'game.blackComputer': 'Black (Computer)',
  'game.gameCount': 'Game {n}/{len}',
  'game.remainDie': 'Remaining die can’t be played',
  'game.noMove': 'No legal move',
  'game.double': 'DOUBLE! ×4',
  'game.rollDice': '🎲 Roll Dice',
  'game.seconds': '{n} s',
  'game.oppPlaying': '⏳ Opponent is playing…',
  'game.turnPassing': 'turn passes to opponent…',
  'game.paused': '⏸ Paused',
  'game.pausedSub': 'Timer and opponent are waiting',
  'game.resume': '▶ Resume',
  'game.backToMenu': 'Back to Menu',

  // Açılış zarı
  'opening.title': 'Opening Roll',
  'opening.sub': 'Higher roll starts',
  'opening.you': 'YOU',
  'opening.youStart': '🎉 You start!',
  'opening.computerStarts': 'Computer starts',
  'opening.starts': '{name} starts',
  'opening.tie': 'Tie! Roll again.',
  'opening.start': 'Start',
  'opening.rollAgain': 'Roll Again',
  'opening.rollDiceBtn': 'Roll the Dice',

  // Rakip ayrıldı
  'oppLeft.title': '👋 Opponent left',
  'oppLeft.sub': 'Game over.',

  // Oyun sonu
  'over.youWon': '🏆 You won!',
  'over.youLost': '😔 You lost',
  'over.youWonSub': 'You bore off all 15 first.',
  'over.youLostSub': 'The opponent bore off all 15 first.',
  'over.wonSeries': '🏆 {name} won the series!',
  'over.won': '🏆 {name} won!',
  'over.seriesStatus': 'Series: {a} – {b} ({len}-game match)',
  'over.firstToBearOff': 'First to bear off all 15.',
  'over.newSeries': 'New Series',
  'over.nextGame': 'Next Game ({n}/{len})',
  'over.newGame': 'New Game',

  // Oyuncu paneli
  'panel.thinking': 'thinking…',
  'panel.undo': '↩ Undo',
  'panel.borneOff': 'Borne Off',
  'panel.inHand': 'In hand {n}',
  'panel.inHandBar': 'In hand {n} (on bar)',
  'panel.doubleCount': '×4 ({n})',

  // Online lobi
  'online.connecting': 'Connecting…',
  'online.searching': 'Searching for opponent…',
  'online.waiting': 'Waiting for opponent…',
  'online.title': '🌍 Online',
  'online.cancel': 'Cancel',
  'online.error': 'Error: {code} {msg}',
  'online.offline': 'Couldn’t connect. Check your internet connection and try again.',
  'online.back': 'Back',
  'player.default': 'Player',
};

const tr: Dict = {
  // Menü
  'menu.subtitle': 'Ters tavla · Kilitle · İlk toplayan kazanır',
  'menu.chooseAvatar': 'Avatarını ve adını seç',
  'menu.namePlaceholder': 'örn. AliG',
  'menu.save': 'Kaydet',
  'menu.change': 'değiştir',
  'menu.statsAi': '🤖 Bilgisayar: {games} oyun · {wins} galibiyet · %{rate}',
  'menu.statsOnline': '🌍 Online: {games} oyun · {wins} galibiyet · %{rate}',
  'menu.series': 'Seri:',
  'menu.seriesGameOne': '{n} Oyun',
  'menu.seriesGameMany': '{n} Oyun',
  'menu.online': '🌍 Online Oyna',
  'menu.single': '🤖 Tek Kişilik',
  'menu.local': '👥 2 Kişi (aynı telefon)',
  'menu.themes': '🎨 Temalar',
  'menu.howto': '❓ Nasıl Oynanır?',

  // Temalar
  'themes.title': '🎨 Tahta Temaları',
  'themes.hint': 'Pro temalar üyelikle açılır. (Test için Pro’yu aç/kapa)',
  'themes.proLocked': '🔒 PRO',
  'themes.proUnlocked': '⭐ PRO',
  'themes.proOn': '🟢 Pro: AÇIK (test)',
  'themes.proOff': '⚪ Pro: kapalı — açmak için dokun (test)',
  'pro.upgrade': '⭐ Pro’ya Yükselt',
  'pro.upgradeSub': 'Reklamsız + tüm temalar açık',
  'pro.restore': 'Satın Alımları Geri Yükle',
  'pro.active': '🟢 Pro aktif — reklam yok, tüm temalar açık',
  'pro.restoredTitle': 'Geri Yüklendi',
  'pro.restoredBody': 'Pro üyeliğin geri yüklendi.',
  'pro.noneTitle': 'Bulunamadı',
  'pro.noneBody': 'Bu hesapta Pro satın alma bulunamadı.',
  'theme.classic': 'Klasik Ahşap',
  'theme.neon': 'Neon',
  'theme.obsidian': 'Obsidyen',
  'theme.emerald': 'Zümrüt',
  'theme.midnight': 'Gece Mavisi',
  'theme.crimson': 'Bordo',
  'theme.slate': 'Antrasit',

  // Nasıl oynanır
  'howto.back': '‹ Geri',
  'howto.next': 'İleri ›',
  'howto.done': 'Bitti ✓',
  'howto.p1.title': '1 · Boş Tahta, Desteden Başla',
  'howto.p1.text':
    'Tahta boş başlar; 15 pulun ortadaki barın üzerindeki destede bekler. Zar değeriyle pulunu KENDİ bölgene (sağ alttaki 1-6 numaralı haneler) sokarsın. Örn. 5 ve 2 attıysan 5 ve 2 numaralı hanelere birer pul koyabilirsin.',
  'howto.p2.title': '2 · İlerle ve Birleştir',
  'howto.p2.text':
    'Elindeki pulları istersen tek tek, istersen gelen zarların TOPLAMI kadar direkt koyabilirsin. Örn. 5+2 attın: pulunu 5 hanesine koyup 2 ilerletirsin — ya da tek harekette toplam 7 ilerisine koyarsın. Yeşiller: önce 5 hanesi, sonra onun 2 ilerisi. Çift zarda da aynı mantık: 4-4 attıysan 4 hamle hakkın var; aynı pulu 4+4 ya da 4+4+4 ileriye tek seferde taşıyabilirsin. Koymak zorunlu da değil; tahtadaki pulunu da ilerletebilirsin.',
  'howto.p3.title': '3 · Kilitle!',
  'howto.p3.text':
    'Rakibin TEK pulunun üstüne oturursan onu KİLİTLERSİN: üstündeki pul gidene kadar oynayamaz. Soldaki kulede beyaz, siyahı kilitlemiş. Üst üste 2 rakip pulu olan hane ise sana kapalıdır.',
  'howto.p4.title': '4 · Kule Zinciri',
  'howto.p4.text':
    'Kilitleyen tek pulun üstüne rakip de oturabilir: kuleler zincirlenir (siyah-beyaz-siyah...). En üstte aynı renkten 2 pul olduğu anda o hane tamamen kapanır ve alttakiler bekler.',
  'howto.p5.title': '5 · Topla ve Kazan',
  'howto.p5.text':
    '15 pulunun tamamı karşı bölgeye (son 6 hane) ulaşınca toplama başlar: zar değerine göre pullar tahtadan çıkar. 15 pulunu ilk toplayan oyunu kazanır!',

  // Oyun ekranı
  'game.you': 'Sen',
  'game.opponent': 'Rakip',
  'game.white': 'Beyaz',
  'game.black': 'Siyah',
  'game.computer': 'Bilgisayar',
  'game.youSuffix': '(Sen)',
  'game.blackComputer': 'Siyah (Bilgisayar)',
  'game.gameCount': 'Oyun {n}/{len}',
  'game.remainDie': 'Kalan zar oynanamıyor',
  'game.noMove': 'Hamle yapılamıyor',
  'game.double': 'ÇİFT! ×4',
  'game.rollDice': '🎲 Zar At',
  'game.seconds': '{n} sn',
  'game.oppPlaying': '⏳ Rakip oynuyor…',
  'game.turnPassing': 'sıra rakibe geçiyor…',
  'game.paused': '⏸ Duraklatıldı',
  'game.pausedSub': 'Süre ve rakip bekliyor',
  'game.resume': '▶ Devam Et',
  'game.backToMenu': 'Menüye Dön',

  // Açılış zarı
  'opening.title': 'Başlangıç Zarı',
  'opening.sub': 'Yüksek atan oyuna başlar',
  'opening.you': 'SEN',
  'opening.youStart': '🎉 Sen başlıyorsun!',
  'opening.computerStarts': 'Bilgisayar başlıyor',
  'opening.starts': '{name} başlıyor',
  'opening.tie': 'Berabere! Tekrar atın.',
  'opening.start': 'Başla',
  'opening.rollAgain': 'Tekrar At',
  'opening.rollDiceBtn': 'Zarları At',

  // Rakip ayrıldı
  'oppLeft.title': '👋 Rakip ayrıldı',
  'oppLeft.sub': 'Oyun sonlandı.',

  // Oyun sonu
  'over.youWon': '🏆 Kazandın!',
  'over.youLost': '😔 Kaybettin',
  'over.youWonSub': '15 pulunu ilk sen topladın.',
  'over.youLostSub': 'Rakip 15 pulunu önce topladı.',
  'over.wonSeries': '🏆 {name} seriyi kazandı!',
  'over.won': '🏆 {name} kazandı!',
  'over.seriesStatus': 'Seri durumu: {a} – {b} ({len} oyunluk seri)',
  'over.firstToBearOff': '15 pulunu ilk toplayan oldu.',
  'over.newSeries': 'Yeni Seri',
  'over.nextGame': 'Sonraki Oyun ({n}/{len})',
  'over.newGame': 'Yeni Oyun',

  // Oyuncu paneli
  'panel.thinking': 'düşünüyor…',
  'panel.undo': '↩ Geri Al',
  'panel.borneOff': 'Toplanan',
  'panel.inHand': 'Elde {n}',
  'panel.inHandBar': 'Elde {n} pul (barda)',
  'panel.doubleCount': '×4 ({n})',

  // Online lobi
  'online.connecting': 'Bağlanıyor…',
  'online.searching': 'Rakip aranıyor…',
  'online.waiting': 'Rakip bekleniyor…',
  'online.title': '🌍 Online',
  'online.cancel': 'İptal',
  'online.error': 'Hata: {code} {msg}',
  'online.offline': 'Bağlanılamadı. İnternet bağlantını kontrol edip tekrar dene.',
  'online.back': 'Geri',
  'player.default': 'Oyuncu',
};

const DICTS: Record<Lang, Dict> = { en, tr };

/** Verilen dilde bir anahtarı çözer; yoksa İngilizceye, o da yoksa anahtara düşer */
export function translate(lang: Lang, key: string, params?: Params): string {
  let s = DICTS[lang]?.[key] ?? DICTS.en[key] ?? key;
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      s = s.split(`{${k}}`).join(String(v));
    }
  }
  return s;
}

export type TFunc = (key: string, params?: Params) => string;

interface I18nCtx {
  lang: Lang;
  t: TFunc;
  setLang: (l: Lang) => void;
  /** Diğer dile geçiş (şimdilik EN <-> TR) */
  toggleLang: () => void;
}

const Ctx = createContext<I18nCtx>({
  lang: 'en',
  t: (key, params) => translate('en', key, params),
  setLang: () => {},
  toggleLang: () => {},
});

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>('en');

  useEffect(() => {
    AsyncStorage.getItem(LANG_KEY)
      .then((v) => {
        if (v === 'en' || v === 'tr') setLangState(v);
      })
      .catch(() => {});
  }, []);

  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    AsyncStorage.setItem(LANG_KEY, l).catch(() => {});
  }, []);

  const toggleLang = useCallback(() => {
    setLangState((prev) => {
      const next: Lang = prev === 'en' ? 'tr' : 'en';
      AsyncStorage.setItem(LANG_KEY, next).catch(() => {});
      return next;
    });
  }, []);

  const t = useCallback<TFunc>((key, params) => translate(lang, key, params), [lang]);

  return (
    <Ctx.Provider value={{ lang, t, setLang, toggleLang }}>{children}</Ctx.Provider>
  );
}

export function useI18n(): I18nCtx {
  return useContext(Ctx);
}
