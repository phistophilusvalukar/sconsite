import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { BookOpen, Bot, ChevronLeft, Copy, Play, RotateCcw, Shield, Sparkles, Swords, Volume2, VolumeX, X } from 'lucide-react';
import { RulesError, cardStats, fontResources, type GameCommand, type GameEvent } from '@scon/rules';
import type { CardDefinition } from '@scon/cards';
import { GlossaryText, KeywordTooltip } from '@scon/ui';
import '@scon/ui/styles.css';
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
interface TargetChoice { id: string; label: string; detail: string }

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
    <div className={`overflow-hidden rounded-xl border border-white/10 bg-slate-950/95 shadow-xl shadow-black/30 ${compact ? 'w-32' : ''}`}>
      <div className={`${compact ? 'h-32' : 'aspect-[2/3]'} overflow-hidden bg-slate-900`}>
        <img src={compact ? card.art.thumbnail : card.art.full} alt={`Artwork for ${card.name}`} loading="lazy" className="h-full w-full object-cover transition duration-300 hover:scale-105" />
      </div>
      <div className={compact ? 'p-2' : 'p-5'}>
        <div className="flex gap-2">
          <strong className={compact ? 'text-xs' : ''}>{card.name}</strong>
          <span className="ml-auto h-fit rounded-full bg-cyan-300 px-2 text-xs font-bold text-slate-950">{totalCost(card)}</span>
        </div>
        <p className="mt-1 text-[10px] uppercase tracking-wider text-amber-300">{card.type} · {card.traditions.join(' / ')}</p>
        {!compact && <p className="mt-4 text-sm text-slate-300"><GlossaryText>{card.rulesText}</GlossaryText></p>}
        {!compact && card.keywords.length > 0 && <div className="mt-3 flex flex-wrap gap-2">{card.keywords.map((keyword) => <KeywordPill key={keyword} keyword={keyword}/>)}</div>}
        {card.type === 'creature' && <p className="mt-2 font-black text-slate-100">{card.power} / {card.health}</p>}
      </div>
    </div>
  );
}

function KeywordPill({ keyword }: { keyword: string }) {
  const descriptions: Record<string, string> = {
    Swift: 'This creature may attack during the turn it is summoned.',
    Guard: 'A ready creature with Guard must block before its controller can take an unblocked hit.',
    Trample: 'Excess combat damage dealt to a blocker carries over to the defending player.',
  };
  return <span className="rounded-full border border-amber-300/35 px-2 py-1 text-xs"><KeywordTooltip keyword={keyword} description={descriptions[keyword] ?? `${keyword} is a game keyword.`}>{keyword}</KeywordTooltip></span>;
}

