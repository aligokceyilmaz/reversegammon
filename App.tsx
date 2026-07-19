import { StatusBar } from 'expo-status-bar';
import React, { useState } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GameScreen } from './src/ui/GameScreen';
import type { GameMode } from './src/ui/GameScreen';
import { MenuScreen } from './src/ui/MenuScreen';

export default function App() {
  const [screen, setScreen] = useState<
    'menu' | { mode: GameMode; matchLen: number }
  >('menu');
  return (
    <SafeAreaProvider>
      <StatusBar hidden />
      {screen === 'menu' ? (
        <MenuScreen onPlay={(mode, matchLen) => setScreen({ mode, matchLen })} />
      ) : (
        <GameScreen
          mode={screen.mode}
          matchLen={screen.matchLen}
          onExit={() => setScreen('menu')}
        />
      )}
    </SafeAreaProvider>
  );
}
