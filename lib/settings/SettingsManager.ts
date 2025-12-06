// Settings Manager - handles game settings

import { GameSettings } from '../game/types';
import { soundManager } from '../audio/SoundManager';

const DEFAULT_SETTINGS: GameSettings = {
  soundEnabled: true,
  musicEnabled: true,
  soundVolume: 0.7,
  musicVolume: 0.3,
  difficulty: 'normal',
  showFPS: false,
};

export class SettingsManager {
  private settings: GameSettings;

  constructor() {
    this.settings = this.loadSettings();
    this.applySettings();
  }

  // Load settings from localStorage
  private loadSettings(): GameSettings {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('base-shooter-settings');
      if (saved) {
        try {
          return { ...DEFAULT_SETTINGS, ...JSON.parse(saved) };
        } catch (e) {
          console.warn('Failed to load settings:', e);
        }
      }
    }
    return { ...DEFAULT_SETTINGS };
  }

  // Save settings to localStorage
  private saveSettings(): void {
    if (typeof window !== 'undefined') {
      localStorage.setItem('base-shooter-settings', JSON.stringify(this.settings));
    }
  }

  // Apply settings to game
  private applySettings(): void {
    soundManager.setSoundEnabled(this.settings.soundEnabled);
    soundManager.setMusicEnabled(this.settings.musicEnabled);
    soundManager.setSoundVolume(this.settings.soundVolume);
    soundManager.setMusicVolume(this.settings.musicVolume);
  }

  // Get current settings
  getSettings(): GameSettings {
    return { ...this.settings };
  }

  // Update settings
  updateSettings(updates: Partial<GameSettings>): void {
    this.settings = { ...this.settings, ...updates };
    this.saveSettings();
    this.applySettings();
  }

  // Get specific setting
  getSetting<K extends keyof GameSettings>(key: K): GameSettings[K] {
    return this.settings[key];
  }

  // Set specific setting
  setSetting<K extends keyof GameSettings>(key: K, value: GameSettings[K]): void {
    this.settings[key] = value;
    this.saveSettings();
    this.applySettings();
  }

  // Reset to default settings
  reset(): void {
    this.settings = { ...DEFAULT_SETTINGS };
    this.saveSettings();
    this.applySettings();
  }
}

// Singleton instance
export const settingsManager = new SettingsManager();

