export type AudioBus = 'master' | 'music' | 'ambience' | 'gameplay' | 'ui';
export type AudioSettings = Record<AudioBus, number> & { muted: boolean; muteWhenHidden: boolean; reducedDynamicRange: boolean };
export type SoundProfile = { frequency: number; duration: number; bus: AudioBus; gain?: number };

export const eventSounds: Record<string, SoundProfile> = {
  FONT_COMMITTED: { frequency: 220, duration: 0.12, bus: 'gameplay' },
  CREATURE_SUMMONED: { frequency: 330, duration: 0.28, bus: 'gameplay' },
  ATTACK_DECLARED: { frequency: 120, duration: 0.16, bus: 'gameplay' },
  SPELL_CAST: { frequency: 520, duration: 0.24, bus: 'gameplay' },
  INVALID_ACTION: { frequency: 90, duration: 0.15, bus: 'ui' },
};

export class ProceduralAudioManager {
  private context?: AudioContext;
  constructor(public settings: AudioSettings) {}
  unlock(): void { this.context ??= new AudioContext(); void this.context.resume(); }
  play(profile: SoundProfile): void {
    if (this.settings.muted || !this.context) return;
    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    const volume = this.settings.master * this.settings[profile.bus] * (profile.gain ?? 0.12);
    oscillator.frequency.value = profile.frequency;
    gain.gain.setValueAtTime(volume, this.context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, this.context.currentTime + profile.duration);
    oscillator.connect(gain).connect(this.context.destination);
    oscillator.start(); oscillator.stop(this.context.currentTime + profile.duration);
  }
  crossfadeMusic(): void { /* Reserved for manifest-backed final music stems. */ }
}
