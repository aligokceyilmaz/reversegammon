import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useState } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { loadProfile } from './src/profile';
import { initSound } from './src/sound';
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
  }, []);

  return (
    <SafeAreaProvider>
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
    </SafeAreaProvider>
  );
}
