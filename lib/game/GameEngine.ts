// Main game engine - manages game state, entities, and game loop

import { Base } from './Base';
import { Enemy } from './Enemy';
import { EnemyFactory } from './EnemyFactory';
import { CollisionDetector } from './CollisionDetector';
import { Bullet, GameState, Position, ScorePopup, Particle, PowerUp, PowerUpType, Boss } from './types';
import { soundManager } from '@/lib/audio/SoundManager';

export class GameEngine {
  public base: Base;
  public enemies: Enemy[] = [];
  public bullets: Bullet[] = [];
  public scorePopups: ScorePopup[] = [];
  public particles: Particle[] = [];
  public powerUps: PowerUp[] = [];
  public boss: Boss | null = null;
  public gameState: GameState;
  public canvasWidth: number;
  public canvasHeight: number;
  private lastSpawnTime: number = 0;
  private lastPowerUpSpawn: number = 0;
  private spawnInterval: number = 1000; // 2 seconds default
  private levelDurations: Record<number, number> = {
    1: 30000, // 30 seconds
    2: 60000, // 60 seconds
    3: 40000, // 40 seconds
  };
  
  // Power-up states
  public activePowerUps: Map<PowerUpType, number> = new Map(); // PowerUpType -> expiration time
  public baseSpeedMultiplier: number = 1;
  public shootCooldownMultiplier: number = 1;
  public hasShield: boolean = false;
  public multiShotCount: number = 1;

  constructor(canvasWidth: number, canvasHeight: number) {
    this.canvasWidth = canvasWidth;
    this.canvasHeight = canvasHeight;
    this.base = new Base(canvasWidth, canvasHeight);
    const now = Date.now();
    this.gameState = {
      score: 0,
      level: 1,
      playerHealth: this.base.health,
      maxPlayerHealth: this.base.maxHealth,
      isGameOver: false,
      isPaused: false,
      levelStartTime: now,
      levelDuration: this.levelDurations[1],
      enemiesKilled: 0,
      bulletsShot: 0,
      bulletsHit: 0,
      gameStartTime: now,
      combo: 0,
      comboMultiplier: 1,
      lastKillTime: 0,
    };
    this.activePowerUps.clear();
    this.baseSpeedMultiplier = 1;
    this.shootCooldownMultiplier = 1;
    this.hasShield = false;
    this.multiShotCount = 1;
    this.boss = null;
    this.powerUps = [];
  }

