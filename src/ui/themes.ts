import type { ImageSourcePropType } from 'react-native';
import type { BoardLayout } from './BoardSvg';

export interface BoardTheme {
  id: string;
  name: string;
  /** Pro üyelik gerektiriyor mu? */
  pro: boolean;
  /** Tahta arka plan görseli; null ise vektörel klasik tahta çizilir */
  background: ImageSourcePropType | null;
  /** Özel görselde nokta/pul hizası için kalibrasyon (yoksa klasik düzen) */
  layout?: BoardLayout;
}

export const THEMES: BoardTheme[] = [
  { id: 'classic', name: 'Klasik Ahşap', pro: false, background: null },
  {
    id: 'neon',
    name: 'Neon',
    pro: true,
    background: require('../../assets/themes/neon.png'),
    layout: {
      left: 0.068,
      right: 0.932,
      top: 0.05,
      bottom: 0.94,
      barLeft: 0.452,
      barRight: 0.548,
    },
  },
  {
    id: 'emerald',
    name: 'Zümrüt',
    pro: true,
    background: require('../../assets/themes/emerald.png'),
  },
  {
    id: 'midnight',
    name: 'Gece Mavisi',
    pro: true,
    background: require('../../assets/themes/midnight.png'),
  },
  {
    id: 'crimson',
    name: 'Bordo',
    pro: true,
    background: require('../../assets/themes/crimson.png'),
  },
  {
    id: 'slate',
    name: 'Antrasit',
    pro: true,
    background: require('../../assets/themes/slate.png'),
  },
];

export function getTheme(id: string): BoardTheme {
  return THEMES.find((t) => t.id === id) ?? THEMES[0];
}
