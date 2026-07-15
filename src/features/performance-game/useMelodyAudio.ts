import { useCallback, useEffect, useRef } from 'react';
import * as Tone from 'tone';
import { EnsembleInstrument, MelodyNote, TimedNoteInput, ToneId } from './performanceGame.types';
import { toneById } from './performanceGame.utils';

interface MelodyAudioOptions {
  muted: boolean;
  beatMs: number;
}

export interface MelodyAudioApi {
  initializeAudio(): Promise<void>;
  playNote(toneId: ToneId): void;
  playMetronome(): void;
  playCountIn(beats: number, beatMs: number, onBeat?: (beat: number) => void): Promise<void>;
  playSequence(sequence: MelodyNote[], onNoteStart?: (index: number) => void): Promise<void>;
  playEnsemble(parts: { instrument: EnsembleInstrument; timedInputs: TimedNoteInput[] }[]): Promise<void>;
}

const wait = (milliseconds: number) => new Promise(resolve => window.setTimeout(resolve, milliseconds));

export const useMelodyAudio = ({ muted, beatMs }: MelodyAudioOptions): MelodyAudioApi => {
  const synthRef = useRef<Tone.Synth | null>(null);
  const metronomeRef = useRef<Tone.MembraneSynth | null>(null);
  const isReadyRef = useRef(false);

  const ensureSynth = useCallback(() => {
    if (!synthRef.current) {
      synthRef.current = new Tone.Synth({
        oscillator: { type: 'sine' },
        envelope: {
          attack: 0.02,
          decay: 0.1,
          sustain: 0.35,
          release: 0.5,
        },
      }).toDestination();
    }

    return synthRef.current;
  }, []);

  const ensureMetronome = useCallback(() => {
    if (!metronomeRef.current) {
      metronomeRef.current = new Tone.MembraneSynth({
        pitchDecay: 0.02,
        octaves: 2,
        envelope: {
          attack: 0.001,
          decay: 0.08,
          sustain: 0,
          release: 0.08,
        },
      }).toDestination();
    }

    return metronomeRef.current;
  }, []);

  const createPartSynth = useCallback((instrument: EnsembleInstrument) => {
    if (instrument === 'marimba') {
      return new Tone.FMSynth({
        harmonicity: 3.01,
        modulationIndex: 11,
        oscillator: { type: 'sine' },
        envelope: { attack: 0.004, decay: 0.28, sustain: 0.05, release: 0.18 },
        modulation: { type: 'square' },
        modulationEnvelope: { attack: 0.003, decay: 0.18, sustain: 0, release: 0.12 },
      }).toDestination();
    }

    if (instrument === 'acousticGuitar') {
      return new Tone.PluckSynth({
        attackNoise: 0.8,
        dampening: 4200,
        resonance: 0.88,
      }).toDestination();
    }

    if (instrument === 'clarinet') {
      return new Tone.AMSynth({
        harmonicity: 2.4,
        oscillator: { type: 'triangle' },
        envelope: { attack: 0.06, decay: 0.18, sustain: 0.62, release: 0.38 },
        modulation: { type: 'sine' },
        modulationEnvelope: { attack: 0.08, decay: 0.12, sustain: 0.35, release: 0.28 },
      }).toDestination();
    }

    return new Tone.Synth({
      oscillator: { type: 'sine' },
      envelope: { attack: 0.09, decay: 0.12, sustain: 0.72, release: 0.55 },
    }).toDestination();
  }, []);

  const initializeAudio = useCallback(async () => {
    ensureSynth();
    ensureMetronome();
    await Promise.race([
      Tone.start(),
      wait(1200),
    ]);
    isReadyRef.current = true;
  }, [ensureMetronome, ensureSynth]);

  const playNote = useCallback((toneId: ToneId) => {
    if (muted || !isReadyRef.current) return;
    const synth = ensureSynth();
    try {
      synth.triggerAttackRelease(toneById[toneId].pitch, Math.max(0.12, beatMs * 0.82 / 1000), Tone.now() + 0.01);
    } catch (error) {
      console.warn('Unable to play melody note:', error);
    }
  }, [beatMs, ensureSynth, muted]);

  const playMetronome = useCallback(() => {
    if (muted || !isReadyRef.current) return;
    try {
      ensureMetronome().triggerAttackRelease('C5', '32n', Tone.now() + 0.005);
    } catch (error) {
      console.warn('Unable to play metronome:', error);
    }
  }, [ensureMetronome, muted]);

  const playCountIn = useCallback(async (beats: number, countInBeatMs: number, onBeat?: (beat: number) => void) => {
    for (let index = 0; index < beats; index += 1) {
      onBeat?.(index + 1);
      playMetronome();
      await wait(countInBeatMs);
    }
  }, [playMetronome]);

  const playSequence = useCallback(async (sequence: MelodyNote[], onNoteStart?: (index: number) => void) => {
    for (const [index, note] of sequence.entries()) {
      onNoteStart?.(index);
      playNote(note.toneId);
      await wait(note.beats * beatMs);
    }
  }, [beatMs, playNote]);

  const playEnsemble = useCallback(async (parts: { instrument: EnsembleInstrument; timedInputs: TimedNoteInput[] }[]) => {
    if (muted || !isReadyRef.current || parts.length === 0) return;
    const synths = parts.map(part => ({
      synth: createPartSynth(part.instrument),
      timedInputs: part.timedInputs,
    }));
    const startAt = Tone.now() + 0.08;
    let longestMs = 0;

    try {
      synths.forEach(({ synth, timedInputs }) => {
        timedInputs.forEach(input => {
          longestMs = Math.max(longestMs, input.enteredAtMs);
          synth.triggerAttackRelease(toneById[input.toneId].pitch, Math.max(0.12, beatMs * 0.82 / 1000), startAt + input.enteredAtMs / 1000);
        });
      });
      await wait(longestMs + beatMs + 220);
    } catch (error) {
      console.warn('Unable to play ensemble:', error);
    } finally {
      synths.forEach(({ synth }) => synth.dispose());
    }
  }, [beatMs, createPartSynth, muted]);

  useEffect(() => () => {
    synthRef.current?.dispose();
    synthRef.current = null;
    metronomeRef.current?.dispose();
    metronomeRef.current = null;
  }, []);

  return { initializeAudio, playNote, playMetronome, playCountIn, playSequence, playEnsemble };
};