  // Update game state (called every frame)
  update(): void {
    if (this.gameState.isPaused || this.gameState.isGameOver) {
      return;
    }

    const currentTime = Date.now();
    const levelElapsed = currentTime - this.gameState.levelStartTime;

    // Check if level time has elapsed
    if (levelElapsed >= this.gameState.levelDuration) {
      this.nextLevel();
      return;
    }

    // Spawn enemies based on level
    this.spawnEnemies(currentTime);

    // Update enemies
    this.enemies.forEach((enemy) => {
      enemy.update(this.canvasWidth, this.canvasHeight);

      // Enemy shoots at player
      if (enemy.canShoot(currentTime)) {
        const baseCenter = this.base.getCenter();
        const bullets = enemy.shoot(baseCenter);
        // Add all bullets (supports multiple bullets for level 3 enemies)
        this.bullets.push(...bullets);
      }

      // Check melee collision (Level 1 enemies)
      if (!enemy.config.canShoot && CollisionDetector.enemyBaseCollision(enemy, this.base)) {
        this.base.takeDamage(5);
        this.gameState.playerHealth = this.base.health;
        enemy.takeDamage(100); // Remove enemy after melee hit
      }
    });

    // Update bullets
    this.bullets.forEach((bullet) => {
      bullet.x += bullet.vx;
      bullet.y += bullet.vy;
    });

    // Update combo decay
    this.updateCombo();

    // Update score popups
    const deltaTime = 16; // ~60fps
    this.scorePopups = this.scorePopups.filter((popup) => {
      popup.lifetime += deltaTime;
      popup.y -= 1; // Move up
      return popup.lifetime < popup.maxLifetime;
    });

    // Update particles
    this.particles = this.particles.filter((particle) => {
      particle.lifetime += deltaTime;
      particle.x += particle.vx;
      particle.y += particle.vy;
      particle.vy += 0.1; // Gravity
      particle.vx *= 0.98; // Friction
      return particle.lifetime < particle.maxLifetime;
    });

    // Remove off-screen bullets
    this.bullets = this.bullets.filter(
      (bullet) =>
        bullet.x > -50 &&
        bullet.x < this.canvasWidth + 50 &&
        bullet.y > -50 &&
        bullet.y < this.canvasHeight + 50
    );

    // Remove off-screen enemies
    this.enemies = this.enemies.filter((enemy) => !enemy.isOffScreen());

    // Check collisions: player bullets vs enemies
    this.bullets.forEach((bullet, bulletIndex) => {
      if (bullet.isPlayerBullet) {
        this.enemies.forEach((enemy, enemyIndex) => {
          if (CollisionDetector.bulletEnemyCollision(bullet, enemy)) {
            enemy.takeDamage(bullet.damage);
            this.bullets.splice(bulletIndex, 1);

            if (!enemy.isAlive()) {
              const currentTime = Date.now();
              const timeSinceLastKill = currentTime - this.gameState.lastKillTime;
              
              // Combo system: if killed within 2 seconds, increase combo
              if (timeSinceLastKill < 2000 && this.gameState.lastKillTime > 0) {
                this.gameState.combo++;
                this.gameState.comboMultiplier = Math.min(1 + (this.gameState.combo * 0.1), 3); // Max 3x multiplier
              } else {
                this.gameState.combo = 1;
                this.gameState.comboMultiplier = 1;
              }
              
              this.gameState.lastKillTime = currentTime;
              
              // Level 3 enemies give 500 points, others give 10 * level
              const basePoints = this.gameState.level === 3 ? 500 : 10 * this.gameState.level;
              const points = Math.round(basePoints * this.gameState.comboMultiplier);
              this.gameState.score += points;
              this.gameState.enemiesKilled++;
              this.gameState.bulletsHit++;
              
              // Play explosion sound
              soundManager.playExplosion();
              
              // Create score popup with combo info
              const enemyCenter = enemy.getCenter();
              this.scorePopups.push({
                x: enemyCenter.x,
                y: enemyCenter.y,
                value: points,
                lifetime: 0,
                maxLifetime: 1000, // 1 second
              });
              
              // Create explosion particles
              const particleCount = 15;
              const colors = ['#FFD700', '#FF6B6B', '#4ECDC4', '#FFE66D', '#FF6B9D'];
              for (let i = 0; i < particleCount; i++) {
                const angle = (Math.PI * 2 * i) / particleCount;
                const speed = 2 + Math.random() * 3;
                this.particles.push({
                  x: enemyCenter.x,
                  y: enemyCenter.y,
                  vx: Math.cos(angle) * speed,
                  vy: Math.sin(angle) * speed,
                  lifetime: 0,
                  maxLifetime: 500 + Math.random() * 500,
                  color: colors[Math.floor(Math.random() * colors.length)],
                  size: 3 + Math.random() * 4,
                });
              }
              
              // Random chance to spawn power-up (10% chance)
              if (Math.random() < 0.1) {
                this.spawnPowerUp(enemyCenter.x, enemyCenter.y);
              }
              
              this.enemies.splice(enemyIndex, 1);
            } else {
              // Enemy hit but not killed
              soundManager.playHit();
            }
          }
        });
      }
    });

    // Check collisions: enemy bullets vs Base
    this.bullets.forEach((bullet, bulletIndex) => {
      if (!bullet.isPlayerBullet) {
        if (CollisionDetector.bulletBaseCollision(bullet, this.base)) {
          if (this.hasShield) {
            // Shield absorbs damage
            this.hasShield = false;
            soundManager.playPowerUp(); // Shield break sound
          } else {
            this.base.takeDamage(bullet.damage);
            soundManager.playDamage();
          }
          this.gameState.playerHealth = this.base.health;
          this.bullets.splice(bulletIndex, 1);

          if (!this.base.isAlive()) {
            this.gameState.isGameOver = true;
          }
        }
      }
    });

    // Update power-ups
    this.updatePowerUps(currentTime);
    
    // Check power-up collisions
    this.checkPowerUpCollisions();
    
    // Spawn power-ups periodically
    if (currentTime - this.lastPowerUpSpawn > 15000) { // Every 15 seconds
      if (Math.random() < 0.3) { // 30% chance
        this.spawnPowerUp(
          this.canvasWidth - 50,
          Math.random() * (this.canvasHeight - 50)
        );
        this.lastPowerUpSpawn = currentTime;
      }
    }

    // Update game state
    this.gameState.playerHealth = this.base.health;
  }

