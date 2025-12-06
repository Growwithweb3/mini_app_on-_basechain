// Game Canvas component - handles HTML5 Canvas rendering

import React, { useRef, useEffect } from 'react';
import { GameEngine } from '@/lib/game/GameEngine';

interface GameCanvasProps {
  gameEngine: GameEngine;
  width: number;
  height: number;
}

export const GameCanvas: React.FC<GameCanvasProps> = ({
  gameEngine,
  width,
  height,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationFrameRef = useRef<number>();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Game loop
    const gameLoop = () => {
      gameEngine.update();
      gameEngine.draw(ctx);
      animationFrameRef.current = requestAnimationFrame(gameLoop);
    };

    gameLoop();

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [gameEngine]);

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      className="border-2 border-blue-500 rounded-lg"
      style={{ display: 'block' }}
    />
  );
};

