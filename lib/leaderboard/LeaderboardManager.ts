// Leaderboard Manager - handles local leaderboard

export interface LeaderboardEntry {
  name: string;
  score: number;
  level: number;
  enemiesKilled: number;
  accuracy: number;
  timestamp: number;
}

const MAX_ENTRIES = 10;

export class LeaderboardManager {
  private entries: LeaderboardEntry[] = [];

  constructor() {
    this.loadLeaderboard();
  }

  // Load leaderboard from localStorage
  private loadLeaderboard(): void {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('base-shooter-leaderboard');
      if (saved) {
        try {
          this.entries = JSON.parse(saved);
        } catch (e) {
          console.warn('Failed to load leaderboard:', e);
          this.entries = [];
        }
      }
    }
  }

  // Save leaderboard to localStorage
  private saveLeaderboard(): void {
    if (typeof window !== 'undefined') {
      localStorage.setItem('base-shooter-leaderboard', JSON.stringify(this.entries));
    }
  }

  // Add entry to leaderboard
  addEntry(entry: Omit<LeaderboardEntry, 'timestamp'>): boolean {
    const fullEntry: LeaderboardEntry = {
      ...entry,
      timestamp: Date.now(),
    };

    this.entries.push(fullEntry);
    this.entries.sort((a, b) => b.score - a.score); // Sort by score descending
    this.entries = this.entries.slice(0, MAX_ENTRIES); // Keep only top 10
    this.saveLeaderboard();

    // Return true if this entry made it to the leaderboard
    return this.entries.some(e => e.timestamp === fullEntry.timestamp);
  }

  // Get leaderboard entries
  getLeaderboard(): LeaderboardEntry[] {
    return [...this.entries];
  }

  // Get rank for a score
  getRank(score: number): number {
    return this.entries.filter(e => e.score > score).length + 1;
  }

  // Check if score qualifies for leaderboard
  qualifiesForLeaderboard(score: number): boolean {
    if (this.entries.length < MAX_ENTRIES) return true;
    return score > this.entries[this.entries.length - 1].score;
  }

  // Clear leaderboard
  clear(): void {
    this.entries = [];
    this.saveLeaderboard();
  }
}

// Singleton instance
export const leaderboardManager = new LeaderboardManager();