function legalTargets(match: LocalMatch, card: CardDefinition): TargetChoice[] {
  const target = card.targets[0];
  if (!target) return [];
  const controllers = card.type === 'magicItem' || card.type === 'consumable'
    ? [HUMAN_ID]
    : target.controller === 'self' ? [HUMAN_ID] : target.controller === 'opponent' ? [AI_ID] : [HUMAN_ID, AI_ID];
  const zones = Array.isArray(target.zone) ? target.zone : [target.zone];
  const result: TargetChoice[] = [];
  if (zones.includes('player')) {
    for (const playerId of controllers) result.push({ id: playerId, label: playerId === HUMAN_ID ? 'You' : 'Rival', detail: `${match.state.players[playerId]!.life} life` });
  }
  if (zones.includes('creatureField')) {
    for (const playerId of controllers) {
      for (const id of match.state.players[playerId]!.zones.creatureField) {
        const instance = match.state.cards[id]!;
        if (target.filters.includes('ready') && instance.exhausted) continue;
        if (target.filters.includes('damaged') && instance.damage === 0) continue;
        const definition = contentCard(id, match.state);
        const stats = definition.type === 'creature' ? cardStats(match.state, id) : undefined;
        result.push({ id, label: definition.name, detail: `${playerId === HUMAN_ID ? 'Your' : "Rival's"} creature · ${stats ? `${stats.power}/${Math.max(0, stats.health - instance.damage)}` : definition.type}` });
      }
    }
  }
  return result;
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
  const effectiveStats = definition.type === 'creature' ? cardStats(match.state, id) : undefined;
  return (
    <div className={motionClass}>
      <button
        onClick={onInspect}
        className={`group relative w-36 overflow-hidden rounded-xl border p-0 text-left shadow-xl shadow-black/40 transition hover:-translate-y-1 hover:border-amber-300 focus:-translate-y-1 ${enemy ? 'border-rose-300/35 bg-rose-950/80' : 'border-cyan-300/35 bg-cyan-950/80'} ${instance.exhausted ? 'rotate-3 opacity-60' : ''}`}
        aria-label={`Inspect ${definition.name}`}
      >
        <img src={definition.art.thumbnail} alt="" loading="lazy" className="h-28 w-full object-cover transition duration-300 group-hover:scale-105" />
        <span className="block border-t border-white/10 bg-slate-950/90 p-2 backdrop-blur-sm">
          <span className="block text-xs font-bold">{definition.name}</span>
          <span className="mt-1 flex items-center justify-between gap-2 text-[10px] uppercase text-slate-400"><span>{definition.type}</span>{effectiveStats && <strong className="text-sm text-amber-200">{effectiveStats.power}/{Math.max(0, effectiveStats.health - wounded)}</strong>}</span>
          {instance.attachedTo && <span className="mt-1 block text-[10px] text-amber-200">Attached</span>}
        </span>
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
  const [pendingCardId, setPendingCardId] = useState<string>();
  const [motionCue, setMotionCue] = useState<MotionCue>();
  const [audio] = useState(() => new ProceduralAudioManager({ ...audioSettings }));
  const motionTimer = useRef<number>();

  const chosenDeck = decks.find((deck) => deck.id === deckId) ?? decks[0]!;
  const recentEvents = useMemo(() => match.events.slice(-12).reverse(), [match.events]);
  const humanFonts = fontResources(match.state, HUMAN_ID);
  const pendingAttack = match.state.stack.at(-1)?.kind === 'attack'
    && match.state.stack.at(-1)?.targetId === HUMAN_ID
    && match.state.priorityPlayer === HUMAN_ID
    && !match.state.stack.at(-1)?.blockerId
    ? match.state.stack.at(-1) : undefined;

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
    const animated = [...newEvents].reverse().find((event) => ['CREATURE_SUMMONED', 'ATTACK_DECLARED', 'DAMAGE_DEALT', 'FONT_EXHAUSTED'].includes(event.type));
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
    setPendingCardId(undefined);
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
    if (card.targets.length) {
      if (!legalTargets(match, card).length) {
        playSound('INVALID_ACTION');
        setError('There is no legal target for this card.');
        return;
      }
      playSound('UI_CLICK');
      setPendingCardId(id);
      setError(undefined);
      return;
    }
    perform({ type: 'PLAY_CARD', playerId: HUMAN_ID, cardId: id });
  };

  const chooseTarget = (targetId: string) => {
    if (!pendingCardId) return;
    const cardId = pendingCardId;
    setPendingCardId(undefined);
    perform({ type: 'PLAY_CARD', playerId: HUMAN_ID, cardId, targets: [targetId] });
  };

  const defend = (blockerId?: string) => {
    try {
      const previousEventCount = match.events.length;
      const decision: GameCommand = blockerId
        ? { type: 'BLOCK', playerId: HUMAN_ID, blockerId }
        : { type: 'PASS_PRIORITY', playerId: HUMAN_ID };
      let updated = resolveAutomaticPriority(command(match, decision));
      if (!updated.state.stack.length && updated.state.activePlayer === AI_ID && !updated.state.result) updated = takeAiTurn(updated);
      updateMatch(updated, previousEventCount);
      setError(undefined);
    } catch (caught) {
      playSound('INVALID_ACTION');
      setError(caught instanceof RulesError ? caught.message : 'The combat decision could not be completed.');
    }
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
            {collection.map((card) => <div key={card.id} className="rounded-xl transition hover:-translate-y-1"><GameCard card={card}/><button onClick={() => showCard(card)} className="mt-2 w-full rounded-lg border border-cyan-300/30 px-3 py-2 text-sm text-cyan-200">Enlarge and inspect</button></div>)}
          </div>
        </main>
      )}

      {view === 'match' && (
        <main className="mx-auto max-w-[1500px] px-3 py-5">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <button onClick={() => setView('home')} className="flex items-center gap-1 text-cyan-300"><ChevronLeft size={16}/> Leave match</button>
            <div className="flex gap-2"><span className="rounded-full border border-emerald-300/30 px-3 py-1 text-xs text-emerald-300">Rules engine · seed {match.state.seed}</span><button onClick={copyReplay} className="flex items-center gap-1 rounded-full border border-white/10 px-3 py-1 text-xs"><Copy size={13}/>{copied ? 'Copied' : 'Replay log'}</button></div>
          </div>
          <div className={`grid min-h-[720px] overflow-hidden rounded-3xl border border-cyan-300/25 bg-cover bg-center shadow-2xl shadow-black/60 xl:grid-cols-[1fr_300px] ${reducedMotion ? '' : 'transition-all'}`} style={{ backgroundImage: "linear-gradient(180deg, rgba(3,7,18,.55), rgba(3,7,18,.76)), url('/assets/arcana/battlefield-v1.jpg')" }}>
            <section className="flex min-w-0 flex-col justify-between gap-5 bg-slate-950/20 p-4 backdrop-blur-[1px] lg:p-6">
              <PlayerHeader match={match} playerId={AI_ID} enemy animationClass={animationClass(AI_ID)} />
              <Zone title="Rival field">{match.state.players[AI_ID]!.zones.creatureField.map((id) => <BattlefieldCard key={id} id={id} match={match} enemy onInspect={() => showCard(contentCard(id, match.state))} motionClass={animationClass(id)} />)}</Zone>
              {match.state.players[AI_ID]!.zones.supportField.length > 0 && <Zone title="Rival Auras & support">{match.state.players[AI_ID]!.zones.supportField.map((id) => <BattlefieldCard key={id} id={id} match={match} enemy onInspect={() => showCard(contentCard(id, match.state))} motionClass={animationClass(id)} />)}</Zone>}
              {pendingAttack && <CombatDecision match={match} attackerId={pendingAttack.sourceId} defend={defend}/>}
              <Zone title="Your field">{match.state.players[HUMAN_ID]!.zones.creatureField.map((id) => <BattlefieldCard key={id} id={id} match={match} onInspect={() => showCard(contentCard(id, match.state))} motionClass={animationClass(id)} onAttack={!match.state.cards[id]!.exhausted && match.state.activePlayer === HUMAN_ID && !match.state.stack.length ? () => perform({ type: 'ATTACK', playerId: HUMAN_ID, attackerId: id, targetId: AI_ID }) : undefined}/>)}</Zone>
              {match.state.players[HUMAN_ID]!.zones.supportField.length > 0 && <Zone title="Your Auras & support">{match.state.players[HUMAN_ID]!.zones.supportField.map((id) => <BattlefieldCard key={id} id={id} match={match} onInspect={() => showCard(contentCard(id, match.state))} motionClass={animationClass(id)} />)}</Zone>}
              <div>
                <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
                  <div className={animationClass(HUMAN_ID)}><p className="text-sm text-slate-400">You · {chosenDeck.name}</p><p className="text-3xl font-black text-cyan-300">{match.state.players[HUMAN_ID]!.life} life</p><p className="text-xs text-slate-500">{match.state.players[HUMAN_ID]!.zones.deck.length} deck · {match.state.players[HUMAN_ID]!.zones.boneyard.length} boneyard · {match.state.players[HUMAN_ID]!.zones.salvageField.length} salvage</p></div>
                  <div className="flex flex-wrap gap-2">
                    <span className={`rounded-lg border border-violet-300/30 px-3 py-2 ${animationClass(HUMAN_ID) ?? ''}`}><GlossaryText>Font</GlossaryText> <strong>{humanFonts.ready}/{humanFonts.total}</strong></span>
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
      {pendingCardId && <TargetChooser card={contentCard(pendingCardId, match.state)} choices={legalTargets(match, contentCard(pendingCardId, match.state))} choose={chooseTarget} close={() => setPendingCardId(undefined)} />}
    </div>
  );
}

