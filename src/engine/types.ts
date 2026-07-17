/** Oyuncular: 0 = Beyaz, 1 = Siyah */
export type Player = 0 | 1;

/**
 * Bir hanedeki pul kulesi, alttan üste sıralı.
 * Örn. [0, 1, 1] = altta beyaz (kilitli), üstünde iki siyah.
 */
export type Stack = Player[];

export type Move =
  | { type: 'place'; die: number; to: number } // elden tahtaya yerleştirme
  | { type: 'move'; die: number; from: number; to: number } // tahtada ilerletme
  | { type: 'bearoff'; die: number; from: number }; // toplama

export interface GameState {
  /**
   * 24 hane. İndeks Beyaz'ın yönünde artar:
   * Beyaz 0→23 yönünde ilerler, 0-5 Beyaz'ın başlangıç bölgesi, 18-23 toplama bölgesi.
   * Siyah 23→0 yönünde ilerler, 18-23 Siyah'ın başlangıç bölgesi, 0-5 toplama bölgesi.
   */
  points: Stack[];
  /** Henüz tahtaya girmemiş (eldeki) pul sayıları */
  hand: [number, number];
  /** Toplanmış pul sayıları */
  borneOff: [number, number];
  turn: Player;
  /** Bu turda henüz oynanmamış zar değerleri (çiftte 4 adet) */
  dice: number[];
  /** Atılan zar (gösterim için); null = henüz atılmadı */
  rolled: [number, number] | null;
  winner: Player | null;
}
