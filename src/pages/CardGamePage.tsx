import { useMemo, useState } from 'react';
import { BookOpen, Bot, ChevronLeft, Copy, Play, RotateCcw, Shield, Sparkles, Swords, Volume2, VolumeX } from 'lucide-react';
import { RulesError, type GameCommand, type GameState } from '@scon/rules';
import type { CardDefinition } from '@scon/cards';
import { useAuth } from '../context/useAuth';
import {
  AI_ID,
  HUMAN_ID,
  collection,
  command,
  contentCard,
  createLocalMatch,
  decks,
  describeEvent,
  resolveAutomaticPriority,
  takeAiTurn,
  type LocalMatch,
} from '../features/card-game/localGame';

type View = 'home' | 'collection' | 'match';

const totalCost = (card: CardDefinition) => card.cost.generic + (card.cost.arcane ?? 0) + (card.cost.divine ?? 0) + (card.cost.occult ?? 0) + (card.cost.primal ?? 0);

function GameCard({ card, compact = false }: { card: CardDefinition; compact?: boolean }) {
  return (
    <div className={`overflow-hidden rounded-xl border border-white/10 bg-slate-900 ${compact ? 'w-32' : ''}`}>
      <div className={`${compact ? 'h-16' : 'aspect-[16/8]'} flex items-center justify-center bg-gradient-to-br from-violet-900 to-cyan-950`}>
        <Sparkles className="text-cyan-200/70" size={compact ? 24 : 42} />
      </div>
      <div className={compact ? 'p-2' : 'p-5'}>
        <div className="flex gap-2"><strong className={compact ? 'text-xs' : ''}>{card.name}</strong><span className="ml-auto h-fit rounded-full bg-cyan-300 px-2 text-xs font-bold text-slate-950">{totalCost(card)}</span></div>
        <p className="mt-1 text-[10px] uppercase tracking-wider text-amber-300">{card.type} · {card.traditions.join(' / ')}</p>
        {!compact && <p className="mt-4 text-sm text-slate-300">{card.rulesText}</p>}
        {card.type === 'creature' && <p className="mt-2 font-black text-slate-100">{card.power} / {card.health}</p>}
      </div>
    </div>
  );
}

function getTarget(state: GameState, card: CardDefinition): string | undefined {
  if (card.type === 'magicItem' || card.type === 'consumable') return state.players[HUMAN_ID]!.zones.creatureField[0];
  if (!card.targets.length) return undefined;
  const effect = card.effects[0];
  if (effect?.op === 'dealDamage') return state.players[AI_ID]!.zones.creatureField[0] ?? AI_ID;
  if (effect?.op === 'heal') return HUMAN_ID;
  return state.players[AI_ID]!.zones.creatureField[0] ?? state.players[HUMAN_ID]!.zones.creatureField[0];
}

function BattlefieldCard({ match, id, enemy, onAction }: { match: LocalMatch; id: string; enemy?: boolean; onAction?: () => void }) {
  const instance = match.state.cards[id]!;
  const definition = contentCard(id, match.state);
  const wounded = definition.type === 'creature' ? instance.damage : 0;
  return (
    <button disabled={!onAction} onClick={onAction} className={`relative w-36 rounded-xl border p-3 text-left transition ${enemy ? 'border-rose-300/20 bg-rose-950/30' : 'border-cyan-300/20 bg-cyan-950/30'} ${onAction ? 'hover:-translate-y-1 hover:border-amber-300 focus:-translate-y-1' : ''} ${instance.exhausted ? 'rotate-3 opacity-60' : ''}`}>
      <span className="block text-xs font-bold">{definition.name}</span>
      <span className="mt-1 block text-[10px] uppercase text-slate-400">{definition.type}</span>
      {definition.type === 'creature' && <span className="mt-5 block font-black">{definition.power} / {Math.max(0, definition.health - wounded)}</span>}
      {instance.attachedTo && <span className="mt-2 block text-[10px] text-amber-200">Attached</span>}
    </button>
  );
}

