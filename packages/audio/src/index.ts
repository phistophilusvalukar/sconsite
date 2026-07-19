export type AudioBus = 'master' | 'music' | 'ambience' | 'gameplay' | 'ui';
export type AudioSettings = Record<AudioBus, number> & { muted: boolean; muteWhenHidden: boolean; reducedDynamicRange: boolean };
export type SoundProfile = { frequency: number; duration: number; bus: AudioBus; gain?: number };

export const eventSounds: Record<string, SoundProfile> = {
  UI_CLICK: { frequency: 420, duration: 0.06, bus: 'ui', gain: 0.08 },
  CARD_DRAWN: { frequency: 280, duration: 0.08, bus: 'gameplay', gain: 0.08 },
  FONT_COMMITTED: { frequency: 220, duration: 0.12, bus: 'gameplay' },
  MANA_GENERATED: { frequency: 620, duration: 0.12, bus: 'gameplay', gain: 0.08 },
  CARD_PLAYED: { frequency: 390, duration: 0.12, bus: 'gameplay' },
  CREATURE_SUMMONED: { frequency: 330, duration: 0.28, bus: 'gameplay' },
  ATTACK_DECLARED: { frequency: 120, duration: 0.16, bus: 'gameplay' },
  DAMAGE_DEALT: { frequency: 82, duration: 0.2, bus: 'gameplay', gain: 0.16 },
  SPELL_CAST: { frequency: 520, duration: 0.24, bus: 'gameplay' },
  ITEM_EQUIPPED: { frequency: 740, duration: 0.12, bus: 'gameplay', gain: 0.08 },
  ITEM_DROPPED: { frequency: 150, duration: 0.18, bus: 'gameplay' },
  MATCH_ENDED: { frequency: 880, duration: 0.55, bus: 'music', gain: 0.1 },
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