function HomeView({ deckId, setDeckId, start, browse, isAuthenticated, login }: { deckId: string; setDeckId: (id: string) => void; start: () => void; browse: () => void; isAuthenticated: boolean; login: () => Promise<void> }) {
  return <main className="mx-auto grid max-w-7xl gap-8 px-4 py-14 lg:grid-cols-[1.2fr_.8fr]"><section><p className="mb-4 text-sm font-semibold uppercase tracking-[.3em] text-amber-300">Deterministic fantasy card combat</p><h2 className="max-w-3xl text-5xl font-black leading-tight">Shape mana. Rally legends. Claim the frontier.</h2><p className="mt-5 max-w-2xl text-lg text-slate-300">Play a complete local match against a deterministic rival using the same command validation, stack, combat, attachments, and victory rules as the server.</p><div className="mt-8 flex flex-wrap gap-3"><button onClick={start} className="flex items-center gap-2 rounded-xl bg-cyan-300 px-6 py-3 font-bold text-slate-950"><Play size={18}/> Start match</button><button onClick={browse} className="flex items-center gap-2 rounded-xl border border-white/15 px-6 py-3"><BookOpen size={18}/> Browse all {collection.length} cards</button>{!isAuthenticated && <button onClick={login} className="rounded-xl border border-amber-300/40 px-6 py-3 text-amber-200">Sign in</button>}</div></section><aside className="rounded-3xl border border-cyan-300/15 bg-gradient-to-br from-cyan-500/10 to-violet-500/10 p-7"><Sparkles className="text-cyan-300"/><h3 className="mt-5 text-2xl font-bold">Choose a spellbook</h3><div className="mt-5 space-y-3">{decks.map((deck) => <label key={deck.id} className={`block cursor-pointer rounded-xl border p-4 ${deckId === deck.id ? 'border-cyan-300 bg-cyan-300/10' : 'border-white/10'}`}><input type="radio" className="mr-3" checked={deckId === deck.id} onChange={() => setDeckId(deck.id)} />{deck.name}<span className="ml-2 text-sm text-slate-400">30 cards · legal</span></label>)}</div></aside></main>;
}

