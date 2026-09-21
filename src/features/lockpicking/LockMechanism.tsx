import type { HTMLAttributes, RefObject } from 'react';

/** Shared face and tools from the original thievery minigame. Outcomes belong to the caller. */
export default function LockMechanism({ angle, rotation, elementRef, interactive, ...events }: {
  angle: number; rotation: number; elementRef?: RefObject<HTMLDivElement>; interactive?: boolean;
} & HTMLAttributes<HTMLDivElement>) {
  const center = { left: '50%', top: '50%' };
  return <div ref={elementRef} className={`relative aspect-[16/9] min-h-[280px] select-none overflow-hidden bg-midnight-950 ${interactive ? 'touch-none' : ''}`} {...events}>
    <img src="/lockpicking-workbench.png" alt="Embedded lock mechanism with a pick and tension wrench" className="absolute inset-0 h-full w-full object-cover" draggable={false} />
    <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_0%,transparent_46%,rgba(2,6,23,0.5)_100%)]" />
    <div className="absolute inset-0" style={{ clipPath: 'ellipse(14.8% 26.4% at 50% 50%)' }}>
      <img src="/lockpicking-workbench.png" alt="" className="absolute inset-0 h-full w-full object-cover" draggable={false} style={{ transform: `rotate(${rotation}deg)`, transformOrigin: '50% 50%' }} />
    </div>
    <div className="absolute h-[24%] w-[13.5%] rounded-full border border-yellow-100/15 bg-black/10 shadow-[inset_0_0_24px_rgba(0,0,0,0.65)]" style={{ ...center, transform: `translate(-50%, -50%) rotate(${rotation}deg)` }}>
      <div className="absolute left-1/2 top-[24%] h-[52%] w-[16%] -translate-x-1/2 rounded-b-full bg-black/55 shadow-[0_0_18px_rgba(0,0,0,0.85)]" />
      <div className="absolute left-1/2 top-[23%] h-[26%] w-[24%] -translate-x-1/2 rounded-full bg-black/80" />
    </div>
    <div className="absolute h-[35%] w-[0.42rem] origin-bottom rounded-full bg-gradient-to-t from-zinc-900 via-zinc-400 to-zinc-100 shadow-[0_0_12px_rgba(245,245,245,0.25)]" style={{ ...center, transform: `translate(-50%, -100%) rotate(${angle}deg)` }}>
      <div className="absolute -top-2 left-1/2 h-5 w-3 -translate-x-1/2 rounded-full bg-zinc-100/90" />
    </div>
    <div className="absolute h-[0.68rem] w-[35%] origin-left rounded-full bg-gradient-to-r from-stone-200 via-stone-500 to-stone-900 shadow-[0_8px_18px_rgba(0,0,0,0.55)]" style={{ left: '50%', top: '57%', transform: `translate(-4%, -50%) rotate(${28 + rotation * 0.95}deg)` }}>
      <div className="absolute -left-2 top-1/2 h-5 w-7 -translate-y-1/2 rounded-sm bg-stone-300 shadow-[inset_0_0_5px_rgba(0,0,0,0.5)] ring-1 ring-stone-100/40" />
      <div className="absolute right-0 top-1/2 h-8 w-16 -translate-y-1/2 rounded bg-gradient-to-r from-stone-600 to-stone-900 ring-1 ring-stone-300/30" />
    </div>
  </div>;
}
