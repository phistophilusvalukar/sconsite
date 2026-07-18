import { useMemo, useState } from 'react';
import { BookOpen, Play, Shield, Sparkles, Swords, Volume2, VolumeX } from 'lucide-react';
import { useAuth } from '../context/useAuth';

type Card = { name: string; type: string; cost: number; power?: number; health?: number; text: string; tradition: string };

const cards: Card[] = [
  { name: 'Emberfox Scout', type: 'Creature', cost: 1, power: 2, health: 1, text: 'Quick-footed flamekin explorer.', tradition: 'Arcane' },
  { name: 'Stonewake Guardian', type: 'Creature', cost: 2, power: 2, health: 3, text: 'A patient sentinel raised from living rock.', tradition: 'Primal' },
  { name: 'Starfall Spark', type: 'Spell', cost: 1, text: 'Deal 2 damage to a legal target.', tradition: 'Occult' },
  { name: 'Sanctuary of Dawn', type: 'Aura', cost: 2, text: 'Your creatures carry a ward of first light.', tradition: 'Divine' },
  { name: 'Glimmersteel Saber', type: 'Magic Item', cost: 1, text: 'Equipped creature gains +1 power.', tradition: 'Arcane' },
  { name: 'Bottled Tempest', type: 'Consumable', cost: 1, text: 'Prepare with 2 charges. Exhaust bearer: deal 1 damage.', tradition: 'Primal' },
];

