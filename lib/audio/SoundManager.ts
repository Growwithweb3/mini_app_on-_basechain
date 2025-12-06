// Sound Manager - handles all game audio
// Uses Web Audio API for programmatic sound generation (no external files needed)

export class SoundManager {
  private audioContext: AudioContext | null = null;
  private soundEnabled: boolean = true;
  private musicEnabled: boolean = true;
  private musicGainNode: GainNode | null = null;
  private soundGainNode: GainNode | null = null;
  private backgroundMusic: OscillatorNode | null = null;
  private backgroundMusicGain: GainNode | null = null;

  constructor() {
    if (typeof window !== 'undefined') {
      try {
        this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
        this.soundGainNode = this.audioContext.createGain();
        this.musicGainNode = this.audioContext.createGain();
        this.soundGainNode.connect(this.audioContext.destination);
        this.musicGainNode.connect(this.audioContext.destination);
        this.soundGainNode.gain.value = 0.3;
        this.musicGainNode.gain.value = 0.1;
      } catch (e) {
        console.warn('Audio context not available:', e);
      }
    }
  }

  // Play shooting sound
  async playShoot(): Promise<void> {
    if (!this.soundEnabled || !this.audioContext) return;
    // Resume audio context if needed
    if (this.audioContext.state === 'suspended') {
      try {
        await this.audioContext.resume();
      } catch (e) {
        return; // Silently fail
      }
    }
    this.playTone(200, 0.05, 'sine', 0.1);
  }

  // Play hit sound
  playHit(): void {
    if (!this.soundEnabled || !this.audioContext) return;
    this.playTone(150, 0.1, 'square', 0.15);
  }

  // Play explosion sound
  playExplosion(): void {
    if (!this.soundEnabled || !this.audioContext) return;
    // Multi-tone explosion
    for (let i = 0; i < 5; i++) {
      setTimeout(() => {
        this.playTone(50 + i * 20, 0.2, 'sawtooth', 0.1 - i * 0.015);
      }, i * 20);
    }
  }

  // Play power-up pickup sound
  playPowerUp(): void {
    if (!this.soundEnabled || !this.audioContext) return;
    this.playTone(400, 0.15, 'sine', 0.2);
    setTimeout(() => this.playTone(600, 0.15, 'sine', 0.2), 100);
  }

  // Play achievement unlock sound
  playAchievement(): void {
    if (!this.soundEnabled || !this.audioContext) return;
    const notes = [523.25, 659.25, 783.99]; // C, E, G
    notes.forEach((freq, i) => {
      setTimeout(() => {
        this.playTone(freq, 0.3, 'sine', 0.3);
      }, i * 150);
    });
  }

  // Play damage sound
  playDamage(): void {
    if (!this.soundEnabled || !this.audioContext) return;
    this.playTone(100, 0.2, 'sawtooth', 0.2);
  }

  // Play level up sound
  playLevelUp(): void {
    if (!this.soundEnabled || !this.audioContext) return;
    const notes = [261.63, 329.63, 392.00, 523.25]; // C major arpeggio
    notes.forEach((freq, i) => {
      setTimeout(() => {
        this.playTone(freq, 0.4, 'sine', 0.25);
      }, i * 100);
    });
  }

  // Play boss spawn sound
  playBossSpawn(): void {
    if (!this.soundEnabled || !this.audioContext) return;
    for (let i = 0; i < 3; i++) {
      setTimeout(() => {
        this.playTone(80 + i * 10, 0.3, 'sawtooth', 0.3);
      }, i * 200);
    }
  }

  // Generate a tone
  private playTone(
    frequency: number,
    duration: number,
    type: OscillatorType = 'sine',
    volume: number = 0.1
  ): void {
    if (!this.audioContext || !this.soundGainNode) return;

    try {
      const oscillator = this.audioContext.createOscillator();
      const gainNode = this.audioContext.createGain();

      oscillator.type = type;
      oscillator.frequency.value = frequency;

      gainNode.gain.setValueAtTime(volume, this.audioContext.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + duration);

      oscillator.connect(gainNode);
      gainNode.connect(this.soundGainNode);

      oscillator.start(this.audioContext.currentTime);
      oscillator.stop(this.audioContext.currentTime + duration);
    } catch (e) {
      // Silently fail if audio context is not available
    }
  }

  // Start background music
  async startBackgroundMusic(): Promise<void> {
    if (!this.musicEnabled || !this.audioContext || !this.musicGainNode) return;
    
    // Resume audio context if suspended (required for autoplay policy)
    if (this.audioContext.state === 'suspended') {
      try {
        await this.audioContext.resume();
      } catch (e) {
        console.warn('Could not resume audio context:', e);
        return;
      }
    }
    
    this.stopBackgroundMusic();

    // Create a simple ambient background tone
    const oscillator = this.audioContext.createOscillator();
    const gainNode = this.audioContext.createGain();

    oscillator.type = 'sine';
    oscillator.frequency.value = 110; // Low A note

    gainNode.gain.setValueAtTime(0.05, this.audioContext.currentTime);
    gainNode.connect(this.musicGainNode);
    oscillator.connect(gainNode);

    oscillator.start();
    this.backgroundMusic = oscillator;
    this.backgroundMusicGain = gainNode;
  }
  
  // Resume audio context (call after user interaction)
  async resumeAudioContext(): Promise<void> {
    if (this.audioContext && this.audioContext.state === 'suspended') {
      try {
        await this.audioContext.resume();
      } catch (e) {
        console.warn('Could not resume audio context:', e);
      }
    }
  }

  // Stop background music
  stopBackgroundMusic(): void {
    if (this.backgroundMusic) {
      try {
        this.backgroundMusic.stop();
      } catch (e) {
        // Already stopped
      }
      this.backgroundMusic = null;
    }
  }

  // Set sound enabled
  setSoundEnabled(enabled: boolean): void {
    this.soundEnabled = enabled;
  }

  // Get music enabled state
  getMusicEnabled(): boolean {
    return this.musicEnabled;
  }

  // Set music enabled
  setMusicEnabled(enabled: boolean): void {
    this.musicEnabled = enabled;
    if (!enabled) {
      this.stopBackgroundMusic();
    } else {
      this.startBackgroundMusic();
    }
  }

  // Set sound volume (0-1)
  setSoundVolume(volume: number): void {
    if (this.soundGainNode) {
      this.soundGainNode.gain.value = Math.max(0, Math.min(1, volume));
    }
  }

  // Set music volume (0-1)
  setMusicVolume(volume: number): void {
    if (this.musicGainNode) {
      this.musicGainNode.gain.value = Math.max(0, Math.min(1, volume));
    }
  }
}

// Singleton instance
export const soundManager = new SoundManager();

