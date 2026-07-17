import { StatusBar } from 'expo-status-bar';
import React, { useState } from 'react';
import { GameScreen } from './src/ui/GameScreen';
import { MenuScreen } from './src/ui/MenuScreen';

export default function App() {
  const [screen, setScreen] = useState<'menu' | 'game'>('menu');
  return (
    <>
      <StatusBar hidden />
      {screen === 'menu' ? (
        <MenuScreen onPlay={() => setScreen('game')} />
      ) : (
        <GameScreen onExit={() => setScreen('menu')} />
      )}
    </>
  );
}
