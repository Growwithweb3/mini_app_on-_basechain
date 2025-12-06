// Collision detection utilities

import { Position, Size, Bullet } from './types';
import { Enemy } from './Enemy';
import { Base } from './Base';

export class CollisionDetector {
  // Check if two rectangles overlap
  static rectRectCollision(
    pos1: Position,
    size1: Size,
    pos2: Position,
    size2: Size
  ): boolean {
    return (
      pos1.x < pos2.x + size2.width &&
      pos1.x + size1.width > pos2.x &&
      pos1.y < pos2.y + size2.height &&
      pos1.y + size1.height > pos2.y
    );
  }

  // Check if bullet hits enemy
  static bulletEnemyCollision(bullet: Bullet, enemy: Enemy): boolean {
    return this.rectRectCollision(
      { x: bullet.x, y: bullet.y },
      { width: bullet.width, height: bullet.height },
      enemy.position,
      enemy.size
    );
  }

  // Check if bullet hits Base
  static bulletBaseCollision(bullet: Bullet, base: Base): boolean {
    return this.rectRectCollision(
      { x: bullet.x, y: bullet.y },
      { width: bullet.width, height: bullet.height },
      base.position,
      base.size
    );
  }

  // Check if enemy collides with Base (melee attack)
  static enemyBaseCollision(enemy: Enemy, base: Base): boolean {
    return this.rectRectCollision(
      enemy.position,
      enemy.size,
      base.position,
      base.size
    );
  }
}

