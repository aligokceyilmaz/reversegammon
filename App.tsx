import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useState } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { loadProfile } from './src/profile';
import { initSound } from './src/sound';
import { initAds } from './src/ads';
import { I18nProvider } from './src/i18n';
import { GameScreen } from './src/ui/GameScreen';
import type { GameMode, OnlineCtx } from './src/ui/GameScreen';
import { MenuScreen } from './src/ui/MenuScreen';
import { OnlineLobby } from './src/ui/OnlineLobby';

type Screen =
  | { kind: 'menu' }
  | { kind: 'lobby' }
  | { kind: 'game'; mode: GameMode; matchLen: number; online?: OnlineCtx };

export default function App() {
  const [screen, setScreen] = useState<Screen>({ kind: 'menu' });

  useEffect(() => {
    loadProfile().then((p) => initSound(p.muted));
    // Reklam SDK'sını açılıştan birkaç saniye sonra başlat: soğuk açılışı
    // (ve inceleme ortamındaki ağ beklemesini) etkilemesin.
    const adTimer = setTimeout(() => initAds(), 3000);
    return () => clearTimeout(adTimer);
  }, []);

  return (
    <SafeAreaProvider>
      <I18nProvider>
      <StatusBar hidden />
      {screen.kind === 'menu' && (
        <MenuScreen
          onPlay={(mode, matchLen) => {
            if (mode === 'online') setScreen({ kind: 'lobby' });
            else setScreen({ kind: 'game', mode, matchLen });
          }}
        />
      )}
      {screen.kind === 'lobby' && (
        <OnlineLobby
          onCancel={() => setScreen({ kind: 'menu' })}
          onMatched={(result, opponent, uid) =>
            setScreen({
              kind: 'game',
              mode: 'online',
              matchLen: 1,
              online: {
                gameId: result.gameId,
                seat: result.seat,
                uid,
                opponent,
              },
            })
          }
        />
      )}
      {screen.kind === 'game' && (
        <GameScreen
          mode={screen.mode}
          matchLen={screen.matchLen}
          online={screen.online}
          onExit={() => setScreen({ kind: 'menu' })}
        />
      )}
      </I18nProvider>
    </SafeAreaProvider>
  );
}
