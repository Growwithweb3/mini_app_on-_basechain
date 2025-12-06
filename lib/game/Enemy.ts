// Enemy class - moves from right to left, can shoot

import { Position, Size, EnemyType, EnemyConfig, Bullet } from './types';

export class Enemy {
  public position: Position;
  public size: Size;
  public health: number;
  public maxHealth: number;
  public speed: number;
  public config: EnemyConfig;
  public image: HTMLImageElement | null = null;
  public lastShotTime: number = 0;
  public verticalDirection: number = 1; // 1 for down, -1 for up (for dodging)

  constructor(config: EnemyConfig, canvasWidth: number, canvasHeight: number) {
    this.config = config;
    this.size = { width: config.width, height: config.height };
    this.position = {
      x: canvasWidth,
      y: Math.random() * (canvasHeight - this.size.height),
    };
    this.health = config.health;
    this.maxHealth = config.health;
    this.speed = config.speed;
    this.loadImage();
  }

  private loadImage(): void {
    // Only load images in browser environment (not during SSR)
    if (typeof window !== 'undefined' && typeof Image !== 'undefined') {
      this.image = new Image();
      this.image.src = this.config.imagePath;
    }
  }

  // Update enemy position - moves left, slight vertical movement
  update(canvasWidth: number, canvasHeight: number): void {
    // Move left
    this.position.x -= this.speed;

    // Slight vertical movement to dodge bullets
    this.position.y += this.verticalDirection * 0.5;
    
    // Bounce off top/bottom edges
    if (this.position.y <= 0 || this.position.y >= canvasHeight - this.size.height) {
      this.verticalDirection *= -1;
    }
    this.position.y = Math.max(0, Math.min(canvasHeight - this.size.height, this.position.y));
  }

  // Check if enemy can shoot
  canShoot(currentTime: number): boolean {
    return (
      this.config.canShoot &&
      currentTime - this.lastShotTime >= this.config.shootInterval
    );
  }

  // Shoot bullet(s) at player - returns array for level 3 enemies (multiple bullets)
  shoot(playerPosition: Position): Bullet[] {
    const currentTime = Date.now();
    if (!this.canShoot(currentTime)) {
      return [];
    }

    this.lastShotTime = currentTime;

    const bulletsPerShot = this.config.bulletsPerShot || 1;
    const bulletSpeed = this.config.bulletSpeed || 4;
    const bullets: Bullet[] = [];

    // Calculate direction to player
    const dx = playerPosition.x - this.position.x;
    const dy = playerPosition.y - this.position.y;
    const distance = Math.sqrt(dx * dx + dy * dy);

    // For level 3 enemies, shoot 2 bullets with slight spread
    if (bulletsPerShot === 2) {
      // First bullet - slightly above center
      const angle1 = Math.atan2(dy - 15, dx);
      bullets.push({
        x: this.position.x,
        y: this.position.y + this.size.height / 2 - 8,
        vx: Math.cos(angle1) * bulletSpeed,
        vy: Math.sin(angle1) * bulletSpeed,
        width: 10,
        height: 10,
        isPlayerBullet: false,
        damage: 10,
      });

      // Second bullet - slightly below center
      const angle2 = Math.atan2(dy + 15, dx);
      bullets.push({
        x: this.position.x,
        y: this.position.y + this.size.height / 2 + 8,
        vx: Math.cos(angle2) * bulletSpeed,
        vy: Math.sin(angle2) * bulletSpeed,
        width: 10,
        height: 10,
        isPlayerBullet: false,
        damage: 10,
      });
    } else {
      // Single bullet for level 2 enemies
      bullets.push({
        x: this.position.x,
        y: this.position.y + this.size.height / 2,
        vx: (dx / distance) * bulletSpeed,
        vy: (dy / distance) * bulletSpeed,
        width: 8,
        height: 8,
        isPlayerBullet: false,
        damage: 10,
      });
    }

    return bullets;
  }

  // Take damage
  takeDamage(amount: number): void {
    this.health = Math.max(0, this.health - amount);
  }

  // Get center position of enemy
  getCenter(): Position {
    return {
      x: this.position.x + this.size.width / 2,
      y: this.position.y + this.size.height / 2,
    };
  }

  // Check if enemy is alive
  isAlive(): boolean {
    return this.health > 0;
  }

  // Check if enemy is off screen
  isOffScreen(): boolean {
    return this.position.x + this.size.width < 0;
  }

  // Draw enemy on canvas
  draw(ctx: CanvasRenderingContext2D): void {
    if (this.image && this.image.complete) {
      ctx.drawImage(
        this.image,
        this.position.x,
        this.position.y,
        this.size.width,
        this.size.height
      );
    } else {
      // Fallback rectangle if image not loaded
      ctx.fillStyle = this.config.level === 1 ? '#10B981' : 
                      this.config.level === 2 ? '#F59E0B' : '#EF4444';
      ctx.fillRect(
        this.position.x,
        this.position.y,
        this.size.width,
        this.size.height
      );
    }

    // Draw health bar
    const barWidth = this.size.width;
    const barHeight = 4;
    const healthPercent = this.health / this.maxHealth;

    ctx.fillStyle = '#FF0000';
    ctx.fillRect(
      this.position.x,
      this.position.y - 8,
      barWidth,
      barHeight
    );

    ctx.fillStyle = '#00FF00';
    ctx.fillRect(
      this.position.x,
      this.position.y - 8,
      barWidth * healthPercent,
      barHeight
    );
  }
}

