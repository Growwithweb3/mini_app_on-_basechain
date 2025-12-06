// Game types and interfaces

export interface Position {
  x: number;
  y: number;
}

export interface Velocity {
  vx: number;
  vy: number;
}

export interface Size {
  width: number;
  height: number;
}

export enum EnemyType {
  // Level 1 (Easy) - No guns, melee only
  STARKENT = 'starkent',
  SCROLL = 'scroll',
  ZKSYN = 'zksyn',
  TAIKO = 'taiko',
  // Level 2 (Medium) - Have guns, shoot player
  LINEA = 'linea',
  OP = 'op',
  // Level 3 (Hard) - Tanks/bombs
  ARB = 'arb',
  POLYGON = 'polygon',
}

export interface EnemyConfig {
  type: EnemyType;
  health: number;
  speed: number;
  imagePath: string;
  width: number;
  height: number;
  canShoot: boolean;
  shootInterval: number;
  level: number;
  bulletsPerShot?: number; // Number of bullets to shoot at once (default: 1)
  bulletSpeed?: number; // Speed of enemy bullets (default: 4)
}

export interface Bullet {
  x: number;
  y: number;
  vx: number;
  vy: number;
  width: number;
  height: number;
  isPlayerBullet: boolean;
  damage: number;
}

export interface GameState {
  score: number;
  level: number;
  playerHealth: number;
  maxPlayerHealth: number;
  isGameOver: boolean;
  isPaused: boolean;
  levelStartTime: number;
  levelDuration: number;
  enemiesKilled: number;
  bulletsShot: number;
  bulletsHit: number;
  gameStartTime: number;
  combo: number;
  comboMultiplier: number;
  lastKillTime: number;
}

export interface ScorePopup {
  x: number;
  y: number;
  value: number;
  lifetime: number;
  maxLifetime: number;
}

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  lifetime: number;
  maxLifetime: number;
  color: string;
  size: number;
}

export enum PowerUpType {
  SPEED_BOOST = 'speed_boost',
  RAPID_FIRE = 'rapid_fire',
  SHIELD = 'shield',
  MULTI_SHOT = 'multi_shot',
}

export interface PowerUp {
  x: number;
  y: number;
  type: PowerUpType;
  lifetime: number;
  maxLifetime: number;
  size: number;
}

export interface Achievement {
  id: string;
  name: string;
  description: string;
  unlocked: boolean;
  unlockedAt?: number;
}

export interface Boss {
  position: Position;
  size: Size;
  health: number;
  maxHealth: number;
  speed: number;
  lastShotTime: number;
  shootInterval: number;
}

export interface GameSettings {
  soundEnabled: boolean;
  musicEnabled: boolean;
  soundVolume: number;
  musicVolume: number;
  difficulty: 'easy' | 'normal' | 'hard';
  showFPS: boolean;
}

