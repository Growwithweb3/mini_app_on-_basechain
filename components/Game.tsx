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
import { PinataManager } from '@/lib/ipfs/pinata';
import html2canvas from 'html2canvas';

const CANVAS_WIDTH = 800;
const CANVAS_HEIGHT = 600;

// Mobile responsive dimensions - Landscape mode support
const getMobileDimensions = () => {
  if (typeof window === 'undefined') return { width: CANVAS_WIDTH, height: CANVAS_HEIGHT };
  
  const isMobile = window.innerWidth < 1024;
  const isLandscape = window.innerWidth > window.innerHeight;
  
  if (isMobile && isLandscape) {
    // Landscape mode: use full viewport (like PUBG)
    const maxWidth = window.innerWidth - 20; // 10px padding on each side
    const maxHeight = window.innerHeight - 100; // Leave space for controls
    const aspectRatio = CANVAS_WIDTH / CANVAS_HEIGHT;
    
    let width = maxWidth;
    let height = maxWidth / aspectRatio;
    
    if (height > maxHeight) {
      height = maxHeight;
      width = maxHeight * aspectRatio;
    }
    
    return { width: Math.floor(width), height: Math.floor(height) };
  }
  
  return { width: CANVAS_WIDTH, height: CANVAS_HEIGHT };
};

