// Welcome Screen component - simple start screen

'use client';

import React from 'react';

interface WelcomeScreenProps {
  onPlayGame: () => void;
}

export const WelcomeScreen: React.FC<WelcomeScreenProps> = ({ onPlayGame }) => {
  return (
    <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-blue-900 via-purple-900 to-black p-4">
      <div className="max-w-md w-full bg-gray-800 rounded-2xl shadow-2xl p-8 border-2 border-blue-500">
        {/* Title */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-white mb-2">Base the Shooter</h1>
          <p className="text-gray-400">2D Shooter Game</p>
        </div>

        {/* Main Message Box */}
        <div className="bg-gradient-to-r from-blue-600 to-purple-600 rounded-xl p-6 mb-6 text-center border-2 border-blue-400 shadow-lg">
          <p className="text-2xl font-bold text-white">
            Prove them Base is best L2
          </p>
        </div>

        {/* Play Game Button */}
        <button
          onClick={onPlayGame}
          className="w-full bg-gradient-to-r from-green-600 to-blue-600 hover:from-green-700 hover:to-blue-700 text-white font-bold py-4 px-6 rounded-lg text-xl transition-all transform hover:scale-105 shadow-lg"
        >
          🎮 Play Game
        </button>

        {/* Footer */}
        <div className="mt-6 text-center">
          <p className="text-gray-500 text-xs">
            Built on Base Network
          </p>
        </div>
      </div>
    </div>
  );
};
