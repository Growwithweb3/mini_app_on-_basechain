// Base (Player) class - moves vertically, shoots horizontally

import { Position, Size } from './types';

export class Base {
  public position: Position;
  public size: Size;
  public health: number;
  public maxHealth: number;
  public speed: number;
  public image: HTMLImageElement | null = null;
  public imagePath: string;

  constructor(canvasWidth: number, canvasHeight: number) {
    this.size = { width: 60, height: 60 };
    this.position = {
      x: 50, // Fixed horizontal position on left
      y: canvasHeight / 2 - this.size.height / 2,
    };
    this.health = 100;
    this.maxHealth = 100;
    this.speed = 7;
    this.imagePath = '/images/base-the-shooter.jpg';
    this.loadImage();
  }

  private loadImage(): void {
    // Only load images in browser environment (not during SSR)
    if (typeof window !== 'undefined' && typeof Image !== 'undefined') {
      this.image = new Image();
      this.image.src = this.imagePath;
    }
  }

  // Move up
  moveUp(canvasHeight: number, speedMultiplier: number = 1): void {
    this.position.y = Math.max(0, this.position.y - this.speed * speedMultiplier);
  }

  // Move down
  moveDown(canvasHeight: number, speedMultiplier: number = 1): void {
    this.position.y = Math.min(
      canvasHeight - this.size.height,
      this.position.y + this.speed * speedMultiplier
    );
  }

  // Get center position for bullet spawning
  getCenter(): Position {
    return {
      x: this.position.x + this.size.width,
      y: this.position.y + this.size.height / 2,
    };
  }

  // Take damage
  takeDamage(amount: number): void {
    this.health = Math.max(0, this.health - amount);
  }

  // Check if Base is alive
  isAlive(): boolean {
    return this.health > 0;
  }

  // Draw Base on canvas
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
      ctx.fillStyle = '#3B82F6';
      ctx.fillRect(
        this.position.x,
        this.position.y,
        this.size.width,
        this.size.height
      );
    }
  }
}

