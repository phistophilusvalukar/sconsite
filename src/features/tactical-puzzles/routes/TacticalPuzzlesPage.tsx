import { useEffect, useMemo, useRef, useState } from 'react';
import type { ChangeEvent, CSSProperties } from 'react';
import {
  CheckCircle2,
  ChevronLeft,
  Copy,
  Download,
  FileJson,
  FlaskConical,
  Lightbulb,
  Pencil,
  Plus,
  RotateCcw,
  Save,
  Shield,
  Swords,
  Trash2,
  Undo2,
  Upload
} from 'lucide-react';
import { useAuth } from '../../../context/useAuth';
import {
  listPuzzleProgress,
  puzzleRepository,
  recordPuzzleCompletion,
  type PuzzleDesignRecord,
  type PuzzleProgress
} from '../api/puzzleRepository';
import { bundledPuzzles, createDraftPuzzle, createEditorCreature } from '../data/puzzles';
import {
  ACTION_LIBRARY,
  describeObjective,
  effectiveArmorClass,
  executeCommand,
  getAttackModifierBreakdown,
  getActiveCreatureId,
  getCreatureDefinition,
  initializeGame,
  legalDestinations,
  legalTargets,
  previewLine
} from '../engine/gameEngine';
import { isFlanked, normalizeDirection, positionKey, samePosition, validShoveDestinations } from '../engine/geometry';
import { safeParsePuzzleDefinition } from '../engine/schema';
import type {
  ActionId,
  CreatureDefinition,
  Difficulty,
  GameCommand,
  GameState,
  GridPosition,
  ObjectiveDefinition,
  PuzzleDefinition,
  PuzzleValidationResult,
  Team
} from '../engine/types';
import { validatePuzzle } from '../engine/validation';
import './tacticalPuzzles.css';

type View = 'library' | 'play' | 'editor';