function PlayerHeader({ match, playerId, enemy, animationClass }: { match: LocalMatch; playerId: string; enemy?: boolean; animationClass?: string }) {
  const player = match.state.players[playerId]!;
  const fonts = fontResources(match.state, playerId);
  return <div className="flex justify-between gap-4"><div className={animationClass}><p className="flex items-center gap-2 text-sm text-slate-400">{enemy && <Bot size={16}/>} {enemy ? 'Rival' : 'You'}</p><p className={`text-3xl font-black ${enemy ? 'text-rose-300' : 'text-cyan-300'}`}>{player.life} life</p><p className="text-xs text-slate-500">{player.zones.deck.length} deck · {player.zones.boneyard.length} boneyard · Font {fonts.ready}/{fonts.total}</p></div>{enemy && <div className="flex gap-1" aria-label={`${player.zones.hand.length} hidden rival cards`}>{player.zones.hand.map((id) => <div key={id} className="h-20 w-12 rounded-md border border-violet-300/30 bg-violet-950 shadow-lg" />)}</div>}</div>;
}

function Hand({ match, play, perform, inspect }: { match: LocalMatch; play: (id: string) => void; perform: (command: GameCommand, settle?: boolean) => void; inspect: (card: CardDefinition) => void }) {
  return <div className="flex gap-2 overflow-x-auto pb-3">{match.state.players[HUMAN_ID]!.zones.hand.map((id) => { const card = contentCard(id, match.state); const canAct = match.state.priorityPlayer === HUMAN_ID && match.state.activePlayer === HUMAN_ID && !match.state.stack.length; return <div key={id} className="w-32 shrink-0"><button onClick={() => inspect(card)} aria-label={`Inspect ${card.name}`} className="rounded-xl text-left transition hover:-translate-y-2 focus:-translate-y-2"><GameCard card={card} compact/></button><div className="mt-1 grid grid-cols-2 gap-1"><button disabled={!canAct || card.type === 'font'} onClick={() => play(id)} className="rounded bg-cyan-300 px-2 py-1 text-[11px] font-bold text-slate-950 disabled:opacity-30">Play</button><button disabled={!canAct || match.state.players[HUMAN_ID]!.committedFontThisTurn} onClick={() => perform({ type: 'COMMIT_AS_FONT', playerId: HUMAN_ID, cardId: id }, false)} className="rounded border border-violet-300/40 px-2 py-1 text-[11px] disabled:opacity-30">Font</button></div></div>; })}</div>;
}

