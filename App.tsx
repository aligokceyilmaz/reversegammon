import { StatusBar } from 'expo-status-bar';
import React, { useState } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GameScreen } from './src/ui/GameScreen';
import type { GameMode } from './src/ui/GameScreen';
import { MenuScreen } from './src/ui/MenuScreen';

export default function App() {
  const [screen, setScreen] = useState<'menu' | GameMode>('menu');
  return (
    <SafeAreaProvider>
      <StatusBar hidden />
      {screen === 'menu' ? (
        <MenuScreen onPlay={(mode) => setScreen(mode)} />
      ) : (
        <GameScreen mode={screen} onExit={() => setScreen('menu')} />
      )}
    </SafeAreaProvider>
  );
}