export const Game: React.FC = () => {
  const [showWelcome, setShowWelcome] = useState(true);
  const [showTutorial, setShowTutorial] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showAchievements, setShowAchievements] = useState(false);
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  const [showMintNFT, setShowMintNFT] = useState(false);
  const [mintableAchievements, setMintableAchievements] = useState<any[]>([]);
  const [showShareModal, setShowShareModal] = useState(false);
  const [shareImageUrl, setShareImageUrl] = useState<string | null>(null);
  const gameOverRef = useRef<HTMLDivElement>(null);
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
  const [canvasDimensions, setCanvasDimensions] = useState({ width: CANVAS_WIDTH, height: CANVAS_HEIGHT });
  const [isPortrait, setIsPortrait] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

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
        console.log('🏆 Achievement unlocked:', achievement);
        setNewAchievements((prev: any[]) => {
          // Check if already in list to avoid duplicates
          if (prev.find(a => a.id === achievement.id)) {
            return prev;
          }
          return [...prev, achievement];
        });
        // Keep notification for 30 seconds instead of 5
        setTimeout(() => {
          setNewAchievements((prev: any[]) => prev.filter((a: any) => a.id !== achievement.id));
        }, 30000);

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

  // FPS counter and achievement checking
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

      // Check achievements every second
      if (!gameEngine.gameState.isPaused && !gameEngine.gameState.isGameOver) {
        const stats = {
          enemiesKilled: gameEngine.gameState.enemiesKilled,
          bulletsShot: gameEngine.gameState.bulletsShot,
          bulletsHit: gameEngine.gameState.bulletsHit,
          gameStartTime: gameEngine.gameState.gameStartTime,
          powerUpsCollected: powerUpsCollected,
        };
        achievementManager.checkAchievements(gameEngine.gameState, stats);
      }
    }, 1000); // Check every second

    return () => clearInterval(interval);
  }, [powerUpsCollected]);

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

  // Detect mobile devices (excluding iPad)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    
    const checkMobile = () => {
      const userAgent = navigator.userAgent;
      // Check if it's iPad - iPad should be allowed
      const isIPad = /iPad/.test(userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
      // Check if it's a mobile device (but not iPad)
      const isMobileDevice = !isIPad && (/Android|webOS|iPhone|iPod|BlackBerry|IEMobile|Opera Mini/i.test(userAgent) || (window.innerWidth < 768 && !isIPad));
      setIsMobile(isMobileDevice);
    };
    
    checkMobile();
    window.addEventListener('resize', checkMobile);
    
    return () => {
      window.removeEventListener('resize', checkMobile);
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

  // Handle shooting with ArrowRight - uses shootCooldownMultiplier for rapid fire
  useEffect(() => {
    let shootInterval: NodeJS.Timeout;
    let lastShootTime = 0;
    const BASE_COOLDOWN = 1500;
    
    if (keys.has('ArrowRight')) {
      const engine = gameEngineRef.current;
      if (!engine.gameState.isGameOver && !engine.gameState.isPaused) {
        engine.shoot();
        lastShootTime = Date.now();
      }
      
      // Use a fast interval that checks cooldown dynamically (so it responds to multiplier changes)
        shootInterval = setInterval(() => {
        const engine = gameEngineRef.current;
        const now = Date.now();
        // Calculate cooldown using current multiplier (updates when power-up is collected)
        const cooldown = BASE_COOLDOWN * engine.shootCooldownMultiplier;
        
        if (
          keys.has('ArrowRight') && 
          !engine.gameState.isGameOver && 
          !engine.gameState.isPaused &&
          now - lastShootTime >= cooldown
        ) {
            engine.shoot();
          lastShootTime = now;
          }
      }, 50); // Check every 50ms for responsive shooting
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
  const BASE_SHOOT_COOLDOWN = 1500; 

  const handleShoot = useCallback(() => {
    const now = Date.now();
    // Use shootCooldownMultiplier for rapid fire power-up
    const cooldown = BASE_SHOOT_COOLDOWN * gameEngine.shootCooldownMultiplier;
    if (
      !gameEngine.gameState.isGameOver && 
      !gameEngine.gameState.isPaused &&
      now - lastShootTimeRef.current >= cooldown
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

      // Use fixed image CID that was manually uploaded to Pinata
      // CID: bafkreifub6dg3mkx4kj4654i63tm5pc7sey5rjoxejwxwwmcz2o4cnc3re
      const FIXED_IMAGE_CID = 'bafkreifub6dg3mkx4kj4654i63tm5pc7sey5rjoxejwxwwmcz2o4cnc3re';
      const imageIpfsHash = `https://gateway.pinata.cloud/ipfs/${FIXED_IMAGE_CID}`;
      console.log('✅ Using fixed image CID:', imageIpfsHash);

      // Log what we're about to mint (for debugging)
      console.log('📦 Minting NFT with:');
      console.log('  - Achievement:', achievement.name);
      console.log('  - Image URL:', imageIpfsHash);
      console.log('  - Level:', gameEngine.gameState.level);
      console.log('  - Score:', gameEngine.gameState.score);

      const result = await nftManager.mintAchievement(
        achievement.id,
        achievement.name,
        achievement.description,
        imageIpfsHash,
        gameEngine.gameState.level,
        gameEngine.gameState.score
      );

      console.log('✅ NFT minted successfully:', result);
      setMintingNFT(null);
      
      // Show success notification with metadata link
      const contractAddress = getNFTContractAddress();
      const tokenId = result.tokenId !== undefined ? result.tokenId : 'N/A';
      alert(
        `🎉 Achievement NFT minted!\n\n` +
        `Transaction: https://basescan.org/tx/${result.txHash}\n` +
        `Token ID: ${tokenId}\n\n` +
        `To verify metadata:\n` +
        `1. Go to: https://basescan.org/address/${contractAddress}\n` +
        `2. Click "Read Contract" → "tokenURI"\n` +
        `3. Enter token ID: ${tokenId}\n` +
        `4. Copy the IPFS URL and open it in browser\n\n` +
        `Image URL used: ${imageIpfsHash}`
      );
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


  // Resume audio on first user interaction
  const handleUserInteraction = useCallback(async () => {
    try {
      await soundManager.resumeAudioContext();
      // Start music after audio context is resumed
      if (!soundManager.getMusicEnabled()) {
        await soundManager.setMusicEnabled(true);
      } else {
        // If music is enabled but not started, start it now
        await soundManager.startBackgroundMusic();
      }
    } catch (error) {
      // Silently fail if audio context can't be resumed
      console.warn('Could not resume audio context:', error);
    }
  }, []);

  // Show welcome screen first
  if (showWelcome) {
    return (
      <WelcomeScreen
        onPlayGame={async () => {
          await handleUserInteraction();
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
            onClick={async () => {
              await handleUserInteraction();
              setShowTutorial(false);
            }}
            className="w-full bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white font-bold py-3 px-6 rounded-lg text-xl transition-all"
          >
            Start Playing!
          </button>
        </div>
      </div>
    );
  }

  return (
    <div 
      className="flex items-center justify-center min-h-screen bg-gray-900 overflow-hidden" 
      style={{ 
        padding: typeof window !== 'undefined' && window.innerWidth < 1024 ? '5px' : '2% 10%',
        width: '100vw',
        height: '100vh',
        maxHeight: '100vh',
        overflow: 'hidden'
      }}
    >
      {/* Mobile Device Warning - Show on mobile devices */}
      {isMobile && (
        <div className="fixed inset-0 bg-black bg-opacity-95 flex items-center justify-center z-[200]">
          <div className="text-center text-white p-6 max-w-md mx-4">
            <div className="text-6xl mb-4">⚠️</div>
            <h2 className="text-3xl font-bold mb-4">Device Not Supported</h2>
            <p className="text-lg mb-6">
              Game is only compatible for laptop, PC, and iPad. Not for mobile.
            </p>
            <p className="text-sm text-gray-400">
              Sorry for the inconvenience.
            </p>
          </div>
        </div>
      )}

      <div className={`flex gap-4 w-full h-full max-w-[1600px] ${typeof window !== 'undefined' && window.innerWidth < 1024 ? 'flex-col' : ''}`}>
        {/* Left Sidebar - Controls - Hidden on mobile */}
        {(typeof window === 'undefined' || window.innerWidth >= 1024) && (
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
        )}

        {/* Main Game Area */}
        <div className={`flex-1 flex flex-col items-center justify-center ${typeof window !== 'undefined' && window.innerWidth < 1024 ? 'w-full flex-1' : 'h-full'}`}>

      {/* FPS Counter */}
      {settingsManager.getSetting('showFPS') && (
            <div className="absolute top-2 right-2 bg-black/70 text-green-400 px-2 py-1 rounded text-sm font-mono z-20">
          FPS: {fps}
        </div>
      )}

          {/* Simple achievement unlock notification (no popup, just a small toast) */}
      {newAchievements.length > 0 && (
            <div className="fixed top-4 right-4 z-[100]">
              <div className="bg-gradient-to-r from-yellow-500 to-orange-500 text-white px-4 py-2 rounded-lg shadow-lg border-2 border-yellow-300 animate-pulse">
                <div className="font-bold">🏆 {newAchievements.length} New Achievement{newAchievements.length > 1 ? 's' : ''}!</div>
                <div className="text-xs">Check Achievements section to mint NFTs</div>
            </div>
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
          width={canvasDimensions.width}
          height={canvasDimensions.height}
        />

        {/* Game Over Overlay */}
        {gameEngine.gameState.isGameOver && (
          <div ref={gameOverRef} className="absolute inset-0 bg-black bg-opacity-85 flex items-center justify-center rounded-lg">
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

              {/* Mint NFT Button */}
              <button
                onClick={async () => {
                  await handleUserInteraction();
                  // Check which achievements are mintable
                  const allAchievements = achievementManager.getAllAchievements();
                  const mintable: any[] = [];
                  
                  for (const achievement of allAchievements) {
                    if (achievement.unlocked) {
                      // Check if already minted
                      if (walletAddress && walletManager.isConnected()) {
                        try {
                          const alreadyMinted = await nftManager.isAchievementMinted(achievement.id, walletAddress);
                          if (!alreadyMinted) {
                            mintable.push(achievement);
                          }
                        } catch (error) {
                          console.error('Error checking mint status:', error);
                          // If check fails, still show as mintable
                          mintable.push(achievement);
                        }
                      } else {
                        // Not connected, show all unlocked achievements
                        mintable.push(achievement);
                      }
                    }
                  }
                  
                  setMintableAchievements(mintable);
                  setShowMintNFT(true);
                }}
                className="w-full bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white font-bold py-3 px-6 rounded-lg text-lg transition-all transform hover:scale-105 shadow-lg mb-2"
              >
                🎨 Mint NFT
              </button>

              {/* Share Score Button */}
              <button
                onClick={async () => {
                  await handleUserInteraction();
                  // Capture screenshot
                  if (gameOverRef.current) {
                    try {
                      const canvas = await html2canvas(gameOverRef.current, {
                        backgroundColor: '#000000',
                        scale: 2,
                        logging: false,
                      });
                      const imageUrl = canvas.toDataURL('image/png');
                      setShareImageUrl(imageUrl);
                      setShowShareModal(true);
                    } catch (error) {
                      console.error('Failed to capture screenshot:', error);
                      // Fallback to text share
                      const text = `I scored ${gameEngine.gameState.score.toLocaleString()} points in Base the Shooter! 🎮 Can you beat my score?\n\nPlay this game base the shooter : https://mini-app-on-basechain.vercel.app/`;
                  if (navigator.share) {
                    navigator.share({ text, title: 'Base the Shooter' });
                  } else {
                    navigator.clipboard.writeText(text);
                    alert('Score copied to clipboard!');
                      }
                    }
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

      {/* Mobile Controls - Only show in landscape mode on mobile */}
      {typeof window !== 'undefined' && window.innerWidth < 1024 && !isPortrait && (
        <div className="w-full mt-2 flex-shrink-0">
          <div className="bg-gray-800 rounded-lg p-3">
            <div className="flex justify-center items-center gap-3">
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
      )}

      {/* Desktop Controls Info */}
      <div className="hidden md:block mt-4 text-white text-center">
        <p className="text-sm text-gray-400">
          Controls: ↑ ↓ Arrow Keys to Move | → Arrow Key to Shoot
        </p>
      </div>
        </div>
      </div>

      {/* Achievements Modal */}
      {showAchievements && (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-800 rounded-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto border-2 border-yellow-500">
            <div className="sticky top-0 bg-gray-800 p-6 border-b border-gray-700 flex justify-between items-center">
              <h2 className="text-3xl font-bold text-white">🏆 Your Achievements</h2>
              <button
                onClick={() => setShowAchievements(false)}
                className="text-gray-400 hover:text-white text-2xl font-bold"
              >
                ×
              </button>
            </div>
            
            <div className="p-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {achievementManager.getAllAchievements().map((achievement) => {
                  const isMinted = mintingNFT === achievement.id;
                  const isUnlocked = achievement.unlocked;
                  
                  return (
                    <div
                      key={achievement.id}
                      className={`p-4 rounded-lg border-2 ${
                        isUnlocked
                          ? 'bg-gradient-to-br from-yellow-500/20 to-orange-500/20 border-yellow-500'
                          : 'bg-gray-700/50 border-gray-600'
                      }`}
                    >
                      <div className="flex items-start justify-between mb-2">
                        <div>
                          <h3 className={`font-bold text-lg ${isUnlocked ? 'text-yellow-400' : 'text-gray-400'}`}>
                            {isUnlocked ? '🏆' : '🔒'} {achievement.name}
                          </h3>
                          <p className="text-sm text-gray-300 mt-1">{achievement.description}</p>
                        </div>
                      </div>
                      
                      {isUnlocked && (
                        <div className="mt-3 space-y-2">
                          {walletAddress && walletManager.isConnected() ? (
                            <button
                              onClick={async () => {
                                await handleUserInteraction();
                                try {
                                  await handleMintAchievementNFT(achievement);
                                } catch (error: any) {
                                  alert(`Failed to mint: ${error.message}`);
                                }
                              }}
                              disabled={isMinted}
                              className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 text-white font-bold py-2 px-4 rounded-lg text-sm transition-colors"
                            >
                              {isMinted ? (
                                <span className="flex items-center justify-center gap-2">
                                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                                  </svg>
                                  Minting...
                                </span>
                              ) : (
                                '🎨 Mint as NFT'
                              )}
                            </button>
                          ) : (
                            <button
                              onClick={async () => {
                                await handleUserInteraction();
                                if (walletManager.getProviderInstance()) {
                                  try {
                                    await walletManager.connect();
                                  } catch (error) {
                                    alert('Please connect your wallet first!');
                                  }
                                } else {
                                  alert('Please install MetaMask and connect your wallet to mint NFTs!');
                                }
                              }}
                              className="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded-lg text-sm transition-colors"
                            >
                              🔗 Connect Wallet to Mint
                            </button>
                          )}
                        </div>
                      )}
    </div>
  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Mint NFT Modal - Shows at Game Over */}
      {showMintNFT && (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-800 rounded-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto border-2 border-purple-500">
            <div className="sticky top-0 bg-gray-800 p-6 border-b border-gray-700 flex justify-between items-center">
              <h2 className="text-3xl font-bold text-white">🎨 Mint Your Achievements as NFTs</h2>
              <button
                onClick={() => setShowMintNFT(false)}
                className="text-gray-400 hover:text-white text-2xl font-bold"
              >
                ×
              </button>
            </div>
            
            <div className="p-6">
              {mintableAchievements.length === 0 ? (
                <div className="text-center py-12">
                  <p className="text-xl text-gray-400 mb-4">
                    {walletAddress && walletManager.isConnected() 
                      ? "You've already minted all your unlocked achievements! 🎉"
                      : "Connect your wallet to see mintable achievements"}
                  </p>
                  {!walletAddress && (
                    <button
                      onClick={async () => {
                        await handleUserInteraction();
                        if (walletManager.getProviderInstance()) {
                          try {
                            await walletManager.connect();
                            // Refresh mintable list after connecting
                            const allAchievements = achievementManager.getAllAchievements();
                            const mintable: any[] = [];
                            for (const achievement of allAchievements) {
                              if (achievement.unlocked) {
                                mintable.push(achievement);
                              }
                            }
                            setMintableAchievements(mintable);
                          } catch (error) {
                            alert('Please connect your wallet first!');
                          }
                        } else {
                          alert('Please install MetaMask and connect your wallet to mint NFTs!');
                        }
                      }}
                      className="mt-4 bg-green-600 hover:bg-green-700 text-white font-bold py-3 px-6 rounded-lg"
                    >
                      🔗 Connect Wallet
                    </button>
                  )}
                </div>
              ) : (
                <>
                  <p className="text-gray-300 mb-4">
                    You have <span className="font-bold text-purple-400">{mintableAchievements.length}</span> achievement{mintableAchievements.length > 1 ? 's' : ''} ready to mint!
                  </p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {mintableAchievements.map((achievement) => {
                      const isMinting = mintingNFT === achievement.id;
                      
                      return (
                        <div
                          key={achievement.id}
                          className="p-4 rounded-lg border-2 bg-gradient-to-br from-purple-500/20 to-pink-500/20 border-purple-500"
                        >
                          <div className="flex items-start justify-between mb-2">
                            <div>
                              <h3 className="font-bold text-lg text-yellow-400">
                                🏆 {achievement.name}
                              </h3>
                              <p className="text-sm text-gray-300 mt-1">{achievement.description}</p>
                            </div>
                          </div>
                          
                          <div className="mt-3">
                            {walletAddress && walletManager.isConnected() ? (
                              <button
                                onClick={async () => {
                                  await handleUserInteraction();
                                  try {
                                    await handleMintAchievementNFT(achievement);
                                    // Remove from mintable list after successful mint
                                    setMintableAchievements(prev => prev.filter(a => a.id !== achievement.id));
                                  } catch (error: any) {
                                    alert(`Failed to mint: ${error.message}`);
                                  }
                                }}
                                disabled={isMinting}
                                className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 text-white font-bold py-2 px-4 rounded-lg text-sm transition-colors"
                              >
                                {isMinting ? (
                                  <span className="flex items-center justify-center gap-2">
                                    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                                    </svg>
                                    Minting...
                                  </span>
                                ) : (
                                  '🎨 Mint as NFT'
                                )}
                              </button>
                            ) : (
                              <button
                                onClick={async () => {
                                  await handleUserInteraction();
                                  if (walletManager.getProviderInstance()) {
                                    try {
                                      await walletManager.connect();
                                      // Refresh mintable list after connecting
                                      const allAchievements = achievementManager.getAllAchievements();
                                      const mintable: any[] = [];
                                      for (const achievement of allAchievements) {
                                        if (achievement.unlocked) {
                                          mintable.push(achievement);
                                        }
                                      }
                                      setMintableAchievements(mintable);
                                    } catch (error) {
                                      alert('Please connect your wallet first!');
                                    }
                                  } else {
                                    alert('Please install MetaMask and connect your wallet to mint NFTs!');
                                  }
                                }}
                                className="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded-lg text-sm transition-colors"
                              >
                                🔗 Connect Wallet to Mint
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Share Modal */}
      {showShareModal && shareImageUrl && (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-800 rounded-xl max-w-2xl w-full border-2 border-green-500 p-6">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-2xl font-bold text-white">Share Your Score</h3>
              <button
                onClick={() => {
                  setShowShareModal(false);
                  setShareImageUrl(null);
                }}
                className="text-gray-400 hover:text-white text-2xl"
              >
                ×
              </button>
            </div>

            {/* Screenshot Preview */}
            <div className="mb-6 bg-gray-900 rounded-lg p-4 flex justify-center">
              <img
                src={shareImageUrl}
                alt="Score screenshot"
                className="max-w-full h-auto rounded-lg"
              />
            </div>

            {/* Share Options */}
            <div className="grid grid-cols-2 gap-4">
              {/* Share on X (Twitter) */}
              <button
                onClick={() => {
                  const text = `I scored ${gameEngine.gameState.score.toLocaleString()} points in Base the Shooter! 🎮 Can you beat my score?\n\nPlay this game base the shooter : https://mini-app-on-basechain.vercel.app/`;
                  const url = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`;
                  window.open(url, '_blank');
                }}
                className="bg-black hover:bg-gray-900 text-white font-bold py-3 px-4 rounded-lg transition-all transform hover:scale-105 flex items-center justify-center gap-2 border border-gray-600"
              >
                <span className="text-xl">𝕏</span>
                <span>Share on X</span>
              </button>

              {/* Copy Image */}
              <button
                onClick={async () => {
                  try {
                    const response = await fetch(shareImageUrl);
                    const blob = await response.blob();
                    await navigator.clipboard.write([
                      new ClipboardItem({ 'image/png': blob })
                    ]);
                    alert('Screenshot copied to clipboard!');
                  } catch (error) {
                    console.error('Failed to copy image:', error);
                    alert('Failed to copy image. Try downloading instead.');
                  }
                }}
                className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-4 rounded-lg transition-all transform hover:scale-105 flex items-center justify-center gap-2"
              >
                <span>📋</span>
                <span>Copy Image</span>
              </button>

              {/* Download Image */}
              <button
                onClick={() => {
                  const link = document.createElement('a');
                  link.download = `base-shooter-score-${gameEngine.gameState.score}.png`;
                  link.href = shareImageUrl;
                  link.click();
                }}
                className="bg-purple-600 hover:bg-purple-700 text-white font-bold py-3 px-4 rounded-lg transition-all transform hover:scale-105 flex items-center justify-center gap-2"
              >
                <span>💾</span>
                <span>Download</span>
              </button>

              {/* Share via Native Share */}
              <button
                onClick={async () => {
                  try {
                    const response = await fetch(shareImageUrl);
                    const blob = await response.blob();
                    const file = new File([blob], 'score.png', { type: 'image/png' });
                    
                    if (navigator.share && navigator.canShare({ files: [file] })) {
                      await navigator.share({
                        title: 'Base the Shooter Score',
                        text: `I scored ${gameEngine.gameState.score.toLocaleString()} points! @base`,
                        files: [file],
                      });
                    } else {
                      // Fallback to text share
                      const text = `I scored ${gameEngine.gameState.score.toLocaleString()} points in Base the Shooter! 🎮 Can you beat my score?\n\nPlay this game base the shooter : https://mini-app-on-basechain.vercel.app/`;
                      if (navigator.share) {
                        await navigator.share({ text, title: 'Base the Shooter' });
                      } else {
                        navigator.clipboard.writeText(text);
                        alert('Score text copied to clipboard!');
                      }
                    }
                  } catch (error) {
                    console.error('Share failed:', error);
                  }
                }}
                className="bg-green-600 hover:bg-green-700 text-white font-bold py-3 px-4 rounded-lg transition-all transform hover:scale-105 flex items-center justify-center gap-2"
              >
                <span>📤</span>
                <span>Share</span>
              </button>
            </div>

            <p className="text-center text-gray-400 text-sm mt-4">
              Tag @base when you share! 🚀
            </p>
          </div>
        </div>
      )}
    </div>
  );
};