function MatchSidebar({ match, error, recentEvents, start }: { match: LocalMatch; error?: string; recentEvents: readonly GameEvent[]; start: () => void }) {
  return <aside className="border-l border-white/10 bg-slate-950/70 p-5"><div className="flex items-center gap-2"><Shield className="text-cyan-300"/><h3 className="font-bold">Match inspector</h3></div><p className="mt-5 text-xs uppercase tracking-widest text-amber-300">Turn {match.state.turn} · {match.state.activePlayer === HUMAN_ID ? 'Your action' : 'Rival action'}</p>{error && <div role="alert" className="mt-4 rounded-lg border border-rose-300/30 bg-rose-950/40 p-3 text-sm text-rose-200">{error}</div>}{match.state.result && <div className="mt-4 rounded-xl border border-amber-300/30 bg-amber-300/10 p-4"><p className="text-xl font-black">{match.state.result.winnerId === HUMAN_ID ? 'Victory' : 'Defeat'}</p><p className="text-sm text-slate-300">Result: {match.state.result.reason}</p><button onClick={start} className="mt-3 flex items-center gap-1 rounded-lg bg-cyan-300 px-3 py-2 text-sm font-bold text-slate-950"><RotateCcw size={14}/> Rematch</button></div>}<div className="mt-5 space-y-3" aria-live="polite">{recentEvents.map((event, index) => <p key={`${match.events.length - index}-${event.type}`} className="border-l border-cyan-300/20 pl-3 text-sm text-slate-300">{describeEvent(event)}</p>)}</div><div className="mt-6 border-t border-white/10 pt-4 text-xs text-slate-500"><Swords className="mb-2" size={16}/><p>Select a card to inspect it. Use the action below a ready creature to attack.</p></div></aside>;
}

function CombatDecision({ match, attackerId, defend }: { match: LocalMatch; attackerId: string; defend: (blockerId?: string) => void }) {
  const attacker = contentCard(attackerId, match.state);
  const blockers = match.state.players[HUMAN_ID]!.zones.creatureField.filter((id) => !match.state.cards[id]!.exhausted);
  const guards = blockers.filter((id) => contentCard(id, match.state).keywords.includes('Guard'));
  const choices = guards.length ? guards : blockers;
  return <section role="alert" className="rounded-2xl border-2 border-amber-300/60 bg-amber-300/10 p-4"><h3 className="text-lg font-black text-amber-200">Choose a blocker</h3><p className="mt-1 text-sm text-slate-300">{attacker.name} is attacking you. Creature damage is simultaneous; survivors recover after combat.</p><div className="mt-3 flex flex-wrap gap-2">{choices.map((id) => { const card = contentCard(id, match.state); const stats = cardStats(match.state, id); return <button key={id} onClick={() => defend(id)} className="rounded-lg bg-cyan-300 px-3 py-2 text-sm font-bold text-slate-950">Block with {card.name} ({stats.power}/{Math.max(0, stats.health - match.state.cards[id]!.damage)})</button>; })}<button disabled={guards.length > 0} onClick={() => defend()} className="rounded-lg border border-rose-300/40 px-3 py-2 text-sm text-rose-100 disabled:cursor-not-allowed disabled:opacity-40">{guards.length ? 'Guard must block' : 'Take the hit'}</button></div></section>;
}

function TargetChooser({ card, choices, choose, close }: { card: CardDefinition; choices: readonly TargetChoice[]; choose: (id: string) => void; close: () => void }) {
  return <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm" onMouseDown={close}><section role="dialog" aria-modal="true" aria-labelledby="target-title" onMouseDown={(event) => event.stopPropagation()} className="w-full max-w-xl rounded-3xl border border-amber-300/35 bg-slate-950 p-6 shadow-2xl"><button onClick={close} className="float-right rounded-full border border-white/10 p-2" aria-label="Cancel target selection"><X/></button><p className="text-xs uppercase tracking-widest text-amber-300">Casting {card.name}</p><h2 id="target-title" className="mt-2 text-2xl font-black">Choose a target</h2><p className="mt-2 text-sm text-slate-400">Your Fonts are only spent after you confirm a legal target.</p><div className="mt-5 grid gap-2">{choices.map((choice) => <button key={choice.id} onClick={() => choose(choice.id)} className="rounded-xl border border-cyan-300/25 bg-cyan-950/30 p-4 text-left transition hover:border-cyan-300"><strong className="block">{choice.label}</strong><span className="text-sm text-slate-400">{choice.detail}</span></button>)}</div></section></div>;
}