export default function TacticalPuzzlesPage() {
  const { user, isAuthenticated } = useAuth();
  const [view, setView] = useState<View>('library');
  const [selectedPuzzle, setSelectedPuzzle] = useState<PuzzleDefinition>(bundledPuzzles[0]);
  const [editorDraft, setEditorDraft] = useState<PuzzleDefinition>(() => createDraftPuzzle());
  const [designs, setDesigns] = useState<PuzzleDesignRecord[]>([]);
  const [progress, setProgress] = useState<PuzzleProgress[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [testPlaying, setTestPlaying] = useState(false);
  const userId = user?.id ?? null;

  useEffect(() => {
    let current = true;
    setLoadError(null);
    Promise.all([puzzleRepository.list(userId), listPuzzleProgress(userId)])
      .then(([nextDesigns, nextProgress]) => {
        if (!current) return;
        setDesigns(nextDesigns);
        setProgress(nextProgress);
      })
      .catch(error => {
        if (current) setLoadError(error instanceof Error ? error.message : 'Could not load saved tactical puzzles.');
      });
    return () => { current = false; };
  }, [userId]);

  function playPuzzle(puzzle: PuzzleDefinition) {
    setSelectedPuzzle(puzzle);
    setTestPlaying(false);
    setView('play');
  }

  function editPuzzle(puzzle?: PuzzleDefinition) {
    setEditorDraft(puzzle ? clonePuzzle(puzzle) : createDraftPuzzle());
    setView('editor');
  }

  function testPuzzle(puzzle: PuzzleDefinition) {
    setEditorDraft(puzzle);
    setSelectedPuzzle(puzzle);
    setTestPlaying(true);
    setView('play');
  }

  async function saveDraft(puzzle: PuzzleDefinition) {
    const saved = await puzzleRepository.save(puzzle, userId);
    setDesigns(current => [saved, ...current.filter(record => record.puzzle.id !== saved.puzzle.id)]);
    setEditorDraft(saved.puzzle);
    return saved;
  }

  function handleCompleted(saved: PuzzleProgress) {
    setProgress(current => [saved, ...current.filter(item => item.puzzleKey !== saved.puzzleKey)]);
  }

  const completedIds = new Set(progress.filter(item => item.status === 'completed').map(item => item.puzzleKey));

  return (
    <div className="tp-shell">
      {view === 'library' && (
        <PuzzleLibrary
          designs={designs}
          completedIds={completedIds}
          isAuthenticated={isAuthenticated}
          loadError={loadError}
          onPlay={playPuzzle}
          onEdit={editPuzzle}
        />
      )}
      {view === 'play' && (
        <PuzzlePlayer
          key={`${selectedPuzzle.id}-${testPlaying ? 'test' : 'play'}`}
          puzzle={selectedPuzzle}
          userId={userId}
          isTestPlay={testPlaying}
          onBack={() => setView(testPlaying ? 'editor' : 'library')}
          onCompleted={handleCompleted}
        />
      )}
      {view === 'editor' && (
        <PuzzleEditor
          draft={editorDraft}
          isAuthenticated={isAuthenticated}
          onBack={() => setView('library')}
          onChange={setEditorDraft}
          onSave={saveDraft}
          onTest={testPuzzle}
        />
      )}
    </div>
  );
}

function PuzzleLibrary({
  designs,
  completedIds,
  isAuthenticated,
  loadError,
  onPlay,
  onEdit
}: {
  designs: PuzzleDesignRecord[];
  completedIds: Set<string>;
  isAuthenticated: boolean;
  loadError: string | null;
  onPlay: (puzzle: PuzzleDefinition) => void;
  onEdit: (puzzle?: PuzzleDefinition) => void;
}) {
  const [difficulty, setDifficulty] = useState<Difficulty | 'all'>('all');
  const [query, setQuery] = useState('');
  const normalizedQuery = query.trim().toLowerCase();
  const visiblePuzzles = bundledPuzzles.filter(puzzle => (
    (difficulty === 'all' || puzzle.difficulty === difficulty) &&
    (!normalizedQuery || `${puzzle.title} ${puzzle.summary} ${puzzle.tags.join(' ')}`.toLowerCase().includes(normalizedQuery))
  ));

  return (
    <main className="tp-library">
      <section className="tp-hero">
        <div>
          <p className="tp-eyebrow">Pathfinder 2e · Deterministic combat labs</p>
          <h1>Tactical Puzzles</h1>
          <p>Every roll is known. Every action matters. Solve compact combat encounters—or build one for your table.</p>
          <div className="tp-hero-actions">
            <button className="tp-button tp-button-primary" onClick={() => onPlay(bundledPuzzles[0])}><Swords /> Play first puzzle</button>
            <button className="tp-button" onClick={() => onEdit()}><Pencil /> Create puzzle</button>
          </div>
        </div>
        <div className="tp-hero-mark" aria-hidden="true"><Shield /><span>d20</span></div>
      </section>

      {loadError && <div className="tp-notice tp-notice-error">{loadError}</div>}
      {!isAuthenticated && <div className="tp-notice">You can play immediately. Sign in to sync designs and completion status with Supabase; anonymous drafts stay in this browser.</div>}

      <section className="tp-library-toolbar" aria-label="Puzzle filters">
        <input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search puzzles or tags…" />
        <select value={difficulty} onChange={event => setDifficulty(event.target.value as Difficulty | 'all')}>
          <option value="all">All difficulties</option>
          <option value="tutorial">Tutorial</option>
          <option value="easy">Easy</option>
          <option value="moderate">Moderate</option>
          <option value="hard">Hard</option>
          <option value="expert">Expert</option>
        </select>
      </section>

      <section>
        <div className="tp-section-heading"><div><p className="tp-eyebrow">Academy collection</p><h2>Choose a challenge</h2></div><span>{visiblePuzzles.length} puzzles</span></div>
        <div className="tp-card-grid">
          {visiblePuzzles.map((puzzle, index) => (
            <article className="tp-puzzle-card" key={puzzle.id}>
              <div className="tp-card-number">{String(index + 1).padStart(2, '0')}</div>
              <div className="tp-card-topline"><span className={`tp-difficulty ${puzzle.difficulty}`}>{puzzle.difficulty}</span>{completedIds.has(puzzle.id) && <span className="tp-complete"><CheckCircle2 /> Solved</span>}</div>
              <h3>{puzzle.title}</h3>
              <p>{puzzle.summary}</p>
              <div className="tp-tags">{puzzle.tags.map(tag => <span key={tag}>{tag}</span>)}</div>
              <button className="tp-button tp-button-primary" onClick={() => onPlay(puzzle)}>Enter encounter</button>
            </article>
          ))}
        </div>
      </section>

      <section className="tp-drafts">
        <div className="tp-section-heading"><div><p className="tp-eyebrow">GM workshop</p><h2>Your puzzle designs</h2></div><button className="tp-button" onClick={() => onEdit()}><Plus /> New design</button></div>
        {designs.length === 0 ? (
          <div className="tp-empty"><FileJson /><h3>No saved designs yet</h3><p>Build on the visual grid, validate the data, then test it in the real rules engine.</p></div>
        ) : (
          <div className="tp-design-list">
            {designs.map(record => (
              <article key={record.puzzle.id}>
                <div><strong>{record.puzzle.title}</strong><span>{record.storage === 'supabase' ? 'Synced to Supabase' : 'Saved in this browser'} · {new Date(record.updatedAt).toLocaleDateString()}</span></div>
                <div><button className="tp-button tp-button-small" onClick={() => onPlay(record.puzzle)}>Play</button><button className="tp-button tp-button-small" onClick={() => onEdit(record.puzzle)}>Edit</button></div>
              </article>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}

function PuzzlePlayer({
  puzzle,
  userId,
  isTestPlay,
  onBack,
  onCompleted
}: {
  puzzle: PuzzleDefinition;
  userId: string | null;
  isTestPlay: boolean;
  onBack: () => void;
  onCompleted: (progress: PuzzleProgress) => void;
}) {
  const [game, setGame] = useState<GameState>(() => initializeGame(puzzle));
  const [history, setHistory] = useState<GameState[]>([]);
  const [selectedAction, setSelectedAction] = useState<ActionId | null>(null);
  const [selectedCreatureId, setSelectedCreatureId] = useState<string>(() => getActiveCreatureId(initializeGame(puzzle)) ?? puzzle.creatures[0].id);
  const [pendingTargetId, setPendingTargetId] = useState<string | null>(null);
  const [previewTarget, setPreviewTarget] = useState<GridPosition | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showHint, setShowHint] = useState(false);
  const completionRecorded = useRef(false);
  const activeId = getActiveCreatureId(game);
  const activeDefinition = activeId ? getCreatureDefinition(game, activeId) : undefined;
  const selectedDefinition = getCreatureDefinition(game, selectedCreatureId);
  const selectedRuntime = game.creatures[selectedCreatureId];

  useEffect(() => {
    if (game.status !== 'victory' || completionRecorded.current || isTestPlay) return;
    completionRecorded.current = true;
    recordPuzzleCompletion(userId, puzzle, game.commandCount)
      .then(onCompleted)
      .catch(saveError => setError(saveError instanceof Error ? saveError.message : 'Solved, but completion status could not be saved.'));
  }, [game.commandCount, game.status, isTestPlay, onCompleted, puzzle, userId]);

  const movementSquares = useMemo(() => activeId && (selectedAction === 'stride' || selectedAction === 'step')
    ? legalDestinations(game, activeId, selectedAction)
    : [], [activeId, game, selectedAction]);
  const targetIds = useMemo(() => activeId && selectedAction && !['stride', 'step', 'delay', 'lightning-bolt'].includes(selectedAction)
    ? legalTargets(game, activeId, selectedAction)
    : [], [activeId, game, selectedAction]);
  const shoveSquares = useMemo(() => activeId && selectedAction === 'shove' && pendingTargetId
    ? validShoveDestinations(game, activeId, pendingTargetId)
    : [], [activeId, game, pendingTargetId, selectedAction]);
  const linePreview = useMemo(() => activeId && selectedAction === 'lightning-bolt' && previewTarget
    ? previewLine(game, activeId, previewTarget)
    : [], [activeId, game, previewTarget, selectedAction]);

  function dispatch(command: GameCommand) {
    const result = executeCommand(game, command);
    if (result.error) {
      setError(result.error);
      return;
    }
    setHistory(current => [...current, game]);
    setGame(result.state);
    setError(null);
    setSelectedAction(null);
    setPendingTargetId(null);
    setPreviewTarget(null);
    const nextActive = getActiveCreatureId(result.state);
    if (nextActive) setSelectedCreatureId(nextActive);
  }

  function chooseAction(actionId: ActionId) {
    if (!activeId) return;
    if (actionId === 'delay') {
      dispatch({ type: 'USE_ACTION', actorId: activeId, actionId });
      return;
    }
    setSelectedAction(current => current === actionId ? null : actionId);
    setPendingTargetId(null);
    setPreviewTarget(null);
    setError(null);
  }

  function interactWithSquare(position: GridPosition, creatureId?: string) {
    if (!activeId || !selectedAction) {
      if (creatureId) setSelectedCreatureId(creatureId);
      return;
    }
    if (selectedAction === 'stride' || selectedAction === 'step') {
      dispatch({ type: 'USE_ACTION', actorId: activeId, actionId: selectedAction, destination: position });
    } else if (selectedAction === 'lightning-bolt') {
      dispatch({ type: 'USE_ACTION', actorId: activeId, actionId: selectedAction, direction: normalizeDirection(game.creatures[activeId].position, position) });
    } else if (selectedAction === 'shove') {
      if (!pendingTargetId && creatureId) setPendingTargetId(creatureId);
      else if (pendingTargetId) dispatch({ type: 'USE_ACTION', actorId: activeId, actionId: selectedAction, targetId: pendingTargetId, destination: position });
    } else if (creatureId) {
      dispatch({ type: 'USE_ACTION', actorId: activeId, actionId: selectedAction, targetId: creatureId });
    }
  }

  function undo() {
    const previous = history[history.length - 1];
    if (!previous) return;
    setGame(previous);
    setHistory(current => current.slice(0, -1));
    setSelectedAction(null);
    setPendingTargetId(null);
    setError(null);
    completionRecorded.current = false;
  }

  function reset() {
    const initial = initializeGame(puzzle);
    setGame(initial);
    setHistory([]);
    setSelectedAction(null);
    setPendingTargetId(null);
    setError(null);
    completionRecorded.current = false;
    setSelectedCreatureId(getActiveCreatureId(initial) ?? puzzle.creatures[0].id);
  }

  return (
    <main className="tp-player">
      <header className="tp-player-header">
        <button className="tp-icon-button" onClick={onBack} aria-label={isTestPlay ? 'Return to editor' : 'Return to library'}><ChevronLeft /></button>
        <div><p className="tp-eyebrow">{isTestPlay ? 'Editor test play' : puzzle.difficulty}</p><h1>{puzzle.title}</h1></div>
        <div className="tp-round"><span>Round</span><strong>{game.round}/{puzzle.maxRounds}</strong></div>
      </header>

      <section className="tp-objective-bar">
        <div><Shield /><span><small>Objective</small>{describeObjective(puzzle)}</span></div>
        <div className={`tp-status ${game.status}`}>{game.status === 'playing' ? `${game.actionsRemaining} actions` : game.status === 'victory' ? 'Solved' : 'Failed'}</div>
      </section>
      {error && <div className="tp-notice tp-notice-error">{error}</div>}

      <div className="tp-play-layout">
        <aside className="tp-panel tp-initiative-panel">
          <div className="tp-panel-heading"><span>Initiative</span><strong>Round {game.round}</strong></div>
          <ol className="tp-initiative">
            {game.initiativeOrder.map(id => {
              const definition = getCreatureDefinition(game, id);
              const runtime = game.creatures[id];
              if (!definition || !runtime) return null;
              return <li key={id} className={`${activeId === id ? 'active' : ''} ${runtime.hp <= 0 ? 'defeated' : ''}`} onClick={() => setSelectedCreatureId(id)}><span className={`tp-team-dot ${definition.team}`} /><div><strong>{definition.name}</strong><small>{game.delayedCreatureIds.includes(id) ? 'DELAYING' : `${definition.initiative} initiative`}</small></div>{activeId === id && <span className="tp-active-arrow">▶</span>}</li>;
            })}
          </ol>
          {game.delayedCreatureIds.length > 0 && game.status === 'playing' && <div className="tp-resume-list"><small>Resume before the active turn</small>{game.delayedCreatureIds.map(id => <button key={id} className="tp-button tp-button-small" onClick={() => dispatch({ type: 'RESUME_DELAYED', actorId: id })}>Resume {getCreatureDefinition(game, id)?.name}</button>)}</div>}
        </aside>

        <section className="tp-board-column">
          <TacticalBoard
            game={game}
            selectedCreatureId={selectedCreatureId}
            movementSquares={movementSquares}
            targetIds={targetIds}
            shoveSquares={shoveSquares}
            linePreview={linePreview}
            selectedAction={selectedAction}
            activeId={activeId}
            onHover={setPreviewTarget}
            onInteract={interactWithSquare}
          />
          <div className="tp-action-dock">
            <div className="tp-action-summary"><div><span>Active creature</span><strong>{activeDefinition?.name ?? 'Encounter complete'}</strong></div><div className="tp-action-pips" aria-label={`${game.actionsRemaining} actions remaining`}>{[0, 1, 2].map(index => <span className={index < game.actionsRemaining ? 'filled' : ''} key={index} />)}</div></div>
            <div className="tp-action-buttons">
              {activeDefinition?.actionIds.map(actionId => {
                const action = ACTION_LIBRARY.find(item => item.id === actionId);
                const spellCost = actionId === 'lightning-bolt' ? activeDefinition.spells[0]?.actionCost : undefined;
                const cost = spellCost ?? action?.cost ?? 1;
                const combatSummary = getActionCombatSummary(actionId, activeDefinition, game);
                return <button key={actionId} className={selectedAction === actionId ? 'selected' : ''} disabled={game.status !== 'playing' || game.actionsRemaining < cost} onClick={() => chooseAction(actionId)}><span className="tp-action-button-heading"><strong>{action?.name ?? actionId}</strong><span className="tp-action-cost">{cost === 0 ? 'FREE' : '●'.repeat(cost)}</span></span>{combatSummary && <small>{combatSummary}</small>}</button>;
              })}
            </div>
            {selectedAction && <p className="tp-targeting-help">{selectedAction === 'shove' && pendingTargetId ? 'Choose a highlighted destination behind the target.' : ACTION_LIBRARY.find(action => action.id === selectedAction)?.description}</p>}
            <div className="tp-control-row"><button className="tp-button tp-button-small" disabled={!activeId || game.status !== 'playing'} onClick={() => activeId && dispatch({ type: 'END_TURN', actorId: activeId })}>End turn</button><button className="tp-button tp-button-small" disabled={history.length === 0} onClick={undo}><Undo2 /> Undo</button><button className="tp-button tp-button-small" onClick={reset}><RotateCcw /> Reset</button>{isTestPlay && <button className="tp-button tp-button-small tp-button-primary" onClick={onBack}><Pencil /> Return to editor</button>}</div>
          </div>
        </section>

        <aside className="tp-right-column">
          <section className="tp-panel tp-inspector">
            <div className="tp-panel-heading"><span>Creature</span><span className={`tp-team-label ${selectedDefinition?.team}`}>{selectedDefinition?.team}</span></div>
            {selectedDefinition && selectedRuntime && <>
              <h2>{selectedDefinition.name}</h2>
              <div className="tp-hp-track"><span style={{ width: `${Math.max(0, selectedRuntime.hp / selectedDefinition.maxHp * 100)}%` }} /></div>
              <p className="tp-hp-label">{selectedRuntime.hp} / {selectedDefinition.maxHp} HP</p>
              <dl><div><dt>AC</dt><dd>{activeId && selectedDefinition.team === 'enemy' ? effectiveArmorClass(game, selectedDefinition.id, activeId) : selectedDefinition.ac}</dd></div><div><dt>Fort</dt><dd>{formatModifier(selectedDefinition.fortitude)}</dd></div><div><dt>Ref</dt><dd>{formatModifier(selectedDefinition.reflex)}</dd></div><div><dt>Will</dt><dd>{formatModifier(selectedDefinition.will)}</dd></div><div><dt>Speed</dt><dd>{selectedDefinition.speed} ft.</dd></div><div><dt>Perception DC</dt><dd>{10 + selectedDefinition.perception}</dd></div></dl>
              {(selectedDefinition.attacks.length > 0 || selectedDefinition.spells.length > 0) && <div className="tp-combat-options">
                {selectedDefinition.attacks.length > 0 && <div className="tp-combat-group"><h3>Weapons</h3>{selectedDefinition.attacks.map(attack => {
                  const modifier = getAttackModifierBreakdown(game, selectedDefinition.id, attack);
                  return <div className="tp-combat-option" key={attack.id}><div><strong>{attack.name}</strong><span>{formatModifier(modifier.total)} to hit</span></div><small>{attack.damage} {attack.damageType} damage{attack.agile ? ' · Agile' : ''}{attack.range > 1 ? ` · Range ${attack.range}` : ''}</small></div>;
                })}</div>}
                {selectedDefinition.spells.length > 0 && <div className="tp-combat-group"><h3>Spells</h3>{selectedDefinition.spells.map(spell => <div className="tp-combat-option" key={spell.id}><div><strong>{spell.name}</strong><span>DC {spell.dc} {capitalize(spell.save)}</span></div><small>{spell.damage} {spell.damageType} damage · Basic save · {spell.actionCost} actions</small></div>)}</div>}
              </div>}
              <div className="tp-condition-list">{selectedRuntime.conditions.length ? selectedRuntime.conditions.map((condition, index) => <span key={`${condition.type}-${index}`}>{condition.type}{condition.value > 1 ? ` ${condition.value}` : ''}</span>) : <span className="muted">No conditions</span>}</div>
            </>}
          </section>
          <section className="tp-panel tp-rolls"><div className="tp-panel-heading"><span>Predetermined rolls</span><strong>{game.puzzle.rolls.length - game.rollIndex} left</strong></div><div className="tp-roll-queue">{game.puzzle.rolls.map((roll, index) => <div key={index} className={index < game.rollIndex ? 'used' : index === game.rollIndex ? 'next' : ''}><span>{index < game.rollIndex ? '✓' : index === game.rollIndex ? '▶' : index + 1}</span><strong>{roll}</strong></div>)}</div></section>
          <section className="tp-panel tp-hints"><button onClick={() => setShowHint(current => !current)}><Lightbulb /> {showHint ? 'Hide hint' : 'Show hint'}</button>{showHint && <p>{puzzle.hints[0] ?? 'No hint is available.'}</p>}</section>
        </aside>
      </div>

      <section className="tp-log"><div className="tp-panel-heading"><span>Resolution log</span><strong>{game.eventLog.length} events</strong></div><div>{[...game.eventLog].reverse().map(event => <p className={event.kind} key={event.id}><span>{String(event.id).padStart(2, '0')}</span>{event.message}</p>)}</div></section>
    </main>
  );
}

function TacticalBoard({
  game,
  selectedCreatureId,
  movementSquares,
  targetIds,
  shoveSquares,
  linePreview,
  selectedAction,
  activeId,
  onHover,
  onInteract
}: {
  game: GameState;
  selectedCreatureId: string;
  movementSquares: GridPosition[];
  targetIds: string[];
  shoveSquares: GridPosition[];
  linePreview: GridPosition[];
  selectedAction: ActionId | null;
  activeId: string | null;
  onHover: (position: GridPosition | null) => void;
  onInteract: (position: GridPosition, creatureId?: string) => void;
}) {
  const style = {
    '--tp-board-columns': game.puzzle.board.width,
    '--tp-board-rows': game.puzzle.board.height
  } as CSSProperties;
  const cells: GridPosition[] = [];
  for (let y = 0; y < game.puzzle.board.height; y += 1) for (let x = 0; x < game.puzzle.board.width; x += 1) cells.push({ x, y });
  const moveKeys = new Set(movementSquares.map(positionKey));
  const shoveKeys = new Set(shoveSquares.map(positionKey));
  const lineKeys = new Set(linePreview.map(positionKey));

  return (
    <div className="tp-board-frame">
      <div className="tp-board" style={style} role="grid" aria-label={`${game.puzzle.board.width} by ${game.puzzle.board.height} battlefield`}>
        {cells.map(position => {
          const creature = Object.values(game.creatures).find(item => item.hp > 0 && samePosition(item.position, position));
          const definition = creature ? getCreatureDefinition(game, creature.id) : undefined;
          const terrain = game.puzzle.board.terrain.find(cell => samePosition(cell, position));
          const classes = [terrain?.type ?? '', moveKeys.has(positionKey(position)) ? 'reachable' : '', shoveKeys.has(positionKey(position)) ? 'shove-destination' : '', lineKeys.has(positionKey(position)) ? 'line-preview' : '', selectedAction === 'lightning-bolt' ? 'line-aim' : ''].filter(Boolean).join(' ');
          const flanked = Boolean(creature && activeId && isFlanked(game, creature.id, activeId));
          return (
            <button
              type="button"
              role="gridcell"
              key={positionKey(position)}
              className={`tp-cell ${classes}`}
              onMouseEnter={() => onHover(position)}
              onMouseLeave={() => onHover(null)}
              onClick={() => onInteract(position, creature?.id)}
              aria-label={`${String.fromCharCode(65 + position.x)}${position.y + 1}${definition ? `, ${definition.name}` : ''}`}
            >
              <span className="tp-coordinate">{String.fromCharCode(65 + position.x)}{position.y + 1}</span>
              {terrain && <span className={`tp-terrain ${terrain.type}`} />}
              {definition && creature && <span className={`tp-token ${definition.team} ${selectedCreatureId === creature.id ? 'selected' : ''} ${targetIds.includes(creature.id) ? 'targetable' : ''} ${flanked ? 'flanked' : ''}`}><strong>{initials(definition.name)}</strong><small>{creature.hp}</small></span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function PuzzleEditor({
  draft,
  isAuthenticated,
  onBack,
  onChange,
  onSave,
  onTest
}: {
  draft: PuzzleDefinition;
  isAuthenticated: boolean;
  onBack: () => void;
  onChange: (puzzle: PuzzleDefinition) => void;
  onSave: (puzzle: PuzzleDefinition) => Promise<PuzzleDesignRecord>;
  onTest: (puzzle: PuzzleDefinition) => void;
}) {
  const [selectedCreatureId, setSelectedCreatureId] = useState(draft.creatures[0]?.id ?? '');
  const [tool, setTool] = useState<'creature' | 'blocked' | 'difficult' | 'hazard' | 'erase'>('creature');
  const [validation, setValidation] = useState<PuzzleValidationResult | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const selectedCreature = draft.creatures.find(creature => creature.id === selectedCreatureId);

  function patchDraft(patch: Partial<PuzzleDefinition>) {
    onChange({ ...draft, ...patch });
    setValidation(null);
    setMessage(null);
  }

  function updateCreature(patch: Partial<CreatureDefinition>) {
    patchDraft({ creatures: draft.creatures.map(creature => creature.id === selectedCreatureId ? { ...creature, ...patch } : creature) });
  }

  function toggleCreatureAction(actionId: ActionId) {
    if (!selectedCreature) return;
    const enabling = !selectedCreature.actionIds.includes(actionId);
    const patch: Partial<CreatureDefinition> = {
      actionIds: enabling ? [...selectedCreature.actionIds, actionId] : selectedCreature.actionIds.filter(id => id !== actionId)
    };
    if (enabling && actionId === 'strike' && selectedCreature.attacks.length === 0) {
      patch.attacks = [{ id: 'weapon', name: 'Weapon', attackBonus: 8, damage: 10, damageType: 'slashing', agile: false, range: 1, traits: [] }];
    }
    if (enabling && actionId === 'lightning-bolt' && selectedCreature.spells.length === 0) {
      patch.spells = [{
        id: 'lightning-line', name: 'Lightning Bolt', actionId: 'lightning-bolt', actionCost: 2,
        geometry: 'line', range: 6, save: 'reflex', dc: 20, damage: 12, damageType: 'electricity'
      }];
    }
    updateCreature(patch);
  }

  function updateReachCoordinate(axis: 'x' | 'y', value: number) {
    const objective = draft.objective;
    if (objective.type !== 'reach-square') return;
    patchDraft({ objective: { ...objective, position: { ...objective.position, [axis]: value } } });
  }

  function updateObjectiveCondition(condition: Extract<ObjectiveDefinition, { type: 'apply-condition' }>['condition']) {
    const objective = draft.objective;
    if (objective.type !== 'apply-condition') return;
    patchDraft({ objective: { ...objective, condition } });
  }

  function boardClick(position: GridPosition) {
    if (tool === 'creature' && selectedCreature) {
      updateCreature({ position });
      return;
    }
    if (tool === 'creature') return;
    const terrain = draft.board.terrain.filter(cell => !samePosition(cell, position));
    if (tool !== 'erase') terrain.push({ ...position, type: tool });
    patchDraft({ board: { ...draft.board, terrain } });
  }

  function addCreature() {
    const next = createEditorCreature(draft.creatures.length);
    patchDraft({ creatures: [...draft.creatures, next] });
    setSelectedCreatureId(next.id);
  }

  function removeCreature() {
    if (!selectedCreature || draft.creatures.length <= 1) return;
    const creatures = draft.creatures.filter(creature => creature.id !== selectedCreature.id);
    patchDraft({ creatures });
    setSelectedCreatureId(creatures[0].id);
  }

  async function save() {
    const result = validatePuzzle(draft);
    setValidation(result);
    if (!result.valid) return;
    setBusy(true);
    try {
      const record = await onSave(draft);
      setMessage(record.storage === 'supabase' ? 'Draft synced to Supabase.' : 'Draft saved in this browser. Sign in to sync it across devices.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not save the puzzle.');
    } finally {
      setBusy(false);
    }
  }

  function runTest() {
    const result = validatePuzzle(draft);
    setValidation(result);
    if (result.valid) onTest(draft);
  }

  function duplicate() {
    const copy = clonePuzzle(draft);
    copy.id = `${draft.id}-copy-${Date.now()}`.toLowerCase().replace(/[^a-z0-9-]/g, '-');
    copy.title = `${draft.title} Copy`;
    onChange(copy);
    setMessage('Created an independent copy with a new puzzle ID.');
  }

  function exportJson() {
    const blob = new Blob([JSON.stringify(draft, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${draft.id}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  async function importJson(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    try {
      const parsed: unknown = JSON.parse(await file.text());
      const result = safeParsePuzzleDefinition(parsed);
      if (!result.success) {
        setValidation({ valid: false, errors: result.error.issues.map(issue => `${issue.path.join('.')}: ${issue.message}`), warnings: [] });
        return;
      }
      onChange(result.data as PuzzleDefinition);
      setSelectedCreatureId(result.data.creatures[0].id);
      setMessage(`Imported ${result.data.title}.`);
    } catch (error) {
      setValidation({ valid: false, errors: [error instanceof Error ? error.message : 'The selected file is not valid JSON.'], warnings: [] });
    }
  }

  const boardStyle = {
    '--tp-board-columns': draft.board.width,
    '--tp-board-rows': draft.board.height
  } as CSSProperties;
  const cells: GridPosition[] = [];
  for (let y = 0; y < draft.board.height; y += 1) for (let x = 0; x < draft.board.width; x += 1) cells.push({ x, y });

  return (
    <main className="tp-editor">
      <header className="tp-editor-header"><button className="tp-icon-button" onClick={onBack}><ChevronLeft /></button><div><p className="tp-eyebrow">GM authoring studio</p><h1>Puzzle Editor</h1></div><div className="tp-editor-actions"><button className="tp-button" onClick={() => setValidation(validatePuzzle(draft))}><CheckCircle2 /> Validate</button><button className="tp-button tp-button-primary" onClick={runTest}><FlaskConical /> Test puzzle</button><button className="tp-button" disabled={busy} onClick={save}><Save /> {busy ? 'Saving…' : 'Save draft'}</button></div></header>
      {!isAuthenticated && <div className="tp-notice">Anonymous drafts use browser storage. Sign in before saving to store the design under your Supabase user account.</div>}
      {message && <div className="tp-notice">{message}</div>}

      <div className="tp-editor-layout">
        <aside className="tp-editor-sidebar">
          <EditorSection title="Puzzle settings">
            <label>Title<input value={draft.title} onChange={event => patchDraft({ title: event.target.value })} /></label>
            <label>Puzzle ID<input value={draft.id} onChange={event => patchDraft({ id: slugify(event.target.value) })} /></label>
            <label>Summary<textarea value={draft.summary} onChange={event => patchDraft({ summary: event.target.value })} /></label>
            <div className="tp-field-row"><label>Difficulty<select value={draft.difficulty} onChange={event => patchDraft({ difficulty: event.target.value as Difficulty })}><option value="tutorial">Tutorial</option><option value="easy">Easy</option><option value="moderate">Moderate</option><option value="hard">Hard</option><option value="expert">Expert</option></select></label><label>Rounds<input type="number" min="1" max="20" value={draft.maxRounds} onChange={event => patchDraft({ maxRounds: Number(event.target.value) })} /></label></div>
            <label>Tags<input value={draft.tags.join(', ')} onChange={event => patchDraft({ tags: event.target.value.split(',').map(tag => tag.trim()).filter(Boolean) })} /></label>
          </EditorSection>
          <EditorSection title="Battlefield">
            <div className="tp-field-row"><label>Width<input type="number" min="3" max="16" value={draft.board.width} onChange={event => patchDraft({ board: { ...draft.board, width: Number(event.target.value) } })} /></label><label>Height<input type="number" min="3" max="16" value={draft.board.height} onChange={event => patchDraft({ board: { ...draft.board, height: Number(event.target.value) } })} /></label></div>
            <div className="tp-tool-buttons">{(['creature', 'blocked', 'difficult', 'hazard', 'erase'] as const).map(item => <button className={tool === item ? 'selected' : ''} key={item} onClick={() => setTool(item)}>{item}</button>)}</div>
          </EditorSection>
          <EditorSection title="Creatures" action={<button onClick={addCreature}><Plus /> Add</button>}>
            <div className="tp-creature-list">{draft.creatures.map(creature => <button className={selectedCreatureId === creature.id ? 'selected' : ''} key={creature.id} onClick={() => { setSelectedCreatureId(creature.id); setTool('creature'); }}><span className={`tp-team-dot ${creature.team}`} />{creature.name}<small>{creature.team}</small></button>)}</div>
            <div className="tp-tags">{[...draft.creatures].sort((a, b) => b.initiative - a.initiative || a.id.localeCompare(b.id)).map(creature => <span key={creature.id}>{creature.initiative} · {creature.name}</span>)}</div>
          </EditorSection>
        </aside>

        <section className="tp-editor-board-column">
          <div className="tp-board-frame"><div className="tp-board tp-editor-board" style={boardStyle}>{cells.map(position => {
            const currentCreature = draft.creatures.find(creature => samePosition(creature.position, position));
            const terrain = draft.board.terrain.find(cell => samePosition(cell, position));
            return <button key={positionKey(position)} className={`tp-cell ${terrain?.type ?? ''}`} onClick={() => boardClick(position)}><span className="tp-coordinate">{String.fromCharCode(65 + position.x)}{position.y + 1}</span>{terrain && <span className={`tp-terrain ${terrain.type}`} />}{currentCreature && <span className={`tp-token ${currentCreature.team} ${selectedCreatureId === currentCreature.id ? 'selected' : ''}`}><strong>{initials(currentCreature.name)}</strong><small>{currentCreature.hp}</small></span>}</button>;
          })}</div></div>
          <p className="tp-editor-tip">Select a creature and click a square to place it. Terrain tools paint blocked, difficult, or hazard squares.</p>
          <EditorSection title="Deterministic roll queue">
            <label>Rolls, consumed left to right<input value={draft.rolls.join(', ')} onChange={event => patchDraft({ rolls: event.target.value.split(/[\s,]+/).filter(Boolean).map(Number) })} placeholder="10, 17, 6, 19" /></label>
            <div className="tp-roll-queue editor">{draft.rolls.map((roll, index) => <div className={roll < 1 || roll > 20 || !Number.isInteger(roll) ? 'invalid' : ''} key={index}><span>{index + 1}</span><strong>{roll}</strong></div>)}</div>
          </EditorSection>
          <EditorSection title="Victory condition">
            <div className="tp-field-row"><label>Objective<select value={draft.objective.type} onChange={event => patchDraft({ objective: makeObjective(event.target.value, draft) })}><option value="defeat-all-enemies">Defeat all enemies</option><option value="defeat-specific-enemy">Defeat specific enemy</option><option value="reach-square">Reach square</option><option value="apply-condition">Apply condition</option><option value="keep-ally-alive">Keep ally alive</option></select></label>{'creatureId' in draft.objective && <label>Creature<select value={draft.objective.creatureId} onChange={event => patchDraft({ objective: { ...draft.objective, creatureId: event.target.value } as ObjectiveDefinition })}>{draft.creatures.map(creature => <option key={creature.id} value={creature.id}>{creature.name}</option>)}</select></label>}</div>
            {draft.objective.type === 'reach-square' && <div className="tp-field-row"><label>Target X (1-based)<input type="number" min="1" max={draft.board.width} value={draft.objective.position.x + 1} onChange={event => updateReachCoordinate('x', Number(event.target.value) - 1)} /></label><label>Target Y (1-based)<input type="number" min="1" max={draft.board.height} value={draft.objective.position.y + 1} onChange={event => updateReachCoordinate('y', Number(event.target.value) - 1)} /></label></div>}
            {draft.objective.type === 'apply-condition' && <label>Required condition<select value={draft.objective.condition} onChange={event => updateObjectiveCondition(event.target.value as Extract<ObjectiveDefinition, { type: 'apply-condition' }>['condition'])}><option value="off-guard">Off-guard</option><option value="frightened">Frightened</option><option value="prone">Prone</option><option value="grabbed">Grabbed</option><option value="immobilized">Immobilized</option><option value="aided">Aided</option></select></label>}
          </EditorSection>
          {validation && <ValidationReport result={validation} />}
        </section>

        <aside className="tp-creature-editor">
          {selectedCreature ? <>
            <div className="tp-panel-heading"><span>Creature inspector</span><button className="tp-danger-link" onClick={removeCreature}><Trash2 /> Remove</button></div>
            <label>Name<input value={selectedCreature.name} onChange={event => updateCreature({ name: event.target.value })} /></label>
            <label>ID<input value={selectedCreature.id} onChange={event => { const id = slugify(event.target.value); patchDraft({ creatures: draft.creatures.map(creature => creature.id === selectedCreatureId ? { ...creature, id } : creature) }); setSelectedCreatureId(id); }} /></label>
            <div className="tp-field-row"><label>Team<select value={selectedCreature.team} onChange={event => { const team = event.target.value as Team; updateCreature({ team, controlled: team === 'player' || team === 'ally' }); }}><option value="player">Player</option><option value="ally">Ally</option><option value="enemy">Enemy</option><option value="neutral">Neutral</option></select></label><label>Initiative<input type="number" value={selectedCreature.initiative} onChange={event => updateCreature({ initiative: Number(event.target.value) })} /></label></div>
            <div className="tp-stat-grid"><label>HP<input type="number" value={selectedCreature.hp} onChange={event => updateCreature({ hp: Number(event.target.value), maxHp: Math.max(selectedCreature.maxHp, Number(event.target.value)) })} /></label><label>Max HP<input type="number" value={selectedCreature.maxHp} onChange={event => updateCreature({ maxHp: Number(event.target.value) })} /></label><label>AC<input type="number" value={selectedCreature.ac} onChange={event => updateCreature({ ac: Number(event.target.value) })} /></label><label>Speed<input type="number" value={selectedCreature.speed} onChange={event => updateCreature({ speed: Number(event.target.value) })} /></label><label>Perception<input type="number" value={selectedCreature.perception} onChange={event => updateCreature({ perception: Number(event.target.value) })} /></label><label>Fortitude<input type="number" value={selectedCreature.fortitude} onChange={event => updateCreature({ fortitude: Number(event.target.value) })} /></label><label>Reflex<input type="number" value={selectedCreature.reflex} onChange={event => updateCreature({ reflex: Number(event.target.value) })} /></label><label>Will<input type="number" value={selectedCreature.will} onChange={event => updateCreature({ will: Number(event.target.value) })} /></label></div>
            <h3>Skills</h3><div className="tp-stat-grid"><label>Athletics<input type="number" value={selectedCreature.skills.athletics} onChange={event => updateCreature({ skills: { ...selectedCreature.skills, athletics: Number(event.target.value) } })} /></label><label>Deception<input type="number" value={selectedCreature.skills.deception} onChange={event => updateCreature({ skills: { ...selectedCreature.skills, deception: Number(event.target.value) } })} /></label><label>Intimidation<input type="number" value={selectedCreature.skills.intimidation} onChange={event => updateCreature({ skills: { ...selectedCreature.skills, intimidation: Number(event.target.value) } })} /></label></div>
            <h3>Available actions</h3><div className="tp-action-checks">{ACTION_LIBRARY.map(action => <label key={action.id}><input type="checkbox" checked={selectedCreature.actionIds.includes(action.id)} onChange={() => toggleCreatureAction(action.id)} /><span>{action.name}<small>{action.description}</small></span></label>)}</div>
            {selectedCreature.attacks[0] && <><h3>Primary attack</h3><div className="tp-stat-grid"><label>Name<input value={selectedCreature.attacks[0].name} onChange={event => updateCreature({ attacks: [{ ...selectedCreature.attacks[0], name: event.target.value }] })} /></label><label>Bonus<input type="number" value={selectedCreature.attacks[0].attackBonus} onChange={event => updateCreature({ attacks: [{ ...selectedCreature.attacks[0], attackBonus: Number(event.target.value) }] })} /></label><label>Damage<input type="number" value={selectedCreature.attacks[0].damage} onChange={event => updateCreature({ attacks: [{ ...selectedCreature.attacks[0], damage: Number(event.target.value) }] })} /></label><label>Range<input type="number" value={selectedCreature.attacks[0].range} onChange={event => updateCreature({ attacks: [{ ...selectedCreature.attacks[0], range: Number(event.target.value) }] })} /></label></div><label className="tp-inline-check"><input type="checkbox" checked={selectedCreature.attacks[0].agile} onChange={event => updateCreature({ attacks: [{ ...selectedCreature.attacks[0], agile: event.target.checked }] })} /> Agile weapon</label></>}
            {selectedCreature.spells[0] && <><h3>Line spell</h3><div className="tp-stat-grid"><label>Name<input value={selectedCreature.spells[0].name} onChange={event => updateCreature({ spells: [{ ...selectedCreature.spells[0], name: event.target.value }] })} /></label><label>Save DC<input type="number" value={selectedCreature.spells[0].dc} onChange={event => updateCreature({ spells: [{ ...selectedCreature.spells[0], dc: Number(event.target.value) }] })} /></label><label>Damage<input type="number" value={selectedCreature.spells[0].damage} onChange={event => updateCreature({ spells: [{ ...selectedCreature.spells[0], damage: Number(event.target.value) }] })} /></label><label>Range (squares)<input type="number" value={selectedCreature.spells[0].range} onChange={event => updateCreature({ spells: [{ ...selectedCreature.spells[0], range: Number(event.target.value) }] })} /></label><label>Action cost<select value={selectedCreature.spells[0].actionCost} onChange={event => updateCreature({ spells: [{ ...selectedCreature.spells[0], actionCost: Number(event.target.value) as 1 | 2 | 3 }] })}><option value="1">1 action</option><option value="2">2 actions</option><option value="3">3 actions</option></select></label><label>Damage type<input value={selectedCreature.spells[0].damageType} onChange={event => updateCreature({ spells: [{ ...selectedCreature.spells[0], damageType: event.target.value }] })} /></label></div></>}
          </> : <p>Select a creature to edit it.</p>}
        </aside>
      </div>

      <footer className="tp-editor-footer"><button className="tp-button" onClick={duplicate}><Copy /> Duplicate puzzle</button><button className="tp-button" onClick={exportJson}><Download /> Export JSON</button><label className="tp-button"><Upload /> Import JSON<input type="file" accept="application/json,.json" onChange={importJson} hidden /></label><button className="tp-button" onClick={() => navigator.clipboard.writeText(JSON.stringify(draft, null, 2)).then(() => setMessage('Puzzle JSON copied to the clipboard.')).catch(() => setMessage('Clipboard access was unavailable.'))}><FileJson /> Copy JSON</button></footer>
    </main>
  );
}

function EditorSection({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return <section className="tp-editor-section"><div className="tp-panel-heading"><span>{title}</span>{action}</div>{children}</section>;
}

function ValidationReport({ result }: { result: PuzzleValidationResult }) {
  return <section className={`tp-validation ${result.valid ? 'valid' : 'invalid'}`}><h3>{result.valid ? <CheckCircle2 /> : <Shield />} {result.valid ? 'Puzzle is valid' : 'Validation failed'}</h3>{result.errors.map(error => <p key={error}><strong>Error</strong>{error}</p>)}{result.warnings.map(warning => <p key={warning} className="warning"><strong>Warning</strong>{warning}</p>)}</section>;
}

function makeObjective(type: string, puzzle: PuzzleDefinition): ObjectiveDefinition {
  const firstEnemy = puzzle.creatures.find(creature => creature.team === 'enemy')?.id ?? puzzle.creatures[0]?.id ?? '';
  const firstAlly = puzzle.creatures.find(creature => creature.team === 'ally')?.id ?? puzzle.creatures[0]?.id ?? '';
  if (type === 'defeat-specific-enemy') return { type, creatureId: firstEnemy };
  if (type === 'reach-square') return { type, creatureId: puzzle.creatures[0]?.id ?? '', position: { x: puzzle.board.width - 1, y: puzzle.board.height - 1 } };
  if (type === 'apply-condition') return { type, creatureId: firstEnemy, condition: 'off-guard' };
  if (type === 'keep-ally-alive') return { type, creatureId: firstAlly };
  return { type: 'defeat-all-enemies' };
}

function clonePuzzle(puzzle: PuzzleDefinition): PuzzleDefinition {
  return JSON.parse(JSON.stringify(puzzle)) as PuzzleDefinition;
}

function slugify(value: string) {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'puzzle';
}

function getActionCombatSummary(actionId: ActionId, creature: CreatureDefinition, game: GameState): string | null {
  if (actionId === 'strike') {
    const attack = creature.attacks[0];
    if (!attack) return null;
    const modifier = getAttackModifierBreakdown(game, creature.id, attack);
    return `${formatModifier(modifier.total)} to hit · ${attack.damage} ${attack.damageType}`;
  }
  if (actionId === 'lightning-bolt') {
    const spell = creature.spells.find(candidate => candidate.actionId === actionId);
    return spell ? `DC ${spell.dc} ${capitalize(spell.save)} · ${spell.damage} ${spell.damageType}` : null;
  }
  return null;
}

function formatModifier(value: number): string {
  return value >= 0 ? `+${value}` : String(value);
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function initials(name: string) {
  return name.split(/\s+/).map(part => part[0]).join('').slice(0, 2).toUpperCase();
}
