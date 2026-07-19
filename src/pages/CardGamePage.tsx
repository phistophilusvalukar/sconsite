import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { BookOpen, Bot, ChevronLeft, Copy, Play, RotateCcw, Shield, Sparkles, Swords, Volume2, VolumeX, X } from 'lucide-react';
import { RulesError, type GameCommand, type GameEvent, type GameState } from '@scon/rules';
import type { CardDefinition } from '@scon/cards';
import { ProceduralAudioManager, eventSounds } from '@scon/audio';
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
type MotionKind = 'summon' | 'attack' | 'impact' | 'channel';
interface MotionCue { kind: MotionKind; id?: string }

const totalCost = (card: CardDefinition) => card.cost.generic
  + (card.cost.arcane ?? 0)
  + (card.cost.divine ?? 0)
  + (card.cost.occult ?? 0)
  + (card.cost.primal ?? 0);

const audioSettings = {
  master: 0.8,
  music: 0.7,
  ambience: 0.6,
  gameplay: 0.85,
  ui: 0.7,
  muted: false,
  muteWhenHidden: true,
  reducedDynamicRange: false,
};

function GameCard({ card, compact = false }: { card: CardDefinition; compact?: boolean }) {
  return (
    <div className={`overflow-hidden rounded-xl border border-white/10 bg-slate-900 ${compact ? 'w-32' : ''}`}>
      <div className={`${compact ? 'h-16' : 'aspect-[16/8]'} flex items-center justify-center bg-gradient-to-br from-violet-900 to-cyan-950`}>
        <Sparkles className="text-cyan-200/70" size={compact ? 24 : 42} />
      </div>
      <div className={compact ? 'p-2' : 'p-5'}>
        <div className="flex gap-2">
          <strong className={compact ? 'text-xs' : ''}>{card.name}</strong>
          <span className="ml-auto h-fit rounded-full bg-cyan-300 px-2 text-xs font-bold text-slate-950">{totalCost(card)}</span>
        </div>
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

function BattlefieldCard({
  match,
  id,
  enemy,
  onInspect,
  onAttack,
  motionClass,
}: {
  match: LocalMatch;
  id: string;
  enemy?: boolean;
  onInspect: () => void;
  onAttack?: () => void;
  motionClass?: string;
}) {
  const instance = match.state.cards[id]!;
  const definition = contentCard(id, match.state);
  const wounded = definition.type === 'creature' ? instance.damage : 0;
  return (
    <div className={motionClass}>
      <button
        onClick={onInspect}
        className={`relative w-36 rounded-xl border p-3 text-left transition hover:-translate-y-1 hover:border-amber-300 focus:-translate-y-1 ${enemy ? 'border-rose-300/20 bg-rose-950/30' : 'border-cyan-300/20 bg-cyan-950/30'} ${instance.exhausted ? 'rotate-3 opacity-60' : ''}`}
        aria-label={`Inspect ${definition.name}`}
      >
        <span className="block text-xs font-bold">{definition.name}</span>
        <span className="mt-1 block text-[10px] uppercase text-slate-400">{definition.type}</span>
        {definition.type === 'creature' && <span className="mt-5 block font-black">{definition.power} / {Math.max(0, definition.health - wounded)}</span>}
        {instance.attachedTo && <span className="mt-2 block text-[10px] text-amber-200">Attached</span>}
      </button>
      {onAttack && <button onClick={onAttack} className="mt-1 w-full rounded-md bg-amber-300 px-2 py-1 text-xs font-bold text-slate-950">Attack rival</button>}
    </div>
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
  const [selectedCard, setSelectedCard] = useState<CardDefinition>();
  const [motionCue, setMotionCue] = useState<MotionCue>();
  const [audio] = useState(() => new ProceduralAudioManager({ ...audioSettings }));
  const motionTimer = useRef<number>();

  const chosenDeck = decks.find((deck) => deck.id === deckId) ?? decks[0]!;
  const recentEvents = useMemo(() => match.events.slice(-12).reverse(), [match.events]);

  useEffect(() => {
    audio.settings = { ...audio.settings, muted: !sound };
  }, [audio, sound]);

  useEffect(() => {
    if (!selectedCard) return undefined;
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') setSelectedCard(undefined); };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [selectedCard]);

  useEffect(() => () => window.clearTimeout(motionTimer.current), []);

  const playSound = (type: string) => {
    if (!sound) return;
    audio.unlock();
    const profile = eventSounds[type];
    if (profile) audio.play(profile);
  };

  const showCard = (card: CardDefinition) => {
    playSound('UI_CLICK');
    setSelectedCard(card);
  };

  const feedback = (previousEventCount: number, updated: LocalMatch) => {
    const newEvents = updated.events.slice(previousEventCount);
    newEvents.slice(-4).forEach((event) => playSound(event.type));
    if (reducedMotion) return;
    const animated = [...newEvents].reverse().find((event) => ['CREATURE_SUMMONED', 'ATTACK_DECLARED', 'DAMAGE_DEALT', 'MANA_GENERATED'].includes(event.type));
    if (!animated) return;
    const cue = motionFromEvent(animated);
    setMotionCue(cue);
    window.clearTimeout(motionTimer.current);
    motionTimer.current = window.setTimeout(() => setMotionCue(undefined), 560);
  };

  const updateMatch = (updated: LocalMatch, previousEventCount: number) => {
    setMatch(updated);
    feedback(previousEventCount, updated);
  };

  const start = () => {
    playSound('UI_CLICK');
    setMatch(createLocalMatch(deckId));
    setError(undefined);
    setView('match');
  };

  const perform = (gameCommand: GameCommand, settle = true) => {
    try {
      const previousEventCount = match.events.length;
      const transitioned = command(match, gameCommand);
      const updated = settle ? resolveAutomaticPriority(transitioned) : transitioned;
      updateMatch(updated, previousEventCount);
      setError(undefined);
    } catch (caught) {
      playSound('INVALID_ACTION');
      setError(caught instanceof RulesError ? caught.message : 'The command could not be completed.');
    }
  };

  const play = (id: string) => {
    const card = contentCard(id, match.state);
    const target = getTarget(match.state, card);
    if ((card.type === 'magicItem' || card.type === 'consumable') && !target) {
      playSound('INVALID_ACTION');
      setError('Summon a friendly creature before preparing an attachment.');
      return;
    }
    if (card.targets.length && !target) {
      playSound('INVALID_ACTION');
      setError('There is no legal target for this card.');
      return;
    }
    perform({ type: 'PLAY_CARD', playerId: HUMAN_ID, cardId: id, ...(target ? { targets: [target] } : {}) });
  };

  const endTurn = () => {
    try {
      const previousEventCount = match.events.length;
      let updated = command(match, { type: 'END_TURN', playerId: HUMAN_ID });
      updated = takeAiTurn(updated);
      updateMatch(updated, previousEventCount);
      setError(undefined);
    } catch (caught) {
      playSound('INVALID_ACTION');
      setError(caught instanceof RulesError ? caught.message : 'The turn could not end.');
    }
  };

  const copyReplay = async () => {
    playSound('UI_CLICK');
    await navigator.clipboard.writeText(JSON.stringify({ seed: match.state.seed, deckId: match.deckId, history: match.history }, null, 2));
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  };

  const toggleSound = () => {
    const enabled = !sound;
    audio.settings = { ...audio.settings, muted: !enabled };
    setSound(enabled);
    if (enabled) { audio.unlock(); audio.play(eventSounds.UI_CLICK!); }
  };

  const animationClass = (id: string) => {
    if (reducedMotion || motionCue?.id !== id) return undefined;
    return `arcana-${motionCue.kind}`;
  };

  return (
    <div className="min-h-[calc(100vh-8rem)] bg-[#070b16] text-slate-100">
      <header className="border-b border-cyan-300/15 bg-slate-950/80 px-4 py-3">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3">
          <div><p className="text-xs uppercase tracking-[.35em] text-cyan-300">Westmarch presents</p><h1 className="text-2xl font-bold">Arcana Frontiers</h1></div>
          <div className="flex items-center gap-3">
            <button className="rounded-lg border border-white/10 p-2" onClick={toggleSound} aria-label={sound ? 'Mute sound' : 'Enable sound'} aria-pressed={!sound}>{sound ? <Volume2 /> : <VolumeX />}</button>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={reducedMotion} onChange={(event) => setReducedMotion(event.target.checked)} /> Reduced motion</label>
          </div>
        </div>
      </header>

      {view === 'home' && <HomeView deckId={deckId} setDeckId={setDeckId} start={start} browse={() => setView('collection')} isAuthenticated={isAuthenticated} login={login} />}

      {view === 'collection' && (
        <main className="mx-auto max-w-7xl px-4 py-10">
          <button onClick={() => setView('home')} className="mb-6 flex items-center gap-1 text-cyan-300"><ChevronLeft size={16}/> Arcana home</button>
          <h2 className="text-3xl font-bold">Card encyclopedia</h2>
          <p className="mt-2 text-slate-400">Select any card to inspect its complete rules text, traits, and attribution.</p>
          <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {collection.map((card) => <button key={card.id} onClick={() => showCard(card)} className="rounded-xl text-left transition hover:-translate-y-1 focus:-translate-y-1" aria-label={`Inspect ${card.name}`}><GameCard card={card}/></button>)}
          </div>
        </main>
      )}

      {view === 'match' && (
        <main className="mx-auto max-w-[1500px] px-3 py-5">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <button onClick={() => setView('home')} className="flex items-center gap-1 text-cyan-300"><ChevronLeft size={16}/> Leave match</button>
            <div className="flex gap-2"><span className="rounded-full border border-emerald-300/30 px-3 py-1 text-xs text-emerald-300">Rules engine · seed {match.state.seed}</span><button onClick={copyReplay} className="flex items-center gap-1 rounded-full border border-white/10 px-3 py-1 text-xs"><Copy size={13}/>{copied ? 'Copied' : 'Replay log'}</button></div>
          </div>
          <div className={`grid min-h-[720px] overflow-hidden rounded-3xl border border-cyan-300/15 bg-[radial-gradient(circle_at_center,_#14213d,_#070b16_70%)] xl:grid-cols-[1fr_300px] ${reducedMotion ? '' : 'transition-all'}`}>
            <section className="flex min-w-0 flex-col justify-between gap-5 p-4 lg:p-6">
              <PlayerHeader match={match} playerId={AI_ID} enemy animationClass={animationClass(AI_ID)} />
              <Zone title="Rival field">{match.state.players[AI_ID]!.zones.creatureField.map((id) => <BattlefieldCard key={id} id={id} match={match} enemy onInspect={() => showCard(contentCard(id, match.state))} motionClass={animationClass(id)} />)}</Zone>
              <Zone title="Your field">{match.state.players[HUMAN_ID]!.zones.creatureField.map((id) => <BattlefieldCard key={id} id={id} match={match} onInspect={() => showCard(contentCard(id, match.state))} motionClass={animationClass(id)} onAttack={!match.state.cards[id]!.exhausted && match.state.activePlayer === HUMAN_ID && !match.state.stack.length ? () => perform({ type: 'ATTACK', playerId: HUMAN_ID, attackerId: id, targetId: AI_ID }) : undefined}/>)}</Zone>
              <div>
                <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
                  <div className={animationClass(HUMAN_ID)}><p className="text-sm text-slate-400">You · {chosenDeck.name}</p><p className="text-3xl font-black text-cyan-300">{match.state.players[HUMAN_ID]!.life} life</p><p className="text-xs text-slate-500">{match.state.players[HUMAN_ID]!.zones.deck.length} deck · {match.state.players[HUMAN_ID]!.zones.boneyard.length} boneyard · {match.state.players[HUMAN_ID]!.zones.salvageField.length} salvage</p></div>
                  <div className="flex flex-wrap gap-2">
                    <span className="rounded-lg border border-cyan-300/30 px-3 py-2">Mana {match.state.players[HUMAN_ID]!.mana.Generic}</span>
                    {match.state.players[HUMAN_ID]!.zones.fontRow.map((id) => <button key={id} disabled={match.state.cards[id]!.exhausted || match.state.priorityPlayer !== HUMAN_ID} onClick={() => perform({ type: 'ACTIVATE_FONT', playerId: HUMAN_ID, fontId: id, manaType: 'Generic' }, false)} className={`rounded-lg border border-violet-300/30 px-3 py-2 text-xs disabled:opacity-40 ${animationClass(id) ?? ''}`}>{match.state.cards[id]!.exhausted ? 'Spent Font' : 'Channel Font'}</button>)}
                    <button disabled={match.state.activePlayer !== HUMAN_ID || Boolean(match.state.result)} onClick={endTurn} className="rounded-lg bg-amber-300 px-4 py-2 font-bold text-slate-950 disabled:opacity-40">End turn</button>
                  </div>
                </div>
                <Hand match={match} play={play} perform={perform} inspect={showCard} />
              </div>
            </section>
            <MatchSidebar match={match} error={error} recentEvents={recentEvents} start={start} />
          </div>
        </main>
      )}

      {selectedCard && <CardInspector card={selectedCard} close={() => setSelectedCard(undefined)} />}
    </div>
  );
}

function HomeView({ deckId, setDeckId, start, browse, isAuthenticated, login }: { deckId: string; setDeckId: (id: string) => void; start: () => void; browse: () => void; isAuthenticated: boolean; login: () => Promise<void> }) {
  return <main className="mx-auto grid max-w-7xl gap-8 px-4 py-14 lg:grid-cols-[1.2fr_.8fr]"><section><p className="mb-4 text-sm font-semibold uppercase tracking-[.3em] text-amber-300">Deterministic fantasy card combat</p><h2 className="max-w-3xl text-5xl font-black leading-tight">Shape mana. Rally legends. Claim the frontier.</h2><p className="mt-5 max-w-2xl text-lg text-slate-300">Play a complete local match against a deterministic rival using the same command validation, stack, combat, attachments, and victory rules as the server.</p><div className="mt-8 flex flex-wrap gap-3"><button onClick={start} className="flex items-center gap-2 rounded-xl bg-cyan-300 px-6 py-3 font-bold text-slate-950"><Play size={18}/> Start match</button><button onClick={browse} className="flex items-center gap-2 rounded-xl border border-white/15 px-6 py-3"><BookOpen size={18}/> Browse all {collection.length} cards</button>{!isAuthenticated && <button onClick={login} className="rounded-xl border border-amber-300/40 px-6 py-3 text-amber-200">Sign in</button>}</div></section><aside className="rounded-3xl border border-cyan-300/15 bg-gradient-to-br from-cyan-500/10 to-violet-500/10 p-7"><Sparkles className="text-cyan-300"/><h3 className="mt-5 text-2xl font-bold">Choose a spellbook</h3><div className="mt-5 space-y-3">{decks.map((deck) => <label key={deck.id} className={`block cursor-pointer rounded-xl border p-4 ${deckId === deck.id ? 'border-cyan-300 bg-cyan-300/10' : 'border-white/10'}`}><input type="radio" className="mr-3" checked={deckId === deck.id} onChange={() => setDeckId(deck.id)} />{deck.name}<span className="ml-2 text-sm text-slate-400">30 cards · legal</span></label>)}</div></aside></main>;
}

function PlayerHeader({ match, playerId, enemy, animationClass }: { match: LocalMatch; playerId: string; enemy?: boolean; animationClass?: string }) {
  const player = match.state.players[playerId]!;
  return <div className="flex justify-between gap-4"><div className={animationClass}><p className="flex items-center gap-2 text-sm text-slate-400">{enemy && <Bot size={16}/>} {enemy ? 'Rival' : 'You'}</p><p className={`text-3xl font-black ${enemy ? 'text-rose-300' : 'text-cyan-300'}`}>{player.life} life</p><p className="text-xs text-slate-500">{player.zones.deck.length} deck · {player.zones.boneyard.length} boneyard</p></div>{enemy && <div className="flex gap-1" aria-label={`${player.zones.hand.length} hidden rival cards`}>{player.zones.hand.map((id) => <div key={id} className="h-20 w-12 rounded-md border border-violet-300/30 bg-violet-950 shadow-lg" />)}</div>}</div>;
}

function Hand({ match, play, perform, inspect }: { match: LocalMatch; play: (id: string) => void; perform: (command: GameCommand, settle?: boolean) => void; inspect: (card: CardDefinition) => void }) {
  return <div className="flex gap-2 overflow-x-auto pb-3">{match.state.players[HUMAN_ID]!.zones.hand.map((id) => { const card = contentCard(id, match.state); const canAct = match.state.priorityPlayer === HUMAN_ID && match.state.activePlayer === HUMAN_ID && !match.state.stack.length; return <div key={id} className="w-32 shrink-0"><button onClick={() => inspect(card)} aria-label={`Inspect ${card.name}`} className="rounded-xl text-left transition hover:-translate-y-2 focus:-translate-y-2"><GameCard card={card} compact/></button><div className="mt-1 grid grid-cols-2 gap-1"><button disabled={!canAct || card.type === 'font'} onClick={() => play(id)} className="rounded bg-cyan-300 px-2 py-1 text-[11px] font-bold text-slate-950 disabled:opacity-30">Play</button><button disabled={!canAct || match.state.players[HUMAN_ID]!.committedFontThisTurn} onClick={() => perform({ type: 'COMMIT_AS_FONT', playerId: HUMAN_ID, cardId: id }, false)} className="rounded border border-violet-300/40 px-2 py-1 text-[11px] disabled:opacity-30">Font</button></div></div>; })}</div>;
}

function MatchSidebar({ match, error, recentEvents, start }: { match: LocalMatch; error?: string; recentEvents: readonly GameEvent[]; start: () => void }) {
  return <aside className="border-l border-white/10 bg-slate-950/70 p-5"><div className="flex items-center gap-2"><Shield className="text-cyan-300"/><h3 className="font-bold">Match inspector</h3></div><p className="mt-5 text-xs uppercase tracking-widest text-amber-300">Turn {match.state.turn} · {match.state.activePlayer === HUMAN_ID ? 'Your action' : 'Rival action'}</p>{error && <div role="alert" className="mt-4 rounded-lg border border-rose-300/30 bg-rose-950/40 p-3 text-sm text-rose-200">{error}</div>}{match.state.result && <div className="mt-4 rounded-xl border border-amber-300/30 bg-amber-300/10 p-4"><p className="text-xl font-black">{match.state.result.winnerId === HUMAN_ID ? 'Victory' : 'Defeat'}</p><p className="text-sm text-slate-300">Result: {match.state.result.reason}</p><button onClick={start} className="mt-3 flex items-center gap-1 rounded-lg bg-cyan-300 px-3 py-2 text-sm font-bold text-slate-950"><RotateCcw size={14}/> Rematch</button></div>}<div className="mt-5 space-y-3" aria-live="polite">{recentEvents.map((event, index) => <p key={`${match.events.length - index}-${event.type}`} className="border-l border-cyan-300/20 pl-3 text-sm text-slate-300">{describeEvent(event)}</p>)}</div><div className="mt-6 border-t border-white/10 pt-4 text-xs text-slate-500"><Swords className="mb-2" size={16}/><p>Select a card to inspect it. Use the action below a ready creature to attack.</p></div></aside>;
}

function CardInspector({ card, close }: { card: CardDefinition; close: () => void }) {
  return <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm" onMouseDown={close}><section role="dialog" aria-modal="true" aria-labelledby="card-inspector-title" onMouseDown={(event) => event.stopPropagation()} className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-3xl border border-cyan-300/25 bg-slate-950 shadow-2xl shadow-cyan-950/70"><div className="grid md:grid-cols-[.8fr_1.2fr]"><div className="flex min-h-72 items-center justify-center bg-gradient-to-br from-violet-900 via-cyan-950 to-slate-950 p-8"><Sparkles size={96} className="text-cyan-200/60"/><span className="sr-only">Placeholder artwork for {card.name}</span></div><div className="relative p-7"><button autoFocus onClick={close} className="absolute right-4 top-4 rounded-full border border-white/10 p-2" aria-label="Close card details"><X/></button><p className="text-xs uppercase tracking-[.25em] text-amber-300">{card.setCode} · {card.type} · version {card.version}</p><h2 id="card-inspector-title" className="mt-3 pr-12 text-3xl font-black">{card.name}</h2><div className="mt-3 flex flex-wrap gap-2"><span className="rounded-full bg-cyan-300 px-3 py-1 text-sm font-bold text-slate-950">Cost {totalCost(card)}</span>{card.traditions.map((tradition) => <span key={tradition} className="rounded-full border border-violet-300/30 px-3 py-1 text-sm capitalize">{tradition}</span>)}{card.type === 'creature' && <span className="rounded-full border border-amber-300/30 px-3 py-1 text-sm font-bold">{card.power} power · {card.health} health</span>}</div><div className="mt-7 rounded-xl border border-white/10 bg-white/5 p-5"><h3 className="text-xs font-bold uppercase tracking-widest text-cyan-300">Rules</h3><p className="mt-3 text-lg leading-relaxed text-slate-100">{card.rulesText}</p></div>{card.traits.length > 0 && <p className="mt-5 text-sm"><strong>Traits:</strong> {card.traits.join(', ')}</p>}{card.keywords.length > 0 && <p className="mt-2 text-sm"><strong>Keywords:</strong> {card.keywords.join(', ')}</p>}{card.flavorText && <blockquote className="mt-5 border-l border-amber-300/30 pl-4 italic text-slate-400">{card.flavorText}</blockquote>}<div className="mt-7 border-t border-white/10 pt-4 text-xs text-slate-500"><p>{card.sourceMetadata.attribution}</p><p>License: {card.sourceMetadata.license}</p><p>Artwork: placeholder</p></div></div></div></section></div>;
}

function motionFromEvent(event: GameEvent): MotionCue {
  if (event.type === 'CREATURE_SUMMONED') return { kind: 'summon', id: String(event.instanceId) };
  if (event.type === 'ATTACK_DECLARED') return { kind: 'attack', id: String(event.attackerId) };
  if (event.type === 'DAMAGE_DEALT') return { kind: 'impact', id: String(event.targetId) };
  return { kind: 'channel', id: String(event.fontId) };
}

function Zone({ title, children }: { title: string; children: ReactNode }) {
  return <div className="min-h-32 rounded-2xl border border-white/5 bg-black/10 p-3"><p className="mb-2 text-xs uppercase tracking-widest text-slate-500">{title}</p><div className="flex min-h-20 items-center justify-center gap-3 overflow-x-auto">{children || <span className="text-sm text-slate-600">Empty</span>}</div></div>;
}