  // Spawn enemies based on level and time
  private spawnEnemies(currentTime: number): void {
    if (currentTime - this.lastSpawnTime >= this.spawnInterval) {
      const enemy = EnemyFactory.createRandomEnemy(
        this.gameState.level,
        this.canvasWidth,
        this.canvasHeight
      );
      if (enemy) {
        this.enemies.push(enemy);
      }
      this.lastSpawnTime = currentTime;

      // Decrease spawn interval as level increases (more enemies)
      this.spawnInterval = Math.max(500, 1500 - (this.gameState.level - 1) * 150);
    }
  }

  // Move to next level
  nextLevel(): void {
    if (this.gameState.level < 3) {
      const previousLevel = this.gameState.level;
      this.gameState.level++;
      this.enemies = [];
      this.bullets = [];
      this.gameState.levelStartTime = Date.now();
      this.gameState.levelDuration = this.levelDurations[this.gameState.level];
      this.lastSpawnTime = Date.now();
      
      // Reset health to 100 after Level 2 (only after level 2)
      if (previousLevel === 2) {
        this.base.health = 100;
        this.base.maxHealth = 100;
        this.gameState.playerHealth = 100;
        this.gameState.maxPlayerHealth = 100;
      }
    } else {
      // Game completed
      this.gameState.isGameOver = true;
    }
  }

  // Player shoots
  shoot(): void {
    const center = this.base.getCenter();
    soundManager.playShoot();
    
    // Multi-shot support
    if (this.multiShotCount > 1) {
      const spread = 0.3;
      for (let i = 0; i < this.multiShotCount; i++) {
        const offset = (i - (this.multiShotCount - 1) / 2) * spread;
        this.bullets.push({
          x: center.x,
          y: center.y,
          vx: 8,
          vy: offset * 8,
          width: 10,
          height: 10,
          isPlayerBullet: true,
          damage: 20,
        });
      }
    } else {
      this.bullets.push({
        x: center.x,
        y: center.y,
        vx: 8,
        vy: 0,
        width: 10,
        height: 10,
        isPlayerBullet: true,
        damage: 20,
      });
    }
    this.gameState.bulletsShot++;
  }

  // Spawn power-up
  private spawnPowerUp(x: number, y: number): void {
    const types = [
      PowerUpType.SPEED_BOOST,
      PowerUpType.RAPID_FIRE,
      PowerUpType.SHIELD,
      PowerUpType.MULTI_SHOT,
    ];
    const type = types[Math.floor(Math.random() * types.length)];
    
    this.powerUps.push({
      x,
      y,
      type,
      lifetime: 0,
      maxLifetime: 10000, // 10 seconds
      size: 30,
    });
  }

  // Check power-up collisions
  private checkPowerUpCollisions(): void {
    this.powerUps.forEach((powerUp, index) => {
      const baseCenter = this.base.getCenter();
      const distance = Math.sqrt(
        Math.pow(powerUp.x - baseCenter.x, 2) + Math.pow(powerUp.y - baseCenter.y, 2)
      );
      
      if (distance < powerUp.size + 30) {
        // Power-up collected!
        this.activatePowerUp(powerUp.type);
        soundManager.playPowerUp();
        this.powerUps.splice(index, 1);
        // Emit event for tracking (handled in Game.tsx)
        if ((this as any).onPowerUpCollected) {
          (this as any).onPowerUpCollected();
        }
      }
    });
  }