export default function CardGamePage() {
  const { isAuthenticated, login } = useAuth();
  const [view, setView] = useState<'home' | 'collection' | 'match'>('home');
  const [sound, setSound] = useState(true);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [life, setLife] = useState([20, 20]);
  const [mana, setMana] = useState(0);
  const [log, setLog] = useState<string[]>(['Match initialized from seed ARCANA-DEMO.']);
  const deck = useMemo(() => Array.from({ length: 5 }, (_, index) => cards[index % cards.length]), []);

  const act = (message: string, callback?: () => void) => {
    callback?.();
    setLog((current) => [message, ...current].slice(0, 8));
  };

  return (
    <div className="min-h-[calc(100vh-8rem)] bg-[#070b16] text-slate-100">
      <div className="border-b border-cyan-300/15 bg-slate-950/80 px-4 py-3">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3">
          <div><p className="text-xs uppercase tracking-[.35em] text-cyan-300">Westmarch presents</p><h1 className="text-2xl font-bold">Arcana Frontiers</h1></div>
          <div className="flex items-center gap-2">
            <button className="rounded-lg border border-white/10 p-2" onClick={() => setSound(!sound)} aria-label="Toggle sound">{sound ? <Volume2 /> : <VolumeX />}</button>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={reducedMotion} onChange={(event) => setReducedMotion(event.target.checked)} /> Reduced motion</label>
          </div>
        </div>
      </div>

      {view === 'home' && <main className="mx-auto grid max-w-7xl gap-8 px-4 py-16 lg:grid-cols-[1.2fr_.8fr]">
        <section><p className="mb-4 text-sm font-semibold uppercase tracking-[.3em] text-amber-300">Online fantasy card combat</p><h2 className="max-w-3xl text-5xl font-black leading-tight">Shape mana. Rally legends. Claim the frontier.</h2><p className="mt-5 max-w-2xl text-lg text-slate-300">Build an original spellbook and command creatures, Auras, relics, and prepared wonders in deterministic 1v1 battles.</p>
          <div className="mt-8 flex flex-wrap gap-3"><button onClick={() => setView('match')} className="flex items-center gap-2 rounded-xl bg-cyan-300 px-6 py-3 font-bold text-slate-950"><Play size={18}/> Play local slice</button><button onClick={() => setView('collection')} className="flex items-center gap-2 rounded-xl border border-white/15 px-6 py-3"><BookOpen size={18}/> Browse cards</button>{!isAuthenticated && <button onClick={login} className="rounded-xl border border-amber-300/40 px-6 py-3 text-amber-200">Sign in to save decks</button>}</div>
        </section>
        <aside className="rounded-3xl border border-cyan-300/15 bg-gradient-to-br from-cyan-500/10 to-violet-500/10 p-7"><Sparkles className="text-cyan-300"/><h3 className="mt-6 text-2xl font-bold">Prototype spellbook</h3><p className="mt-2 text-slate-300">30 cards · Legal · Arcane / Primal</p><div className="mt-6 grid grid-cols-3 gap-3">{['Creatures 14','Spells 8','Relics 4','Auras 2','Wonders 2','Curve 1.8'].map((item) => <div key={item} className="rounded-lg bg-black/25 p-3 text-sm">{item}</div>)}</div></aside>
      </main>}

      {view === 'collection' && <main className="mx-auto max-w-7xl px-4 py-10"><button onClick={() => setView('home')} className="mb-6 text-cyan-300">← Arcana home</button><h2 className="text-3xl font-bold">Card encyclopedia</h2><p className="mt-2 text-slate-400">Original prototype content with declarative rules.</p><div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{cards.map((card) => <article key={card.name} className="overflow-hidden rounded-2xl border border-white/10 bg-slate-900"><div className="flex aspect-[16/8] items-center justify-center bg-gradient-to-br from-violet-900 to-cyan-950"><Sparkles size={42} className="text-cyan-200/70"/></div><div className="p-5"><div className="flex justify-between"><h3 className="font-bold">{card.name}</h3><span className="rounded-full bg-cyan-300 px-2 py-0.5 text-sm font-bold text-slate-950">{card.cost}</span></div><p className="mt-1 text-xs uppercase tracking-wider text-amber-300">{card.type} · {card.tradition}</p><p className="mt-4 text-sm text-slate-300">{card.text}</p>{card.power && <p className="mt-4 font-bold">{card.power} / {card.health}</p>}</div></article>)}</div></main>}

      {view === 'match' && <main className="mx-auto max-w-7xl px-3 py-5"><div className="mb-3 flex items-center justify-between"><button onClick={() => setView('home')} className="text-cyan-300">← Leave local match</button><div className="rounded-full border border-emerald-300/30 px-3 py-1 text-xs text-emerald-300">Authoritative local transport</div></div><div className={`grid min-h-[680px] overflow-hidden rounded-3xl border border-cyan-300/15 bg-[radial-gradient(circle_at_center,_#14213d,_#070b16_70%)] lg:grid-cols-[1fr_280px] ${reducedMotion ? '' : 'transition-all'}`}>
        <section className="flex flex-col justify-between p-5"><div className="flex justify-between"><div><p className="text-sm text-slate-400">Rival</p><p className="text-2xl font-black text-rose-300">{life[1]} life</p></div><div className="flex gap-1">{deck.map((_, i) => <div key={i} className="h-20 w-12 rounded-md border border-violet-300/30 bg-violet-950" />)}</div></div><div className="space-y-5"><div className="mx-auto flex min-h-32 max-w-3xl items-center justify-center gap-3 rounded-2xl border border-white/5 bg-black/10"><span className="text-sm text-slate-500">Opponent creature field</span></div><div className="mx-auto flex min-h-36 max-w-3xl items-center justify-center gap-3 rounded-2xl border border-cyan-300/10 bg-cyan-950/10"><button onClick={() => act('Emberfox Scout attacked the opposing player.', () => setLife(([you, foe]) => [you, Math.max(0, foe - 2)]))} className="rounded-xl border border-amber-300/30 bg-amber-950/40 p-4 text-left"><Swords className="mb-4 text-amber-300"/><strong>Emberfox Scout</strong><p className="text-sm text-slate-400">Click to attack · 2/1</p></button></div></div><div><div className="mb-3 flex items-center justify-between"><div><p className="text-sm text-slate-400">You</p><p className="text-2xl font-black text-cyan-300">{life[0]} life</p></div><div className="flex gap-2"><button onClick={() => act('A card was committed face-down as a basic Font.', () => setMana((value) => value + 1))} className="rounded-lg bg-cyan-300 px-3 py-2 font-bold text-slate-950">Commit Font</button><span className="rounded-lg border border-cyan-300/30 px-3 py-2">Mana {mana}</span></div></div><div className="flex justify-center gap-2 overflow-x-auto">{deck.map((card, i) => <button key={`${card.name}-${i}`} onClick={() => mana >= card.cost ? act(`${card.name} entered the action stack.`, () => setMana((value) => value - card.cost)) : act(`Rejected ${card.name}: insufficient mana.`)} className="h-36 w-28 shrink-0 rounded-xl border border-white/15 bg-slate-800 p-3 text-left text-xs hover:-translate-y-2 focus:-translate-y-2"><span className="font-bold">{card.name}</span><span className="mt-2 block text-cyan-300">Cost {card.cost}</span></button>)}</div></div></section>
        <aside className="border-l border-white/10 bg-slate-950/60 p-5"><div className="flex items-center gap-2"><Shield className="text-cyan-300"/><h3 className="font-bold">Match inspector</h3></div><p className="mt-5 text-xs uppercase tracking-widest text-amber-300">Priority: You</p><div className="mt-5 space-y-3" aria-live="polite">{log.map((entry, i) => <p key={`${entry}-${i}`} className="border-l border-cyan-300/20 pl-3 text-sm text-slate-300">{entry}</p>)}</div></aside>
      </div></main>}
    </div>
  );
}