function CardInspector({ card, close }: { card: CardDefinition; close: () => void }) {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm" onMouseDown={close}>
      <section role="dialog" aria-modal="true" aria-labelledby="card-inspector-title" onMouseDown={(event) => event.stopPropagation()} className="max-h-[92vh] w-full max-w-4xl overflow-y-auto rounded-3xl border border-cyan-300/25 bg-slate-950 shadow-2xl shadow-cyan-950/70">
        <div className="grid md:grid-cols-[.9fr_1.1fr]">
          <div className="min-h-96 overflow-hidden bg-slate-900"><img src={card.art.full} alt={`Artwork for ${card.name}`} className="h-full max-h-[82vh] w-full object-cover" /></div>
          <div className="relative p-7">
            <button autoFocus onClick={close} className="absolute right-4 top-4 rounded-full border border-white/10 p-2" aria-label="Close card details"><X/></button>
            <p className="text-xs uppercase tracking-[.25em] text-amber-300">{card.setCode} · <GlossaryText>{card.type}</GlossaryText> · version {card.version}</p>
            <h2 id="card-inspector-title" className="mt-3 pr-12 text-3xl font-black">{card.name}</h2>
            <div className="mt-3 flex flex-wrap gap-2"><span className="rounded-full bg-cyan-300 px-3 py-1 text-sm font-bold text-slate-950">Cost {totalCost(card)}</span>{card.traditions.map((tradition) => <span key={tradition} className="rounded-full border border-violet-300/30 px-3 py-1 text-sm capitalize">{tradition}</span>)}{card.type === 'creature' && <span className="rounded-full border border-amber-300/30 px-3 py-1 text-sm font-bold"><GlossaryText>{`${card.power} power · ${card.health} health`}</GlossaryText></span>}{card.keywords.map((keyword) => <KeywordPill key={keyword} keyword={keyword}/>)}</div>
            <div className="mt-7 rounded-xl border border-white/10 bg-white/5 p-5"><h3 className="text-xs font-bold uppercase tracking-widest text-cyan-300">Rules</h3><p className="mt-3 text-lg leading-relaxed text-slate-100"><GlossaryText>{card.rulesText}</GlossaryText></p></div>
            {card.traits.length > 0 && <p className="mt-5 text-sm"><strong>Traits:</strong> {card.traits.join(', ')}</p>}
            {card.flavorText && <blockquote className="mt-5 border-l border-amber-300/30 pl-4 italic text-slate-400">{card.flavorText}</blockquote>}
            <div className="mt-7 border-t border-white/10 pt-4 text-xs text-slate-500"><p>{card.sourceMetadata.attribution}</p><p>Content license: {card.sourceMetadata.license}</p><p>{card.art.license.attribution}</p></div>
          </div>
        </div>
      </section>
    </div>
  );
}


function motionFromEvent(event: GameEvent): MotionCue {
  if (event.type === 'CREATURE_SUMMONED') return { kind: 'summon', id: String(event.instanceId) };
  if (event.type === 'ATTACK_DECLARED') return { kind: 'attack', id: String(event.attackerId) };
  if (event.type === 'DAMAGE_DEALT') return { kind: 'impact', id: String(event.targetId) };
  return { kind: 'channel', id: event.playerId ? String(event.playerId) : String(event.fontId) };
}

function Zone({ title, children }: { title: string; children: ReactNode }) {
  return <div className="min-h-32 rounded-2xl border border-white/15 bg-slate-950/45 p-3 shadow-inner shadow-black/40 backdrop-blur-sm"><p className="mb-2 text-xs font-bold uppercase tracking-widest text-slate-300/80">{title}</p><div className="flex min-h-20 items-center justify-center gap-3 overflow-x-auto">{children || <span className="text-sm text-slate-500">Empty</span>}</div></div>;
}