  // Activate power-up
  private activatePowerUp(type: PowerUpType): void {
    const duration = 10000; // 10 seconds
    const expiration = Date.now() + duration;
    this.activePowerUps.set(type, expiration);

    switch (type) {
      case PowerUpType.SPEED_BOOST:
        this.baseSpeedMultiplier = 1.5;
        break;
      case PowerUpType.RAPID_FIRE:
        this.shootCooldownMultiplier = 0.5; // 2x faster
        break;
      case PowerUpType.SHIELD:
        this.hasShield = true;
        break;
      case PowerUpType.MULTI_SHOT:
        this.multiShotCount = 3;
        break;
    }
  }

  // Update power-ups (check expiration)
  private updatePowerUps(currentTime: number): void {
    this.activePowerUps.forEach((expiration, type) => {
      if (currentTime >= expiration) {
        this.deactivatePowerUp(type);
        this.activePowerUps.delete(type);
      }
    });

    // Update power-up lifetimes
    this.powerUps = this.powerUps.filter((powerUp) => {
      powerUp.lifetime += 16;
      return powerUp.lifetime < powerUp.maxLifetime;
    });
  }

  // Deactivate power-up
  private deactivatePowerUp(type: PowerUpType): void {
    switch (type) {
      case PowerUpType.SPEED_BOOST:
        this.baseSpeedMultiplier = 1;
        break;
      case PowerUpType.RAPID_FIRE:
        this.shootCooldownMultiplier = 1;
        break;
      case PowerUpType.SHIELD:
        this.hasShield = false;
        break;
      case PowerUpType.MULTI_SHOT:
        this.multiShotCount = 1;
        break;
    }
  }

