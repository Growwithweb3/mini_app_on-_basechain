// Achievement Manager - tracks and unlocks achievements

import { Achievement } from '../game/types';
import { soundManager } from '../audio/SoundManager';

export class AchievementManager {
  private achievements: Achievement[] = [];
  private unlockedCallbacks: ((achievement: Achievement) => void)[] = [];

  constructor() {
    this.loadAchievements();
  }

  // Initialize all achievements
  private loadAchievements(): void {
    const saved = typeof window !== 'undefined' 
      ? localStorage.getItem('base-shooter-achievements')
      : null;
    
    if (saved) {
      this.achievements = JSON.parse(saved);
    } else {
      // Default achievements
      this.achievements = [
        { id: 'first_kill', name: 'First Blood', description: 'Kill your first enemy', unlocked: false },
        { id: 'level_1', name: 'Level 1 Complete', description: 'Complete Level 1', unlocked: false },
        { id: 'level_2', name: 'Level 2 Complete', description: 'Complete Level 2', unlocked: false },
        { id: 'level_3', name: 'Level 3 Complete', description: 'Complete Level 3', unlocked: false },
        { id: 'combo_5', name: 'Combo Master', description: 'Get a 5x combo', unlocked: false },
        { id: 'combo_10', name: 'Combo Legend', description: 'Get a 10x combo', unlocked: false },
        { id: 'accuracy_80', name: 'Sharpshooter', description: 'Achieve 80% accuracy', unlocked: false },
        { id: 'accuracy_100', name: 'Perfect Aim', description: 'Achieve 100% accuracy', unlocked: false },
        { id: 'survivor', name: 'Survivor', description: 'Survive for 2 minutes', unlocked: false },
        { id: 'power_collector', name: 'Power Collector', description: 'Collect 10 power-ups', unlocked: false },
        { id: 'score_1000', name: 'Score Master', description: 'Score 1000 points', unlocked: false },
        { id: 'score_5000', name: 'Score Legend', description: 'Score 5000 points', unlocked: false },
      ];
      this.saveAchievements();
    }
  }

  // Check and unlock achievements based on game state
  checkAchievements(gameState: any, stats: {
    enemiesKilled: number;
    bulletsShot: number;
    bulletsHit: number;
    gameStartTime: number;
    powerUpsCollected: number;
  }): Achievement[] {
    const newlyUnlocked: Achievement[] = [];
    const now = Date.now();

    // First Kill
    if (stats.enemiesKilled >= 1 && !this.isUnlocked('first_kill')) {
      newlyUnlocked.push(this.unlock('first_kill', now));
    }

    // Level completions
    if (gameState.level >= 2 && !this.isUnlocked('level_1')) {
      newlyUnlocked.push(this.unlock('level_1', now));
    }
    if (gameState.level >= 3 && !this.isUnlocked('level_2')) {
      newlyUnlocked.push(this.unlock('level_2', now));
    }
    if (gameState.isGameOver && gameState.level === 3 && !this.isUnlocked('level_3')) {
      newlyUnlocked.push(this.unlock('level_3', now));
    }

    // Combo achievements
    if (gameState.combo >= 5 && !this.isUnlocked('combo_5')) {
      newlyUnlocked.push(this.unlock('combo_5', now));
    }
    if (gameState.combo >= 10 && !this.isUnlocked('combo_10')) {
      newlyUnlocked.push(this.unlock('combo_10', now));
    }

    // Accuracy achievements
    const accuracy = stats.bulletsShot > 0 
      ? (stats.bulletsHit / stats.bulletsShot) * 100 
      : 0;
    if (accuracy >= 80 && !this.isUnlocked('accuracy_80')) {
      newlyUnlocked.push(this.unlock('accuracy_80', now));
    }
    if (accuracy >= 100 && stats.bulletsShot >= 10 && !this.isUnlocked('accuracy_100')) {
      newlyUnlocked.push(this.unlock('accuracy_100', now));
    }

    // Survivor
    const timePlayed = (now - stats.gameStartTime) / 1000;
    if (timePlayed >= 120 && !this.isUnlocked('survivor')) {
      newlyUnlocked.push(this.unlock('survivor', now));
    }

    // Power Collector
    if (stats.powerUpsCollected >= 10 && !this.isUnlocked('power_collector')) {
      newlyUnlocked.push(this.unlock('power_collector', now));
    }

    // Score achievements
    if (gameState.score >= 1000 && !this.isUnlocked('score_1000')) {
      newlyUnlocked.push(this.unlock('score_1000', now));
    }
    if (gameState.score >= 5000 && !this.isUnlocked('score_5000')) {
      newlyUnlocked.push(this.unlock('score_5000', now));
    }

    return newlyUnlocked;
  }

  // Unlock an achievement
  private unlock(id: string, timestamp: number): Achievement {
    const achievement = this.achievements.find(a => a.id === id);
    if (achievement && !achievement.unlocked) {
      achievement.unlocked = true;
      achievement.unlockedAt = timestamp;
      this.saveAchievements();
      soundManager.playAchievement();
      
      // Notify callbacks
      this.unlockedCallbacks.forEach(callback => callback(achievement));
      
      return achievement;
    }
    return achievement!;
  }

  // Check if achievement is unlocked
  isUnlocked(id: string): boolean {
    const achievement = this.achievements.find(a => a.id === id);
    return achievement?.unlocked || false;
  }

  // Get all achievements
  getAllAchievements(): Achievement[] {
    return this.achievements;
  }

  // Get unlocked achievements
  getUnlockedAchievements(): Achievement[] {
    return this.achievements.filter(a => a.unlocked);
  }

  // Register callback for when achievement is unlocked
  onUnlock(callback: (achievement: Achievement) => void): void {
    this.unlockedCallbacks.push(callback);
  }

  // Save achievements to localStorage
  private saveAchievements(): void {
    if (typeof window !== 'undefined') {
      localStorage.setItem('base-shooter-achievements', JSON.stringify(this.achievements));
    }
  }

  // Reset all achievements (for testing)
  reset(): void {
    this.achievements.forEach(a => {
      a.unlocked = false;
      a.unlockedAt = undefined;
    });
    this.saveAchievements();
  }
}

// Singleton instance
export const achievementManager = new AchievementManager();