export default function CardGamePage() {
  const { isAuthenticated, login } = useAuth();
  const [view, setView] = useState<View>('home');
  const [deckId, setDeckId] = useState(decks[0]!.id);
  const [match, setMatch] = useState<LocalMatch>(() => createLocalMatch());
  const [sound, setSound] = useState(true);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [error, setError] = useState<string>();
  const [copied, setCopied] = useState(false);

  const chosenDeck = decks.find((deck) => deck.id === deckId) ?? decks[0]!;
  const recentEvents = useMemo(() => match.events.slice(-12).reverse(), [match.events]);

  const start = () => { setMatch(createLocalMatch(deckId)); setError(undefined); setView('match'); };
  const perform = (gameCommand: GameCommand, settle = true) => {
    try {
      const updated = command(match, gameCommand);
      setMatch(settle ? resolveAutomaticPriority(updated) : updated);
      setError(undefined);
    } catch (caught) {
      setError(caught instanceof RulesError ? caught.message : 'The command could not be completed.');
    }
  };
  const play = (id: string) => {
    const card = contentCard(id, match.state);
    const target = getTarget(match.state, card);
    if ((card.type === 'magicItem' || card.type === 'consumable') && !target) { setError('Summon a friendly creature before preparing an attachment.'); return; }
    if (card.targets.length && !target) { setError('There is no legal target for this card.'); return; }
    perform({ type: 'PLAY_CARD', playerId: HUMAN_ID, cardId: id, ...(target ? { targets: [target] } : {}) });
  };
  const endTurn = () => {
    try {
      let updated = command(match, { type: 'END_TURN', playerId: HUMAN_ID });
      updated = takeAiTurn(updated);
      setMatch(updated); setError(undefined);
    } catch (caught) { setError(caught instanceof RulesError ? caught.message : 'The turn could not end.'); }
  };
  const copyReplay = async () => {
    await navigator.clipboard.writeText(JSON.stringify({ seed: match.state.seed, deckId: match.deckId, history: match.history }, null, 2));
    setCopied(true); window.setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="min-h-[calc(100vh-8rem)] bg-[#070b16] text-slate-100">
      <header className="border-b border-cyan-300/15 bg-slate-950/80 px-4 py-3">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3">
          <div><p className="text-xs uppercase tracking-[.35em] text-cyan-300">Westmarch presents</p><h1 className="text-2xl font-bold">Arcana Frontiers</h1></div>
          <div className="flex items-center gap-3"><button className="rounded-lg border border-white/10 p-2" onClick={() => setSound(!sound)} aria-label="Toggle sound">{sound ? <Volume2 /> : <VolumeX />}</button><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={reducedMotion} onChange={(event) => setReducedMotion(event.target.checked)} /> Reduced motion</label></div>
        </div>
      </header>

      {view === 'home' && <main className="mx-auto grid max-w-7xl gap-8 px-4 py-14 lg:grid-cols-[1.2fr_.8fr]">
        <section><p className="mb-4 text-sm font-semibold uppercase tracking-[.3em] text-amber-300">Deterministic fantasy card combat</p><h2 className="max-w-3xl text-5xl font-black leading-tight">Shape mana. Rally legends. Claim the frontier.</h2><p className="mt-5 max-w-2xl text-lg text-slate-300">Play a complete local match against a deterministic rival using the same command validation, stack, combat, attachments, and victory rules as the server.</p><div className="mt-8 flex flex-wrap gap-3"><button onClick={start} className="flex items-center gap-2 rounded-xl bg-cyan-300 px-6 py-3 font-bold text-slate-950"><Play size={18}/> Start match</button><button onClick={() => setView('collection')} className="flex items-center gap-2 rounded-xl border border-white/15 px-6 py-3"><BookOpen size={18}/> Browse all {collection.length} cards</button>{!isAuthenticated && <button onClick={login} className="rounded-xl border border-amber-300/40 px-6 py-3 text-amber-200">Sign in</button>}</div></section>
        <aside className="rounded-3xl border border-cyan-300/15 bg-gradient-to-br from-cyan-500/10 to-violet-500/10 p-7"><Sparkles className="text-cyan-300"/><h3 className="mt-5 text-2xl font-bold">Choose a spellbook</h3><div className="mt-5 space-y-3">{decks.map((deck) => <label key={deck.id} className={`block cursor-pointer rounded-xl border p-4 ${deckId === deck.id ? 'border-cyan-300 bg-cyan-300/10' : 'border-white/10'}`}><input type="radio" className="mr-3" checked={deckId === deck.id} onChange={() => setDeckId(deck.id)} />{deck.name}<span className="ml-2 text-sm text-slate-400">30 cards · legal</span></label>)}</div></aside>
      </main>}

      {view === 'collection' && <main className="mx-auto max-w-7xl px-4 py-10"><button onClick={() => setView('home')} className="mb-6 flex items-center gap-1 text-cyan-300"><ChevronLeft size={16}/> Arcana home</button><h2 className="text-3xl font-bold">Card encyclopedia</h2><p className="mt-2 text-slate-400">The validated FND1 prototype set. Artwork panels are explicit placeholders.</p><div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{collection.map((card) => <GameCard key={card.id} card={card}/>)}</div></main>}

      {view === 'match' && <main className="mx-auto max-w-[1500px] px-3 py-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3"><button onClick={() => setView('home')} className="flex items-center gap-1 text-cyan-300"><ChevronLeft size={16}/> Leave match</button><div className="flex gap-2"><span className="rounded-full border border-emerald-300/30 px-3 py-1 text-xs text-emerald-300">Rules engine · seed {match.state.seed}</span><button onClick={copyReplay} className="flex items-center gap-1 rounded-full border border-white/10 px-3 py-1 text-xs"><Copy size={13}/>{copied ? 'Copied' : 'Replay log'}</button></div></div>
        <div className={`grid min-h-[720px] overflow-hidden rounded-3xl border border-cyan-300/15 bg-[radial-gradient(circle_at_center,_#14213d,_#070b16_70%)] xl:grid-cols-[1fr_300px] ${reducedMotion ? '' : 'transition-all'}`}>
          <section className="flex min-w-0 flex-col justify-between gap-5 p-4 lg:p-6">
            <div className="flex justify-between gap-4"><div><p className="flex items-center gap-2 text-sm text-slate-400"><Bot size={16}/> Rival</p><p className="text-3xl font-black text-rose-300">{match.state.players[AI_ID]!.life} life</p><p className="text-xs text-slate-500">{match.state.players[AI_ID]!.zones.deck.length} deck · {match.state.players[AI_ID]!.zones.boneyard.length} boneyard</p></div><div className="flex gap-1" aria-label={`${match.state.players[AI_ID]!.zones.hand.length} hidden rival cards`}>{match.state.players[AI_ID]!.zones.hand.map((id) => <div key={id} className="h-20 w-12 rounded-md border border-violet-300/30 bg-violet-950 shadow-lg" />)}</div></div>
            <Zone title="Rival field">{match.state.players[AI_ID]!.zones.creatureField.map((id) => <BattlefieldCard key={id} id={id} match={match} enemy />)}</Zone>
            <Zone title="Your field">{match.state.players[HUMAN_ID]!.zones.creatureField.map((id) => <BattlefieldCard key={id} id={id} match={match} onAction={!match.state.cards[id]!.exhausted && match.state.activePlayer === HUMAN_ID && !match.state.stack.length ? () => perform({ type: 'ATTACK', playerId: HUMAN_ID, attackerId: id, targetId: AI_ID }) : undefined}/>)}</Zone>
            <div><div className="mb-3 flex flex-wrap items-end justify-between gap-3"><div><p className="text-sm text-slate-400">You · {chosenDeck.name}</p><p className="text-3xl font-black text-cyan-300">{match.state.players[HUMAN_ID]!.life} life</p><p className="text-xs text-slate-500">{match.state.players[HUMAN_ID]!.zones.deck.length} deck · {match.state.players[HUMAN_ID]!.zones.boneyard.length} boneyard · {match.state.players[HUMAN_ID]!.zones.salvageField.length} salvage</p></div><div className="flex flex-wrap gap-2"><span className="rounded-lg border border-cyan-300/30 px-3 py-2">Mana {match.state.players[HUMAN_ID]!.mana.Generic}</span>{match.state.players[HUMAN_ID]!.zones.fontRow.map((id) => <button key={id} disabled={match.state.cards[id]!.exhausted || match.state.priorityPlayer !== HUMAN_ID} onClick={() => perform({ type: 'ACTIVATE_FONT', playerId: HUMAN_ID, fontId: id, manaType: 'Generic' }, false)} className="rounded-lg border border-violet-300/30 px-3 py-2 text-xs disabled:opacity-40">{match.state.cards[id]!.exhausted ? 'Spent Font' : 'Channel Font'}</button>)}<button disabled={match.state.activePlayer !== HUMAN_ID || Boolean(match.state.result)} onClick={endTurn} className="rounded-lg bg-amber-300 px-4 py-2 font-bold text-slate-950 disabled:opacity-40">End turn</button></div></div>
              <div className="flex gap-2 overflow-x-auto pb-3">{match.state.players[HUMAN_ID]!.zones.hand.map((id) => { const card = contentCard(id, match.state); const canAct = match.state.priorityPlayer === HUMAN_ID && match.state.activePlayer === HUMAN_ID && !match.state.stack.length; return <div key={id} className="w-32 shrink-0"><GameCard card={card} compact/><div className="mt-1 grid grid-cols-2 gap-1"><button disabled={!canAct || card.type === 'font'} onClick={() => play(id)} className="rounded bg-cyan-300 px-2 py-1 text-[11px] font-bold text-slate-950 disabled:opacity-30">Play</button><button disabled={!canAct || match.state.players[HUMAN_ID]!.committedFontThisTurn} onClick={() => perform({ type: 'COMMIT_AS_FONT', playerId: HUMAN_ID, cardId: id }, false)} className="rounded border border-violet-300/40 px-2 py-1 text-[11px] disabled:opacity-30">Font</button></div></div>; })}</div>
            </div>
          </section>
          <aside className="border-l border-white/10 bg-slate-950/70 p-5"><div className="flex items-center gap-2"><Shield className="text-cyan-300"/><h3 className="font-bold">Match inspector</h3></div><p className="mt-5 text-xs uppercase tracking-widest text-amber-300">Turn {match.state.turn} · {match.state.activePlayer === HUMAN_ID ? 'Your action' : 'Rival action'}</p>{error && <div role="alert" className="mt-4 rounded-lg border border-rose-300/30 bg-rose-950/40 p-3 text-sm text-rose-200">{error}</div>}{match.state.result && <div className="mt-4 rounded-xl border border-amber-300/30 bg-amber-300/10 p-4"><p className="text-xl font-black">{match.state.result.winnerId === HUMAN_ID ? 'Victory' : 'Defeat'}</p><p className="text-sm text-slate-300">Result: {match.state.result.reason}</p><button onClick={start} className="mt-3 flex items-center gap-1 rounded-lg bg-cyan-300 px-3 py-2 text-sm font-bold text-slate-950"><RotateCcw size={14}/> Rematch</button></div>}<div className="mt-5 space-y-3" aria-live="polite">{recentEvents.map((event, index) => <p key={`${match.events.length - index}-${event.type}`} className="border-l border-cyan-300/20 pl-3 text-sm text-slate-300">{describeEvent(event)}</p>)}</div><div className="mt-6 border-t border-white/10 pt-4 text-xs text-slate-500"><Swords className="mb-2" size={16}/><p>Click a ready creature to attack. Effects and combat resolve through deterministic priority passes in local mode.</p></div></aside>
        </div>
      </main>}
    </div>
  );
}

function Zone({ title, children }: { title: string; children: React.ReactNode }) {
  return <div className="min-h-32 rounded-2xl border border-white/5 bg-black/10 p-3"><p className="mb-2 text-xs uppercase tracking-widest text-slate-500">{title}</p><div className="flex min-h-20 items-center justify-center gap-3 overflow-x-auto">{children || <span className="text-sm text-slate-600">Empty</span>}</div></div>;
}
