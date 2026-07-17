import { StatusBar } from 'expo-status-bar';
import React, { useState } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GameScreen } from './src/ui/GameScreen';
import { MenuScreen } from './src/ui/MenuScreen';

export default function App() {
  const [screen, setScreen] = useState<'menu' | 'game'>('menu');
  return (
    <SafeAreaProvider>
      <StatusBar hidden />
      {screen === 'menu' ? (
        <MenuScreen onPlay={() => setScreen('game')} />
      ) : (
        <GameScreen onExit={() => setScreen('menu')} />
      )}
    </SafeAreaProvider>
  );
}
