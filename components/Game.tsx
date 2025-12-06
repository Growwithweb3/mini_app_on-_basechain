// Main Game component - manages game state and controls

'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { GameEngine } from '@/lib/game/GameEngine';
import { GameCanvas } from './GameCanvas';
import { WelcomeScreen } from './WelcomeScreen';
import { WalletButton } from './WalletButton';
import { achievementManager } from '@/lib/achievements/AchievementManager';
import { settingsManager } from '@/lib/settings/SettingsManager';
import { leaderboardManager } from '@/lib/leaderboard/LeaderboardManager';
import { soundManager } from '@/lib/audio/SoundManager';
import { walletManager } from '@/lib/blockchain/wallet';
import { nftManager } from '@/lib/blockchain/nft';
import { getNFTContractAddress, ACHIEVEMENT_NFT_ABI } from '@/lib/blockchain/config';

const CANVAS_WIDTH = 800;
const CANVAS_HEIGHT = 600;

export const Game: React.FC = () => {
  const [showWelcome, setShowWelcome] = useState(true);
  const [showTutorial, setShowTutorial] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showAchievements, setShowAchievements] = useState(false);
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  const [gameEngine] = useState(() => new GameEngine(CANVAS_WIDTH, CANVAS_HEIGHT));
  const [keys, setKeys] = useState<Set<string>>(new Set());
  const gameEngineRef = useRef(gameEngine);
  const [highScore, setHighScore] = useState<number>(0);
  const [isNewHighScore, setIsNewHighScore] = useState(false);
  const [screenShake, setScreenShake] = useState({ x: 0, y: 0, intensity: 0 });
  const previousHealthRef = useRef<number>(gameEngine.gameState.playerHealth);
  const [levelTransition, setLevelTransition] = useState({ show: false, level: 1, progress: 0 });
  const previousLevelRef = useRef<number>(gameEngine.gameState.level);
  const [newAchievements, setNewAchievements] = useState<any[]>([]);
  const [fps, setFps] = useState(0);
  const [powerUpsCollected, setPowerUpsCollected] = useState(0);
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [mintingNFT, setMintingNFT] = useState<string | null>(null); // achievementId being minted
  const fpsRef = useRef({ frames: 0, lastTime: Date.now() });

  // Initialize game systems
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const savedHighScore = localStorage.getItem('base-shooter-highscore');
      if (savedHighScore) {
        setHighScore(parseInt(savedHighScore, 10));
      }
      
      // Start background music (will resume audio context on first user interaction)
      // Don't start automatically to avoid autoplay policy warnings
      
      // Register achievement callback
      achievementManager.onUnlock(async (achievement) => {
        setNewAchievements((prev: any[]) => [...prev, achievement]);
        setTimeout(() => {
          setNewAchievements((prev: any[]) => prev.filter((a: any) => a.id !== achievement.id));
        }, 5000);

        // Auto-mint NFT if wallet is connected
        if (walletAddress && walletManager.isConnected()) {
          try {
            await handleMintAchievementNFT(achievement);
          } catch (error) {
            console.error('Failed to auto-mint NFT:', error);
            // Don't show error to user, they can mint manually later
          }
        }
      });
      
      // Track power-up collections
      (gameEngine as any).onPowerUpCollected = () => {
        setPowerUpsCollected(prev => prev + 1);
      };

      // Configure NFT manager if contract address is set
      const contractAddress = getNFTContractAddress();
      if (contractAddress && contractAddress !== '0x0000000000000000000000000000000000000000') {
        nftManager.setConfig({
          contractAddress,
          contractABI: ACHIEVEMENT_NFT_ABI,
        });
      }
    }
    
    return () => {
      soundManager.stopBackgroundMusic();
    };
  }, [walletAddress]);

  // FPS counter
  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      const elapsed = now - fpsRef.current.lastTime;
      if (elapsed >= 1000) {
        setFps(fpsRef.current.frames);
        fpsRef.current.frames = 0;
        fpsRef.current.lastTime = now;
      } else {
        fpsRef.current.frames++;
      }
    }, 100);
    return () => clearInterval(interval);
  }, []);

  // Check for new high score when game ends
  useEffect(() => {
    if (gameEngine.gameState.isGameOver) {
      const currentScore = gameEngine.gameState.score;
      if (currentScore > highScore) {
        setHighScore(currentScore);
        setIsNewHighScore(true);
        if (typeof window !== 'undefined') {
          localStorage.setItem('base-shooter-highscore', currentScore.toString());
        }
      } else {
        setIsNewHighScore(false);
      }
    }
  }, [gameEngine.gameState.isGameOver, gameEngine.gameState.score, highScore]);

  // Update ref when game engine changes
  useEffect(() => {
    gameEngineRef.current = gameEngine;
  }, [gameEngine]);

  // Keyboard controls
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowUp' || e.key === 'ArrowDown' || e.key === 'ArrowRight') {
        e.preventDefault();
        setKeys((prev) => new Set(prev).add(e.key));
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'ArrowUp' || e.key === 'ArrowDown' || e.key === 'ArrowRight') {
        setKeys((prev) => {
          const newKeys = new Set(prev);
          newKeys.delete(e.key);
          return newKeys;
        });
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  // Handle player movement and shooting
  useEffect(() => {
    const interval = setInterval(() => {
      const engine = gameEngineRef.current;
      if (engine.gameState.isGameOver || engine.gameState.isPaused) {
        return;
      }

      // Movement
      if (keys.has('ArrowUp')) {
        engine.base.moveUp(CANVAS_HEIGHT, engine.baseSpeedMultiplier);
      }
      if (keys.has('ArrowDown')) {
        engine.base.moveDown(CANVAS_HEIGHT, engine.baseSpeedMultiplier);
      }

      // Shooting (handled separately to avoid rapid fire)
    }, 16); // ~60fps

    return () => clearInterval(interval);
  }, [keys]);

  // Handle shooting with ArrowRight - reduced fire rate
  useEffect(() => {
    let shootInterval: NodeJS.Timeout;
    
    if (keys.has('ArrowRight')) {
      const engine = gameEngineRef.current;
      if (!engine.gameState.isGameOver && !engine.gameState.isPaused) {
        engine.shoot();
        // Allow shooting every 350ms (reduced from 200ms for better balance)
        shootInterval = setInterval(() => {
          if (keys.has('ArrowRight') && !engine.gameState.isGameOver && !engine.gameState.isPaused) {
            engine.shoot();
          }
        }, 1500);
      }
    }

    return () => {
      if (shootInterval) {
        clearInterval(shootInterval);
      }
    };
  }, [keys]);

  // Mobile controls
  const handleMoveUp = useCallback(() => {
    gameEngine.base.moveUp(CANVAS_HEIGHT, gameEngine.baseSpeedMultiplier);
  }, [gameEngine]);

  const handleMoveDown = useCallback(() => {
    gameEngine.base.moveDown(CANVAS_HEIGHT, gameEngine.baseSpeedMultiplier);
  }, [gameEngine]);

  const lastShootTimeRef = useRef<number>(0);
  const SHOOT_COOLDOWN = 1500; 

  const handleShoot = useCallback(() => {
    const now = Date.now();
    if (
      !gameEngine.gameState.isGameOver && 
      !gameEngine.gameState.isPaused &&
      now - lastShootTimeRef.current >= SHOOT_COOLDOWN
    ) {
      lastShootTimeRef.current = now;
      gameEngine.shoot();
    }
  }, [gameEngine]);

  const [resetKey, setResetKey] = useState(0);
  
  const handleReset = useCallback(() => {
    gameEngine.reset();
    setIsNewHighScore(false);
    // Force re-render by updating key
    setResetKey(prev => prev + 1);
    // Force keys state update to trigger re-render
    setKeys(new Set());
  }, [gameEngine]);

  const handlePause = useCallback(() => {
    gameEngine.gameState.isPaused = !gameEngine.gameState.isPaused;
    // Force re-render
    setKeys((prev) => new Set(prev));
  }, [gameEngine]);

  // Level transition animation
  useEffect(() => {
    const currentLevel = gameEngine.gameState.level;
    if (currentLevel > previousLevelRef.current && !gameEngine.gameState.isGameOver) {
      // Level increased - show transition
      setLevelTransition({ show: true, level: currentLevel, progress: 0 });
      
      // Animate transition
      let progress = 0;
      const duration = 2000; // 2 seconds
      const startTime = Date.now();
      
      const animate = () => {
        const elapsed = Date.now() - startTime;
        progress = Math.min(elapsed / duration, 1);
        
        setLevelTransition({ show: true, level: currentLevel, progress });
        
        if (progress < 1) {
          requestAnimationFrame(animate);
        } else {
          // Hide transition after animation
          setTimeout(() => {
            setLevelTransition({ show: false, level: currentLevel, progress: 0 });
          }, 500);
        }
      };
      
      requestAnimationFrame(animate);
    }
    previousLevelRef.current = currentLevel;
  }, [gameEngine.gameState.level, gameEngine.gameState.isGameOver]);

  // Screen shake effect when taking damage
  useEffect(() => {
    const currentHealth = gameEngine.gameState.playerHealth;
    if (currentHealth < previousHealthRef.current && !gameEngine.gameState.isGameOver) {
      // Player took damage - trigger screen shake
      const intensity = 15;
      setScreenShake({ x: 0, y: 0, intensity });
      
      // Animate shake
      let shakeFrame = 0;
      const shakeDuration = 10; // frames
      const shakeInterval = setInterval(() => {
        shakeFrame++;
        if (shakeFrame >= shakeDuration) {
          setScreenShake({ x: 0, y: 0, intensity: 0 });
          clearInterval(shakeInterval);
        } else {
          const progress = shakeFrame / shakeDuration;
          const currentIntensity = intensity * (1 - progress);
          const x = (Math.random() - 0.5) * currentIntensity;
          const y = (Math.random() - 0.5) * currentIntensity;
          setScreenShake({ x, y, intensity: currentIntensity });
        }
      }, 16); // ~60fps
      
      return () => clearInterval(shakeInterval);
    }
    previousHealthRef.current = currentHealth;
  }, [gameEngine.gameState.playerHealth, gameEngine.gameState.isGameOver]);

  // Handle NFT minting for achievements
  const handleMintAchievementNFT = async (achievement: any) => {
    if (!walletAddress || !walletManager.isConnected()) {
      throw new Error('Wallet not connected');
    }

    if (mintingNFT === achievement.id) {
      return; // Already minting
    }

    setMintingNFT(achievement.id);

    try {
      // Check if already minted
      const alreadyMinted = await nftManager.isAchievementMinted(achievement.id, walletAddress);
      if (alreadyMinted) {
        setMintingNFT(null);
        alert('This achievement NFT has already been minted!');
        return;
      }

      // Use the achievement image from public/images
      const imageUrl = '/images/I trust on base.png'; // Your achievement image
      
      // For IPFS, we'll use a gateway URL or upload the image
      // For now, using a public URL - you can enhance this to upload to IPFS
      const imageIpfsHash = imageUrl; // Replace with IPFS hash after uploading

      const result = await nftManager.mintAchievement(
        achievement.id,
        achievement.name,
        achievement.description,
        imageIpfsHash,
        gameEngine.gameState.level,
        gameEngine.gameState.score
      );

      console.log('NFT minted successfully:', result);
      setMintingNFT(null);
      
      // Show success notification
      alert(`🎉 Achievement NFT minted! View on BaseScan: https://basescan.org/tx/${result.txHash}`);
    } catch (error: any) {
      console.error('Error minting NFT:', error);
      setMintingNFT(null);
      if (error.message?.includes('rejected')) {
        alert('Transaction was rejected');
      } else {
        alert(`Failed to mint NFT: ${error.message || 'Unknown error'}`);
      }
      throw error;
    }
  };

  // Calculate health percentage
  const healthPercent = (gameEngine.gameState.playerHealth / gameEngine.gameState.maxPlayerHealth) * 100;
  const levelTimeRemaining = Math.max(
    0,
    Math.ceil((gameEngine.gameState.levelDuration - (Date.now() - gameEngine.gameState.levelStartTime)) / 1000)
  );

  // Show welcome screen first
  if (showWelcome) {
    return (
      <WelcomeScreen
        onPlayGame={() => {
          const settings = settingsManager.getSettings();
          if (settings.showFPS) {
            // FPS counter will be shown
          }
          setShowWelcome(false);
          // Check if first time - show tutorial
          const hasPlayedBefore = localStorage.getItem('base-shooter-has-played');
          if (!hasPlayedBefore) {
            setShowTutorial(true);
            localStorage.setItem('base-shooter-has-played', 'true');
          }
        }}
      />
    );
  }

  // Show tutorial
  if (showTutorial) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-900 text-white p-4">
        <div className="max-w-2xl w-full bg-gray-800 rounded-xl p-8 border-2 border-blue-500">
          <h2 className="text-3xl font-bold mb-6 text-center">How to Play</h2>
          <div className="space-y-4 mb-6">
            <div className="bg-gray-700 p-4 rounded-lg">
              <h3 className="font-bold text-lg mb-2">🎮 Controls</h3>
              <ul className="list-disc list-inside space-y-1 text-gray-300">
                <li><strong>Arrow Up/Down:</strong> Move Base vertically</li>
                <li><strong>Arrow Right:</strong> Shoot bullets</li>
                <li><strong>Space:</strong> Pause game</li>
              </ul>
            </div>
            <div className="bg-gray-700 p-4 rounded-lg">
              <h3 className="font-bold text-lg mb-2">🎯 Objective</h3>
              <p className="text-gray-300">
                Survive through 3 levels, defeat enemies, and achieve the highest score possible!
              </p>
            </div>
            <div className="bg-gray-700 p-4 rounded-lg">
              <h3 className="font-bold text-lg mb-2">⚡ Power-ups</h3>
              <ul className="list-disc list-inside space-y-1 text-gray-300">
                <li><strong>💨 Speed Boost:</strong> Move faster</li>
                <li><strong>🔥 Rapid Fire:</strong> Shoot faster</li>
                <li><strong>🛡️ Shield:</strong> Block one hit</li>
                <li><strong>✨ Multi-Shot:</strong> Shoot 3 bullets at once</li>
              </ul>
            </div>
            <div className="bg-gray-700 p-4 rounded-lg">
              <h3 className="font-bold text-lg mb-2">🏆 Tips</h3>
              <ul className="list-disc list-inside space-y-1 text-gray-300">
                <li>Kill enemies quickly to build combos for bonus points</li>
                <li>Collect power-ups when they appear</li>
                <li>Level 3 enemies are tougher - be careful!</li>
                <li>Complete all 3 levels to win!</li>
              </ul>
            </div>
          </div>
          <button
            onClick={() => setShowTutorial(false)}
            className="w-full bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white font-bold py-3 px-6 rounded-lg text-xl transition-all"
          >
            Start Playing!
          </button>
        </div>
      </div>
    );
  }

  // Resume audio on first user interaction
  const handleUserInteraction = useCallback(async () => {
    await soundManager.resumeAudioContext();
    if (!soundManager.getMusicEnabled()) {
      soundManager.setMusicEnabled(true);
    }
  }, []);

  return (
    <div className="flex items-start justify-center min-h-screen bg-gray-900 p-4 overflow-hidden">
      <div className="flex gap-4 max-w-[1400px] w-full">
        {/* Left Sidebar - Controls */}
        <div className="flex-shrink-0 w-64 space-y-4">
          {/* Wallet Connection */}
          <div className="bg-gray-800 rounded-lg p-4">
            <WalletButton
              onConnect={async (address) => {
                await handleUserInteraction();
                setWalletAddress(address);
                // Configure NFT manager with contract address (set after deployment)
                const contractAddress = getNFTContractAddress();
                if (contractAddress && contractAddress !== '0x0000000000000000000000000000000000000000') {
                  nftManager.setConfig({
                    contractAddress,
                    contractABI: ACHIEVEMENT_NFT_ABI,
                  });
                }
              }}
              onDisconnect={() => {
                setWalletAddress(null);
              }}
            />
          </div>

          {/* Game Controls */}
          <div className="bg-gray-800 rounded-lg p-4 text-white space-y-4">
            <div>
              <div className="text-sm text-gray-400 mb-2">Health</div>
              <div className="flex items-center gap-2">
                <div className="flex-1 h-4 bg-gray-700 rounded-full overflow-hidden">
                  <div
                    className={`h-full transition-all ${
                      healthPercent > 50 ? 'bg-green-500' : healthPercent > 25 ? 'bg-yellow-500' : 'bg-red-500'
                    }`}
                    style={{ width: `${healthPercent}%` }}
                  />
                </div>
                <span className="text-sm whitespace-nowrap">{gameEngine.gameState.playerHealth}/{gameEngine.gameState.maxPlayerHealth}</span>
              </div>
            </div>
            
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={async () => {
                  await handleUserInteraction();
                  handlePause();
                }}
                className="px-3 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors text-sm"
              >
                {gameEngine.gameState.isPaused ? 'Resume' : 'Pause'}
              </button>
              <button
                onClick={async () => {
                  await handleUserInteraction();
                  handleReset();
                }}
                className="px-3 py-2 bg-red-600 hover:bg-red-700 rounded-lg transition-colors text-sm"
              >
                Reset
              </button>
              <button
                onClick={async () => {
                  await handleUserInteraction();
                  setShowSettings(true);
                }}
                className="px-3 py-2 bg-gray-600 hover:bg-gray-700 rounded-lg transition-colors text-sm"
                title="Settings"
              >
                ⚙️
              </button>
              <button
                onClick={async () => {
                  await handleUserInteraction();
                  setShowAchievements(true);
                }}
                className="px-3 py-2 bg-yellow-600 hover:bg-yellow-700 rounded-lg transition-colors text-sm"
                title="Achievements"
              >
                🏆
              </button>
            </div>
            <button
              onClick={async () => {
                await handleUserInteraction();
                setShowLeaderboard(true);
              }}
              className="w-full px-3 py-2 bg-purple-600 hover:bg-purple-700 rounded-lg transition-colors text-sm"
              title="Leaderboard"
            >
              📊 Leaderboard
            </button>
          </div>

          {/* Game Stats */}
          <div className="bg-gray-800 rounded-lg p-4 text-white space-y-2">
            <div>
              <span className="text-sm text-gray-400">Score: </span>
              <span className="text-lg font-bold">{gameEngine.gameState.score.toLocaleString()}</span>
            </div>
            <div>
              <span className="text-sm text-gray-400">Level: </span>
              <span className="text-lg font-bold">{gameEngine.gameState.level}</span>
            </div>
            <div>
              <span className="text-sm text-gray-400">Time: </span>
              <span className="text-lg font-bold">{levelTimeRemaining}s</span>
            </div>
            {gameEngine.gameState.combo > 1 && (
              <div className="bg-gradient-to-r from-yellow-500 to-orange-500 px-2 py-1 rounded-full animate-pulse mt-2">
                <span className="text-xs font-bold text-white">
                  {gameEngine.gameState.combo}x COMBO! ({gameEngine.gameState.comboMultiplier.toFixed(1)}x)
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Main Game Area */}
        <div className="flex-1 flex flex-col items-center">

          {/* FPS Counter */}
          {settingsManager.getSetting('showFPS') && (
            <div className="absolute top-2 right-2 bg-black/70 text-green-400 px-2 py-1 rounded text-sm font-mono z-20">
              FPS: {fps}
            </div>
          )}

          {/* Achievement Notifications */}
          {newAchievements.length > 0 && (
            <div className="fixed top-4 right-4 z-50 space-y-2">
              {newAchievements.map((achievement) => (
                <div
                  key={achievement.id}
                  className="bg-gradient-to-r from-yellow-500 to-orange-500 text-white px-6 py-4 rounded-lg shadow-lg animate-bounce border-2 border-yellow-300 max-w-sm"
                >
                  <div className="font-bold text-lg">🏆 Achievement Unlocked!</div>
                  <div className="font-semibold">{achievement.name}</div>
                  <div className="text-sm opacity-90">{achievement.description}</div>
                  {walletAddress && walletManager.isConnected() ? (
                    <button
                      onClick={async () => {
                        await handleUserInteraction();
                        handleMintAchievementNFT(achievement);
                      }}
                      disabled={mintingNFT === achievement.id}
                      className="mt-2 w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 text-white font-bold py-2 px-4 rounded text-sm transition-colors"
                    >
                      {mintingNFT === achievement.id ? (
                        <span className="flex items-center justify-center gap-2">
                          <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                          </svg>
                          Minting NFT...
                        </span>
                      ) : (
                        '🎨 Mint as NFT'
                      )}
                    </button>
                  ) : (
                    <div className="mt-2 text-xs bg-gray-800/50 px-3 py-2 rounded">
                      Connect wallet to mint NFT
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Active Power-ups Display */}
          {gameEngine.activePowerUps.size > 0 && (
            <div className="absolute top-2 left-2 bg-black/70 text-white px-3 py-2 rounded-lg z-10">
              <div className="text-xs font-bold mb-1">Active Power-ups:</div>
              <div className="flex gap-2 flex-wrap">
                {Array.from(gameEngine.activePowerUps.entries()).map(([type, expiration]) => {
                  const timeLeft = Math.max(0, expiration - Date.now());
                  const seconds = Math.ceil(timeLeft / 1000);
                  let icon = '⚡';
                  if (type === 'speed_boost') icon = '💨';
                  else if (type === 'rapid_fire') icon = '🔥';
                  else if (type === 'shield') icon = '🛡️';
                  else if (type === 'multi_shot') icon = '✨';
                  return (
                    <div key={type} className="text-xs">
                      {icon} {seconds}s
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Game Canvas */}
          <div 
            className="relative" 
            key={resetKey}
            style={{
              transform: `translate(${screenShake.x}px, ${screenShake.y}px)`,
              transition: screenShake.intensity > 0 ? 'none' : 'transform 0.1s ease-out',
            }}
          >
        <GameCanvas
          gameEngine={gameEngine}
          width={CANVAS_WIDTH}
          height={CANVAS_HEIGHT}
        />

        {/* Game Over Overlay */}
        {gameEngine.gameState.isGameOver && (
          <div className="absolute inset-0 bg-black bg-opacity-85 flex items-center justify-center rounded-lg">
            <div className="text-center text-white max-w-lg w-full px-6">
              <h2 className="text-5xl font-bold mb-2 bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">
                Game Over!
              </h2>
              
              {/* New High Score Badge */}
              {isNewHighScore && (
                <div className="mb-4 animate-bounce">
                  <div className="inline-block bg-gradient-to-r from-yellow-400 to-orange-500 text-black px-4 py-2 rounded-full font-bold text-lg shadow-lg">
                    🏆 New High Score! 🏆
                  </div>
                </div>
              )}

              {/* Score Display */}
              <div className="mb-6">
                <p className="text-3xl font-bold mb-2">Final Score</p>
                <p className="text-5xl font-extrabold text-blue-400 mb-4">{gameEngine.gameState.score.toLocaleString()}</p>
                {highScore > 0 && (
                  <p className="text-lg text-gray-400">
                    High Score: <span className="text-yellow-400 font-bold">{highScore.toLocaleString()}</span>
                  </p>
                )}
              </div>

              {/* Stats Grid */}
              <div className="grid grid-cols-2 gap-4 mb-6 bg-gray-900/50 rounded-lg p-4 border border-gray-700">
                <div className="text-center">
                  <p className="text-gray-400 text-sm mb-1">Level Reached</p>
                  <p className="text-2xl font-bold text-blue-400">{gameEngine.gameState.level}</p>
                </div>
                <div className="text-center">
                  <p className="text-gray-400 text-sm mb-1">Enemies Killed</p>
                  <p className="text-2xl font-bold text-green-400">{gameEngine.gameState.enemiesKilled}</p>
                </div>
                <div className="text-center">
                  <p className="text-gray-400 text-sm mb-1">Accuracy</p>
                  <p className="text-2xl font-bold text-purple-400">
                    {gameEngine.gameState.bulletsShot > 0
                      ? Math.round((gameEngine.gameState.bulletsHit / gameEngine.gameState.bulletsShot) * 100)
                      : 0}%
                  </p>
                </div>
                <div className="text-center">
                  <p className="text-gray-400 text-sm mb-1">Time Played</p>
                  <p className="text-2xl font-bold text-orange-400">
                    {Math.round((Date.now() - gameEngine.gameState.gameStartTime) / 1000)}s
                  </p>
                </div>
              </div>

              {/* Share Score Button */}
              <button
                onClick={() => {
                  const text = `I scored ${gameEngine.gameState.score.toLocaleString()} points in Base the Shooter! 🎮 Can you beat my score?`;
                  if (navigator.share) {
                    navigator.share({ text, title: 'Base the Shooter' });
                  } else {
                    navigator.clipboard.writeText(text);
                    alert('Score copied to clipboard!');
                  }
                }}
                className="w-full bg-gradient-to-r from-green-600 to-teal-600 hover:from-green-700 hover:to-teal-700 text-white font-bold py-3 px-6 rounded-lg text-lg transition-all transform hover:scale-105 shadow-lg mb-2"
              >
                📤 Share Score
              </button>

              {/* Play Again Button */}
              <button
                onClick={handleReset}
                className="w-full bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white font-bold py-4 px-8 rounded-lg text-xl transition-all transform hover:scale-105 shadow-lg"
              >
                Play Again
              </button>
            </div>
          </div>
        )}

        {/* Level Transition Overlay */}
        {levelTransition.show && (
          <div 
            className="absolute inset-0 bg-gradient-to-br from-blue-900 via-purple-900 to-black flex items-center justify-center rounded-lg"
            style={{
              opacity: levelTransition.progress < 0.5 
                ? levelTransition.progress * 2 
                : 1 - ((levelTransition.progress - 0.5) * 2),
            }}
          >
            <div className="text-center text-white">
              <div 
                className="text-6xl font-bold mb-4 bg-gradient-to-r from-yellow-400 to-orange-500 bg-clip-text text-transparent"
                style={{
                  transform: `scale(${0.5 + levelTransition.progress * 0.5})`,
                  opacity: levelTransition.progress < 0.5 ? levelTransition.progress * 2 : 1 - ((levelTransition.progress - 0.5) * 2),
                }}
              >
                Level {levelTransition.level}
              </div>
              <p className="text-2xl text-gray-300">Get Ready!</p>
            </div>
          </div>
        )}

        {/* Pause Overlay */}
        {gameEngine.gameState.isPaused && !gameEngine.gameState.isGameOver && (
          <div className="absolute inset-0 bg-black bg-opacity-50 flex items-center justify-center rounded-lg">
            <div className="text-center text-white">
              <h2 className="text-4xl font-bold mb-4">Paused</h2>
              <button
                onClick={handlePause}
                className="px-6 py-3 bg-blue-600 hover:bg-blue-700 rounded-lg text-xl font-bold transition-colors"
              >
                Resume
              </button>
            </div>
          </div>
        )}
      </div>

          {/* Mobile Controls */}
          <div className="md:hidden mt-4 w-full">
            <div className="bg-gray-800 rounded-lg p-4">
              <div className="flex justify-center items-center gap-4">
                <button
                  onTouchStart={handleMoveUp}
                  onMouseDown={handleMoveUp}
                  className="px-6 py-4 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 rounded-lg text-white font-bold text-xl transition-colors"
                >
                  ↑ Up
                </button>
                <button
                  onTouchStart={handleShoot}
                  onMouseDown={handleShoot}
                  className="px-8 py-4 bg-red-600 hover:bg-red-700 active:bg-red-800 rounded-lg text-white font-bold text-xl transition-colors"
                >
                  🔫 Shoot
                </button>
                <button
                  onTouchStart={handleMoveDown}
                  onMouseDown={handleMoveDown}
                  className="px-6 py-4 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 rounded-lg text-white font-bold text-xl transition-colors"
                >
                  ↓ Down
                </button>
              </div>
            </div>
          </div>

          {/* Desktop Controls Info */}
          <div className="hidden md:block mt-4 text-white text-center">
            <p className="text-sm text-gray-400">
              Controls: ↑ ↓ Arrow Keys to Move | → Arrow Key to Shoot
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