  // Draw everything on canvas
  draw(ctx: CanvasRenderingContext2D): void {
    // Clear canvas
    ctx.fillStyle = '#1a1a2e';
    ctx.fillRect(0, 0, this.canvasWidth, this.canvasHeight);

    // Draw animated starfield background
    const time = Date.now() * 0.001;
    ctx.fillStyle = '#FFFFFF';
    for (let i = 0; i < 50; i++) {
      const x = (i * 37) % this.canvasWidth;
      const y = (i * 73 + time * 20) % this.canvasHeight;
      const size = (Math.sin(time + i) * 0.5 + 0.5) * 2;
      const alpha = (Math.sin(time * 2 + i) * 0.5 + 0.5) * 0.8;
      ctx.globalAlpha = alpha;
      ctx.beginPath();
      ctx.arc(x, y, size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // Draw background pattern (simple grid) - more subtle
    ctx.strokeStyle = '#16213e';
    ctx.lineWidth = 1;
    ctx.globalAlpha = 0.3;
    for (let i = 0; i < this.canvasWidth; i += 50) {
      ctx.beginPath();
      ctx.moveTo(i, 0);
      ctx.lineTo(i, this.canvasHeight);
      ctx.stroke();
    }
    for (let i = 0; i < this.canvasHeight; i += 50) {
      ctx.beginPath();
      ctx.moveTo(0, i);
      ctx.lineTo(this.canvasWidth, i);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    // Draw Base
    this.base.draw(ctx);

    // Draw enemies
    this.enemies.forEach((enemy) => enemy.draw(ctx));

    // Draw bullets with improved visuals
    this.bullets.forEach((bullet) => {
      const centerX = bullet.x + bullet.width / 2;
      const centerY = bullet.y + bullet.height / 2;
      const radius = Math.max(bullet.width, bullet.height) / 2;

      if (bullet.isPlayerBullet) {
        // Player bullets - blue with glow effect
        const gradient = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, radius);
        gradient.addColorStop(0, '#60A5FA'); // Bright blue center
        gradient.addColorStop(0.5, '#3B82F6'); // Medium blue
        gradient.addColorStop(1, '#1E40AF'); // Dark blue edge
        
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
        ctx.fill();
        
        // Add outer glow
        ctx.shadowBlur = 8;
        ctx.shadowColor = '#3B82F6';
        ctx.fill();
        ctx.shadowBlur = 0;
      } else {
        // Enemy bullets - red with glow effect
        const gradient = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, radius);
        gradient.addColorStop(0, '#F87171'); // Bright red center
        gradient.addColorStop(0.5, '#EF4444'); // Medium red
        gradient.addColorStop(1, '#DC2626'); // Dark red edge
        
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
        ctx.fill();
        
        // Add outer glow
        ctx.shadowBlur = 8;
        ctx.shadowColor = '#EF4444';
        ctx.fill();
        ctx.shadowBlur = 0;
      }
    });

    // Draw score popups
    this.scorePopups.forEach((popup) => {
      const alpha = 1 - (popup.lifetime / popup.maxLifetime);
      const fontSize = 20 + (popup.lifetime / popup.maxLifetime) * 10;
      
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.font = `bold ${fontSize}px Arial`;
      ctx.fillStyle = '#FFD700'; // Gold color
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 2;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      
      // Draw text with outline
      const text = `+${popup.value}`;
      ctx.strokeText(text, popup.x, popup.y);
      ctx.fillText(text, popup.x, popup.y);
      
      ctx.restore();
    });

    // Draw particles
    this.particles.forEach((particle) => {
      const alpha = 1 - (particle.lifetime / particle.maxLifetime);
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.fillStyle = particle.color;
      ctx.beginPath();
      ctx.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    });

    // Draw power-ups
    this.powerUps.forEach((powerUp) => {
      const alpha = 0.5 + 0.5 * Math.sin(Date.now() * 0.005);
      ctx.save();
      ctx.globalAlpha = alpha;
      
      // Different colors for different power-ups
      let color = '#FFD700';
      let symbol = '⚡';
      switch (powerUp.type) {
        case PowerUpType.SPEED_BOOST:
          color = '#00FF00';
          symbol = '💨';
          break;
        case PowerUpType.RAPID_FIRE:
          color = '#FF0000';
          symbol = '🔥';
          break;
        case PowerUpType.SHIELD:
          color = '#0000FF';
          symbol = '🛡️';
          break;
        case PowerUpType.MULTI_SHOT:
          color = '#FF00FF';
          symbol = '✨';
          break;
      }
      
      // Draw glow
      ctx.shadowBlur = 15;
      ctx.shadowColor = color;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(powerUp.x, powerUp.y, powerUp.size, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
      
      // Draw symbol
      ctx.font = '20px Arial';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(symbol, powerUp.x, powerUp.y);
      
      ctx.restore();
    });

    // Draw shield effect around Base if active
    if (this.hasShield) {
      const baseCenter = this.base.getCenter();
      const pulse = Math.sin(Date.now() * 0.01) * 5;
      ctx.save();
      ctx.strokeStyle = '#00FFFF';
      ctx.lineWidth = 3;
      ctx.globalAlpha = 0.6;
      ctx.beginPath();
      ctx.arc(baseCenter.x, baseCenter.y, 40 + pulse, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  }

  // Reset game
  reset(): void {
    this.base = new Base(this.canvasWidth, this.canvasHeight);
    this.enemies = [];
    this.bullets = [];
    this.scorePopups = [];
    this.particles = [];
    this.powerUps = [];
    this.boss = null;
    const now = Date.now();
    this.gameState = {
      score: 0,
      level: 1,
      playerHealth: this.base.health,
      maxPlayerHealth: this.base.maxHealth,
      isGameOver: false,
      isPaused: false,
      levelStartTime: now,
      levelDuration: this.levelDurations[1],
      enemiesKilled: 0,
      bulletsShot: 0,
      bulletsHit: 0,
      gameStartTime: now,
      combo: 0,
      comboMultiplier: 1,
      lastKillTime: 0,
    };
    this.lastSpawnTime = now;
    this.lastPowerUpSpawn = now;
    this.activePowerUps.clear();
    this.baseSpeedMultiplier = 1;
    this.shootCooldownMultiplier = 1;
    this.hasShield = false;
    this.multiShotCount = 1;
  }

  // Update combo decay (reset combo if no kills for 2 seconds)
  private updateCombo(): void {
    const currentTime = Date.now();
    if (this.gameState.lastKillTime > 0 && currentTime - this.gameState.lastKillTime > 2000) {
      this.gameState.combo = 0;
      this.gameState.comboMultiplier = 1;
    }
  }
}

