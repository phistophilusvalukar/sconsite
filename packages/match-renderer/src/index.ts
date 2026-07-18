export type AnimationStep = { kind: 'move' | 'pulse' | 'particles' | 'sound' | 'text'; durationMs: number; value?: string };
export interface AnimationProfile { id: string; eventTags: string[]; timeline: AnimationStep[]; reducedMotionTimeline?: AnimationStep[] }
export const animationProfiles: AnimationProfile[] = [
  { id: 'summon.default', eventTags: ['summon.beast', 'summon.humanoid'], timeline: [{ kind: 'move', durationMs: 180 }, { kind: 'particles', durationMs: 240 }, { kind: 'pulse', durationMs: 120 }, { kind: 'sound', durationMs: 0 }], reducedMotionTimeline: [{ kind: 'pulse', durationMs: 80 }] },
  { id: 'combat.melee', eventTags: ['creature.attack.melee'], timeline: [{ kind: 'move', durationMs: 140 }, { kind: 'sound', durationMs: 0 }, { kind: 'text', durationMs: 180 }], reducedMotionTimeline: [{ kind: 'text', durationMs: 120 }] },
  { id: 'spell.default', eventTags: ['spell.fire', 'spell.healing'], timeline: [{ kind: 'particles', durationMs: 220 }, { kind: 'sound', durationMs: 0 }, { kind: 'text', durationMs: 200 }], reducedMotionTimeline: [{ kind: 'text', durationMs: 120 }] },
];

export class VisualEventQueue<T> {
  private queue: T[] = [];
  enqueue(event: T): void { this.queue.push(event); }
  drain(): T[] { return this.queue.splice(0); }
  reconcile(): void { this.queue.length = 0; }
}
