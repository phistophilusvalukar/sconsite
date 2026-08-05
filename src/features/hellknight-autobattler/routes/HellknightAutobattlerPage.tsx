import { useEffect, useMemo, useState } from 'react';
import type { DragEvent, MouseEvent } from 'react';
import { Coins, Crosshair, Dices, Hourglass, Package, Play, RefreshCw, Shield, ShoppingBag, Sparkles, Swords } from 'lucide-react';
import {
  boardSlots as initialBoardSlots,
  items,
  lobbyNames,
  synergies,
  units,
  type BoardSlot,
  type ItemDefinition,
  type OwnedUnit,
  type UnitDefinition,
  type UnitTrait
} from '../data/hellknightAutobattler';
import {
  createEnemyArmy,
  simulateCombat,
  type CombatFrame,
  type CombatFrameUnit,
  type CombatSimulationResult
} from '../engine/combatEngine';
import './hellknightAutobattler.css';

type Phase = 'lobby' | 'shop' | 'combat' | 'item-shop';
type HoveredUnit =
  | { kind: 'unit'; unit: UnitDefinition | OwnedUnit; displayedHealth: number; x: number; y: number }
  | { kind: 'combat'; unit: CombatFrameUnit; x: number; y: number };

interface PlayerRecord {
  id: string;
  name: string;
  isPlayer: boolean;
  health: number;
  streak: number;
}

interface CombatResult {
  opponent: string;
  won: boolean;
  damage: number;
  summary: string;
  simulation: CombatSimulationResult;
}

const playerNames = ['You', 'Avarice Trial', 'Ink Rack', 'Citadel Nail', 'Black Archive', 'Gate Signifer', 'Pyre Marshal', 'Torrent Bailiff'];
const maxPlayers = 8;
const startingGold = 12;
const benchLimit = 9;
const roundShopSize = 5;

export default function HellknightAutobattlerPage() {
  const [phase, setPhase] = useState<Phase>('lobby');
  const [lobbyTick, setLobbyTick] = useState(0);
  const [round, setRound] = useState(1);
  const [gold, setGold] = useState(startingGold);
  const [health, setHealth] = useState(100);
  const [wins, setWins] = useState(0);
  const [losses, setLosses] = useState(0);
  const [streak, setStreak] = useState(0);
  const [shopSeed, setShopSeed] = useState(17);
  const [itemSeed, setItemSeed] = useState(91);
  const [nextInstance, setNextInstance] = useState(1);
  const [bench, setBench] = useState<OwnedUnit[]>([]);
  const [board, setBoard] = useState<BoardSlot[]>(initialBoardSlots);
  const [inventory, setInventory] = useState<string[]>(['sturdy-shield']);
  const [selectedUnitId, setSelectedUnitId] = useState<string | null>(null);
  const [draggedUnitId, setDraggedUnitId] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<CombatResult | null>(null);
  const [playbackFrameIndex, setPlaybackFrameIndex] = useState(0);
  const [hoveredUnit, setHoveredUnit] = useState<HoveredUnit | null>(null);
  const [log, setLog] = useState<string[]>(['Queue opens under black iron banners.']);

  const lobbyPlayers = useMemo(() => buildLobby(lobbyTick), [lobbyTick]);
  const shop = useMemo(() => buildShop(shopSeed, round), [shopSeed, round]);
  const itemShop = useMemo(() => buildItemShop(itemSeed, round), [itemSeed, round]);
  const army = useMemo(() => board
    .map(slot => bench.find(unit => unit.instanceId === slot.unitId))
    .filter((unit): unit is OwnedUnit => Boolean(unit)), [bench, board]);
  const activeSynergies = useMemo(() => getActiveSynergies(army), [army]);
  const armyPower = useMemo(() => calculateArmyPower(army, activeSynergies), [army, activeSynergies]);
  const benchUnits = bench.filter(unit => !board.some(slot => slot.unitId === unit.instanceId));
  const selectedUnit = bench.find(unit => unit.instanceId === selectedUnitId) ?? null;
  const selectedUnitIsDeployed = Boolean(selectedUnit && board.some(slot => slot.unitId === selectedUnit.instanceId));
  const selectedCombineCopies = selectedUnit
    ? bench.filter(unit => unit.id === selectedUnit.id && unit.tier === selectedUnit.tier).length
    : 0;
  const rosterFull = bench.length >= benchLimit + 7;
  const currentCombatFrame = lastResult?.simulation.frames[Math.min(playbackFrameIndex, lastResult.simulation.frames.length - 1)] ?? null;
  const combatPlaybackDone = Boolean(lastResult && playbackFrameIndex >= lastResult.simulation.frames.length - 1);

  useEffect(() => {
    if (phase !== 'combat' || !lastResult || combatPlaybackDone) return undefined;
    const timer = window.setTimeout(() => {
      setPlaybackFrameIndex(current => Math.min(current + 1, lastResult.simulation.frames.length - 1));
    }, 180);
    return () => window.clearTimeout(timer);
  }, [combatPlaybackDone, lastResult, phase, playbackFrameIndex]);

  function advanceLobby() {
    const nextTick = lobbyTick + 1;
    setLobbyTick(nextTick);
    const visibleCount = buildLobby(nextTick).length;
    setLog(current => [`${lobbyNames[nextTick % lobbyNames.length]} joins the queue. ${visibleCount}/${maxPlayers} seats showing.`, ...current].slice(0, 6));
  }

  function startMatch() {
    const filledLobby = fillLobby(lobbyPlayers);
    setPhase('shop');
    setLog([
      `Match sealed with ${lobbyPlayers.length} player${lobbyPlayers.length === 1 ? '' : 's'} and ${maxPlayers - lobbyPlayers.length} automata.`,
      `Round ${round}: buy five offered units, place your line, then submit the verdict.`,
      ...log
    ].slice(0, 7));
    if (filledLobby.length === 0) {
      setLobbyTick(1);
    }
  }

  function buyUnit(unit: UnitDefinition) {
    if (gold < unit.cost || rosterFull) return;
    const ownedUnit: OwnedUnit = {
      ...unit,
      instanceId: `${unit.id}-${nextInstance}`,
      tier: 1,
      items: []
    };
    setBench(current => [...current, ownedUnit]);
    setNextInstance(current => current + 1);
    setGold(current => current - unit.cost);
    setLog(current => [`Bought ${unit.name}.`, ...current].slice(0, 6));
  }

  function refreshShop() {
    if (gold < 2) return;
    setGold(current => current - 2);
    setShopSeed(current => current + 31);
    setLog(current => ['The quartermaster burns a writ and deals five new recruits.', ...current].slice(0, 6));
  }

  function placeUnit(unitId: string, slotIndex: number) {
    setBoard(current => moveUnitOnBoard(current, unitId, slotIndex));
    setSelectedUnitId(null);
  }

  function startUnitDrag(unitId: string, event: DragEvent<HTMLElement>) {
    setDraggedUnitId(unitId);
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', unitId);
  }

  function dropUnit(slotIndex: number, event: DragEvent<HTMLButtonElement>) {
    event.preventDefault();
    const unitId = draggedUnitId ?? event.dataTransfer.getData('text/plain');
    if (!bench.some(unit => unit.instanceId === unitId)) return;
    placeUnit(unitId, slotIndex);
    setDraggedUnitId(null);
  }

  function recallUnit(unitId: string) {
    setBoard(current => current.map(slot => slot.unitId === unitId ? { ...slot, unitId: null } : slot));
  }

  function combineSelectedUnit() {
    if (!selectedUnit || selectedUnit.tier >= 3) return;
    const combined = combineUnitCopies(bench, selectedUnit.instanceId);
    if (!combined.upgradedUnit) return;
    setBench(combined.units);
    setInventory(current => [...current, ...combined.overflowItems]);
    setBoard(current => placeCombinedUnit(current, combined.consumedIds, combined.upgradedUnit!.instanceId, selectedUnit.instanceId));
    setSelectedUnitId(combined.upgradedUnit.instanceId);
    setLog(current => [
      `${combined.message}${combined.overflowItems.length > 0 ? `; ${combined.overflowItems.length} overflow item${combined.overflowItems.length === 1 ? '' : 's'} returned.` : ''}.`,
      ...current
    ].slice(0, 6));
  }

  function assignItem(itemId: string) {
    if (!selectedUnit) return;
    if (selectedUnit.items.length >= 2) return;
    setBench(current => current.map(unit => unit.instanceId === selectedUnit.instanceId ? {
      ...unit,
      items: [...unit.items, itemId]
    } : unit));
    setInventory(current => removeFirst(current, itemId));
    setLog(current => [`Issued ${getItem(itemId).name} to ${selectedUnit.name}.`, ...current].slice(0, 6));
  }

  function removeUnitItem(unitId: string, itemIndex: number) {
    const unit = bench.find(candidate => candidate.instanceId === unitId);
    const itemId = unit?.items[itemIndex];
    if (!unit || !itemId) return;
    setBench(current => current.map(candidate => candidate.instanceId === unitId ? {
      ...candidate,
      items: candidate.items.filter((_, index) => index !== itemIndex)
    } : candidate));
    setInventory(current => [...current, itemId]);
    setLog(current => [`Removed ${getItem(itemId).name} from ${unit.name}.`, ...current].slice(0, 6));
  }

  function sellUnit(unitId: string) {
    const unit = bench.find(candidate => candidate.instanceId === unitId);
    if (!unit) return;
    const refund = Math.max(1, Math.floor(unit.cost / 2));
    setBench(current => current.filter(candidate => candidate.instanceId !== unitId));
    setBoard(current => current.map(slot => slot.unitId === unitId ? { ...slot, unitId: null } : slot));
    setInventory(current => [...current, ...unit.items]);
    setGold(current => current + refund);
    setSelectedUnitId(null);
    setLog(current => [
      `Sold ${unit.name} for ${refund} gold${unit.items.length > 0 ? ` and returned ${unit.items.length} item${unit.items.length === 1 ? '' : 's'}` : ''}.`,
      ...current
    ].slice(0, 6));
  }

  function sellItem(itemId: string) {
    const item = getItem(itemId);
    setInventory(current => removeFirst(current, itemId));
    setGold(current => current + Math.max(1, Math.floor(item.cost / 2)));
    setLog(current => [`Sold ${item.name} back to the armory.`, ...current].slice(0, 6));
  }

  function buyItem(item: ItemDefinition) {
    if (gold < item.cost) return;
    setGold(current => current - item.cost);
    setInventory(current => [...current, item.id]);
    setLog(current => [`Purchased ${item.name} from the special armory round.`, ...current].slice(0, 6));
  }

  function resolveCombat() {
    const opponent = playerNames[(round * 3 + shopSeed) % playerNames.length] === 'You'
      ? 'Automated Armiger'
      : playerNames[(round * 3 + shopSeed) % playerNames.length];
    const playerInputs = board.flatMap(slot => {
      const unit = bench.find(candidate => candidate.instanceId === slot.unitId);
      return unit ? [{ unit, slot }] : [];
    });
    const simulation = simulateCombat({
      player: playerInputs,
      enemy: createEnemyArmy(shopSeed + itemSeed, round),
      seed: shopSeed + itemSeed + round
    });
    const won = simulation.winner === 'player';
    const damage = won ? 0 : Math.max(4, round + simulation.survivingEnemyUnits * 3);
    const interest = Math.min(5, Math.floor(gold / 10));
    const streakGold = Math.min(3, Math.floor(Math.abs(streak) / 2));
    const roundGold = 5 + (won ? 1 : 0) + interest + streakGold;
    const nextRound = round + 1;
    const drop = items[(itemSeed + round * 5) % items.length].id;

    setPhase('combat');
    setPlaybackFrameIndex(0);
    setWins(current => current + (won ? 1 : 0));
    setLosses(current => current + (won ? 0 : 1));
    setStreak(current => won ? Math.max(1, current + 1) : Math.min(-1, current - 1));
    setHealth(current => won ? current : Math.max(0, current - damage));
    setGold(current => current + roundGold);
    setInventory(current => [...current, drop]);
    setLastResult({
      opponent,
      won,
      damage,
      summary: `${won ? 'Victory' : simulation.winner === 'draw' ? 'Draw' : 'Defeat'} against ${opponent}. Earned ${roundGold} gold and recovered ${getItem(drop).name}.`,
      simulation
    });
    setLog(current => [
      `${won ? 'Won' : simulation.winner === 'draw' ? 'Drew' : 'Lost'} round ${round} vs ${opponent}; ${roundGold} gold, ${getItem(drop).name} dropped.`,
      ...simulation.ledger.slice(0, 4),
      ...current
    ].slice(0, 7));
    setRound(nextRound);
    setShopSeed(current => current + 13);
    setItemSeed(current => current + 19);
  }

  function nextPlanningPhase() {
    setPhase(round > 1 && (round - 1) % 3 === 0 ? 'item-shop' : 'shop');
  }

  function showUnitTooltip(unit: UnitDefinition | OwnedUnit, event: MouseEvent<HTMLElement>) {
    const isDeployed = 'instanceId' in unit && board.some(slot => slot.unitId === unit.instanceId);
    setHoveredUnit({
      kind: 'unit',
      unit,
      displayedHealth: getDisplayedHealth(unit, activeSynergies, isDeployed),
      x: event.clientX,
      y: event.clientY
    });
  }

  function showCombatTooltip(unit: CombatFrameUnit, event: MouseEvent<HTMLElement>) {
    setHoveredUnit({ kind: 'combat', unit, x: event.clientX, y: event.clientY });
  }

  function moveTooltip(event: MouseEvent<HTMLElement>) {
    setHoveredUnit(current => current ? { ...current, x: event.clientX, y: event.clientY } : null);
  }

  return (
    <div className="hellknight-page">
      <section className="hellknight-shell">
        <header className="hellknight-hero">
          <div>
            <p className="hellknight-kicker">Hellknight Auto Battler</p>
            <h1>Citadel Tactics</h1>
            <p>
              Draft PF2e classes into Hellknight orders, combine three copies into higher tiers, and let the board
              decide which verdict survives.
            </p>
          </div>
          <div className="verdict-panel" aria-label="Match status">
            <span><Shield className="h-4 w-4" /> Health {health}</span>
            <span><Coins className="h-4 w-4" /> Gold {gold}</span>
            <span><Swords className="h-4 w-4" /> Round {round}</span>
          </div>
        </header>

        {phase === 'lobby' ? (
          <LobbyPanel players={lobbyPlayers} onTick={advanceLobby} onStart={startMatch} />
        ) : (
          <div className="autobattler-layout">
            <main className="tactics-column">
              <section className="tactics-toolbar">
                <div>
                  <p className="hellknight-kicker">{phase === 'item-shop' ? 'Special Armory' : phase === 'combat' ? 'Combat Verdict' : 'Recruitment'}</p>
                  <h2>{phase === 'combat' ? lastResult?.summary ?? 'The field resolves.' : 'Arrange the battle line'}</h2>
                </div>
                <div className="toolbar-actions">
                  {phase === 'combat' ? (
                    <button type="button" onClick={nextPlanningPhase} disabled={!combatPlaybackDone}>
                      <Play className="h-4 w-4" /> Continue
                    </button>
                  ) : (
                    <button type="button" className="primary-action" onClick={resolveCombat} disabled={army.length === 0}>
                      <Swords className="h-4 w-4" /> Fight
                    </button>
                  )}
                </div>
              </section>

              {phase === 'combat' && currentCombatFrame ? (
                <CombatArena
                  frame={currentCombatFrame}
                  result={lastResult}
                  onHoverUnit={showCombatTooltip}
                  onMoveTooltip={moveTooltip}
                  onLeaveTooltip={() => setHoveredUnit(null)}
                />
              ) : (
                <section className="hex-board" aria-label="Hex deployment board">
                  {board.map((slot, index) => {
                    const unit = bench.find(candidate => candidate.instanceId === slot.unitId);
                    const selected = Boolean(unit && selectedUnitId === unit.instanceId);
                    const displayedHealth = unit ? getDisplayedHealth(unit, activeSynergies, true) : 0;
                    return (
                      <button
                        key={`${slot.q}:${slot.r}`}
                        type="button"
                        className={`hex-cell ${unit ? 'occupied' : ''} ${selected ? 'selected' : ''}`}
                        draggable={Boolean(unit)}
                        onDragStart={(event) => {
                          if (unit) startUnitDrag(unit.instanceId, event);
                        }}
                        onDragEnd={() => setDraggedUnitId(null)}
                        onDragOver={(event) => {
                          if (draggedUnitId) {
                            event.preventDefault();
                            event.dataTransfer.dropEffect = 'move';
                          }
                        }}
                        onDrop={(event) => dropUnit(index, event)}
                        onMouseEnter={(event) => {
                          if (unit) showUnitTooltip(unit, event);
                        }}
                        onMouseMove={moveTooltip}
                        onMouseLeave={() => setHoveredUnit(null)}
                        onClick={() => {
                          if (!unit && selectedUnitId) {
                            placeUnit(selectedUnitId, index);
                            return;
                          }
                          if (unit) {
                            setSelectedUnitId(selected ? null : unit.instanceId);
                          }
                        }}
                        aria-label={`Board hex ${index + 1}`}
                      >
                        {unit ? (
                          <>
                            <strong>{unit.pf2Class}</strong>
                            <span>Tier {unit.tier} / HP {displayedHealth}</span>
                          </>
                        ) : (
                          <span>{selectedUnitId ? 'Place' : `${slot.q},${slot.r}`}</span>
                        )}
                      </button>
                    );
                  })}
                </section>
              )}

              <section className="bench-row" aria-label="Unit bench">
                {benchUnits.length === 0 ? (
                  <p>No reserves. Buy recruits from the roster.</p>
                ) : benchUnits.map(unit => (
                  <UnitChip
                    key={unit.instanceId}
                    unit={unit}
                    selected={selectedUnitId === unit.instanceId}
                    onSelect={() => setSelectedUnitId(unit.instanceId)}
                    onDragStart={(event) => startUnitDrag(unit.instanceId, event)}
                    onDragEnd={() => setDraggedUnitId(null)}
                    onRecall={() => recallUnit(unit.instanceId)}
                    onHoverUnit={showUnitTooltip}
                    onMoveTooltip={moveTooltip}
                    onLeaveTooltip={() => setHoveredUnit(null)}
                  />
                ))}
              </section>
              <UnitDetailPanel
                unit={selectedUnit}
                isDeployed={selectedUnitIsDeployed}
                combineCopies={selectedCombineCopies}
                onRecall={recallUnit}
                onCombine={combineSelectedUnit}
                onSell={sellUnit}
                activeSynergies={activeSynergies}
              />
            </main>

            <aside className="command-column">
              {phase === 'item-shop' ? (
                <ItemShopPanel itemShop={itemShop} gold={gold} onBuy={buyItem} onContinue={() => setPhase('shop')} />
              ) : (
                <ShopPanel
                  shop={shop}
                  gold={gold}
                  onBuy={buyUnit}
                  onRefresh={refreshShop}
                  onHoverUnit={showUnitTooltip}
                  onMoveTooltip={moveTooltip}
                  onLeaveTooltip={() => setHoveredUnit(null)}
                />
              )}
              <InventoryPanel
                inventory={inventory}
                selectedUnit={selectedUnit}
                onAssign={assignItem}
                onUnequip={removeUnitItem}
                onSell={sellItem}
              />
              <SynergyPanel activeSynergies={activeSynergies} armyPower={armyPower} />
              <LogPanel log={log} wins={wins} losses={losses} streak={streak} />
            </aside>
          </div>
        )}
        <FloatingUnitTooltip target={hoveredUnit} />
      </section>
    </div>
  );
}

function CombatArena({
  frame,
  result,
  onHoverUnit,
  onMoveTooltip,
  onLeaveTooltip
}: {
  frame: CombatFrame;
  result: CombatResult | null;
  onHoverUnit: (unit: CombatFrameUnit, event: MouseEvent<HTMLElement>) => void;
  onMoveTooltip: (event: MouseEvent<HTMLElement>) => void;
  onLeaveTooltip: () => void;
}) {
  const liveUnits = frame.units.filter(unit => unit.alive);
  return (
    <section className="combat-arena" aria-label="Real-time combat arena">
      <div className="combat-arena-grid" />
      <div className="combat-status-strip">
        <span>{formatTime(frame.timeMs)}</span>
        <strong>{frame.message}</strong>
        <span>{result ? `${result.opponent}` : 'Opponent'}</span>
      </div>
      {frame.units.map(unit => (
        <CombatPiece
          key={unit.id}
          unit={unit}
          onHoverUnit={onHoverUnit}
          onMoveTooltip={onMoveTooltip}
          onLeaveTooltip={onLeaveTooltip}
        />
      ))}
      <div className="combat-scoreline">
        <span>Your order: {liveUnits.filter(unit => unit.team === 'player').length}</span>
        <span>Enemy order: {liveUnits.filter(unit => unit.team === 'enemy').length}</span>
      </div>
    </section>
  );
}

function CombatPiece({
  unit,
  onHoverUnit,
  onMoveTooltip,
  onLeaveTooltip
}: {
  unit: CombatFrameUnit;
  onHoverUnit: (unit: CombatFrameUnit, event: MouseEvent<HTMLElement>) => void;
  onMoveTooltip: (event: MouseEvent<HTMLElement>) => void;
  onLeaveTooltip: () => void;
}) {
  const position = combatHexToPosition(unit.q, unit.r);
  const hpPercent = Math.max(0, Math.round((unit.hp / unit.maxHp) * 100));
  return (
    <article
      className={`combat-piece ${unit.team} ${unit.alive ? '' : 'defeated'} ${unit.attacking ? 'attacking' : ''} ${unit.casting ? 'casting' : ''} ${unit.status === 'fleeing' ? 'fleeing' : ''}`}
      style={{ left: `${position.x}%`, top: `${position.y}%` }}
      onMouseEnter={(event) => onHoverUnit(unit, event)}
      onMouseMove={onMoveTooltip}
      onMouseLeave={onLeaveTooltip}
    >
      <div className="piece-token">
        <strong>{unit.pf2Class.slice(0, 3)}</strong>
        <span>{unit.tier}</span>
      </div>
      <div className="piece-label">
        <span>{unit.pf2Class}</span>
        <div className="hp-track">
          <i style={{ width: `${hpPercent}%` }} />
        </div>
      </div>
    </article>
  );
}

function UnitDetailPanel({
  unit,
  isDeployed,
  combineCopies,
  onRecall,
  onCombine,
  onSell,
  activeSynergies
}: {
  unit: OwnedUnit | null;
  isDeployed: boolean;
  combineCopies: number;
  onRecall: (unitId: string) => void;
  onCombine: () => void;
  onSell: (unitId: string) => void;
  activeSynergies: Array<{ trait: UnitTrait; count: number; tier: number }>;
}) {
  if (!unit) {
    return (
      <section className="unit-detail-panel empty">
        <p className="hellknight-kicker">Unit Dossier</p>
        <h2>Select a unit to inspect its full breakdown.</h2>
      </section>
    );
  }

  const itemDetails = unit.items.map(getItem);
  const refund = Math.max(1, Math.floor(unit.cost / 2));
  const tierMultiplier = unit.tier === 1 ? 1 : unit.tier === 2 ? 1.85 : 3.2;
  const effectiveHealth = getDisplayedHealth(unit, activeSynergies, isDeployed);
  const effectiveAttack = Math.round(unit.attackDamage * tierMultiplier);
  const effectiveMagic = Math.round(unit.magicDamage * tierMultiplier);
  const spells = getUnitSpells(unit);

  return (
    <section className="unit-detail-panel">
      <div className="unit-detail-heading">
        <div>
          <p className="hellknight-kicker">Unit Dossier</p>
          <h2>{unit.name}</h2>
          <span>{unit.pf2Class} / {unit.role} / Tier {unit.tier}</span>
        </div>
        <div className="unit-trait-row">
          {unit.traits.map(trait => <span key={trait}>{trait}</span>)}
          {isDeployed && (
            <button type="button" className="unit-command-button" onClick={() => onRecall(unit.instanceId)}>
              Recall
            </button>
          )}
          <button type="button" className="unit-command-button" onClick={onCombine} disabled={unit.tier >= 3 || combineCopies < 3}>
            Combine {combineCopies}/3
          </button>
          <button type="button" className="sell-unit-button" onClick={() => onSell(unit.instanceId)}>
            Sell {refund}g
          </button>
        </div>
      </div>

      <div className="unit-stat-grid">
        <StatPill label="Health" value={`${effectiveHealth}`} />
        <StatPill label="Attack" value={`${effectiveAttack}`} />
        <StatPill label="Magic" value={`${effectiveMagic}`} />
        <StatPill label="Speed" value={unit.attackSpeed.toFixed(2)} />
        <StatPill label="Range" value={`${unit.range}`} />
        <StatPill label="Slots" value={`${unit.spellSlots}`} />
      </div>

      <div className="unit-detail-columns">
        <div>
          <h3>Feat</h3>
          <strong>{unit.feat}</strong>
          <p>{unit.featText}</p>
        </div>
        <div>
          <h3>Spells & Abilities</h3>
          <ul>
            {spells.map(spell => <li key={spell}>{spell}</li>)}
          </ul>
        </div>
        <div>
          <h3>Items</h3>
          {itemDetails.length === 0 ? (
            <p>No items equipped.</p>
          ) : (
            <ul>
              {itemDetails.map(item => <li key={item.id}>{item.name}: {item.stat}. {item.effect}</li>)}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}

function StatPill({ label, value }: { label: string; value: string }) {
  return (
    <article className="stat-pill">
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  );
}

function FloatingUnitTooltip({ target }: { target: HoveredUnit | null }) {
  if (!target) return null;
  const style = {
    left: Math.min(window.innerWidth - 280, target.x + 16),
    top: Math.max(12, target.y - 22)
  };

  if (target.kind === 'combat') {
    return (
      <aside className="unit-tooltip floating-unit-tooltip" style={style} role="tooltip">
        <strong>{target.unit.name}</strong>
        <span>{target.unit.pf2Class} / {target.unit.team}</span>
        <span>HP {target.unit.hp}/{target.unit.maxHp}</span>
        <span>Range {target.unit.range} / Tier {target.unit.tier}</span>
        <span>{target.unit.status === 'fleeing' ? 'Fleeing' : target.unit.alive ? 'Fighting' : 'Defeated'}</span>
      </aside>
    );
  }

  return (
    <aside className="unit-tooltip floating-unit-tooltip" style={style} role="tooltip">
      <strong>{target.unit.name}</strong>
      <span>{target.unit.pf2Class} / {target.unit.role}</span>
      <span>HP {target.displayedHealth} / AD {target.unit.attackDamage} / MD {target.unit.magicDamage}</span>
      <span>AS {target.unit.attackSpeed.toFixed(2)} / Range {target.unit.range} / Slots {target.unit.spellSlots}</span>
      <span>{target.unit.traits.join(' - ')}</span>
    </aside>
  );
}

function LobbyPanel({ players, onTick, onStart }: { players: PlayerRecord[]; onTick: () => void; onStart: () => void }) {
  return (
    <section className="lobby-panel">
      <div className="lobby-status">
        <div>
          <p className="hellknight-kicker">Queue</p>
          <h2>Awaiting Citadel Assignments</h2>
        </div>
        <span><Hourglass className="h-4 w-4" /> Starts when the timer expires</span>
      </div>
      <div className="lobby-grid">
        {fillLobby(players).map(player => (
          <article key={player.id} className={player.isPlayer ? 'player-seat local' : 'player-seat'}>
            <strong>{player.name}</strong>
            <span>{player.isPlayer ? 'Commander' : player.health > 0 ? 'Queued' : 'Automata fill'}</span>
          </article>
        ))}
      </div>
      <div className="lobby-actions">
        <button type="button" onClick={onTick}>
          <Hourglass className="h-4 w-4" /> Tick Timer
        </button>
        <button type="button" className="primary-action" onClick={onStart}>
          <Play className="h-4 w-4" /> Start Match
        </button>
      </div>
    </section>
  );
}

function ShopPanel({
  shop,
  gold,
  onBuy,
  onRefresh,
  onHoverUnit,
  onMoveTooltip,
  onLeaveTooltip
}: {
  shop: UnitDefinition[];
  gold: number;
  onBuy: (unit: UnitDefinition) => void;
  onRefresh: () => void;
  onHoverUnit: (unit: UnitDefinition, event: MouseEvent<HTMLElement>) => void;
  onMoveTooltip: (event: MouseEvent<HTMLElement>) => void;
  onLeaveTooltip: () => void;
}) {
  return (
    <section className="side-section">
      <header>
        <h2><ShoppingBag className="h-4 w-4" /> Roster</h2>
        <button type="button" onClick={onRefresh} disabled={gold < 2}>
          <RefreshCw className="h-4 w-4" /> 2g
        </button>
      </header>
      <div className="shop-list">
        {shop.map(unit => (
          <button
            key={`${unit.id}-${unit.cost}`}
            type="button"
            className="shop-card"
            onMouseEnter={(event) => onHoverUnit(unit, event)}
            onMouseMove={onMoveTooltip}
            onMouseLeave={onLeaveTooltip}
            onClick={() => onBuy(unit)}
            disabled={gold < unit.cost}
          >
            <span className="cost">{unit.cost}g</span>
            <strong>{unit.name}</strong>
            <span>{unit.pf2Class} / {unit.role}</span>
            <small>{unit.traits.join(' - ')}</small>
          </button>
        ))}
      </div>
    </section>
  );
}

function ItemShopPanel({ itemShop, gold, onBuy, onContinue }: { itemShop: ItemDefinition[]; gold: number; onBuy: (item: ItemDefinition) => void; onContinue: () => void }) {
  return (
    <section className="side-section">
      <header>
        <h2><Package className="h-4 w-4" /> Armory</h2>
        <button type="button" onClick={onContinue}>Close</button>
      </header>
      <div className="shop-list">
        {itemShop.map(item => (
          <button key={item.id} type="button" className="shop-card item-card" onClick={() => onBuy(item)} disabled={gold < item.cost}>
            <span className="cost">{item.cost}g</span>
            <strong>{item.name}</strong>
            <span>{item.sourceType}</span>
            <small>{item.stat}. {item.effect}</small>
          </button>
        ))}
      </div>
    </section>
  );
}

function UnitChip({
  unit,
  selected,
  onSelect,
  onDragStart,
  onDragEnd,
  onRecall,
  onHoverUnit,
  onMoveTooltip,
  onLeaveTooltip
}: {
  unit: OwnedUnit;
  selected: boolean;
  onSelect: () => void;
  onDragStart: (event: DragEvent<HTMLButtonElement>) => void;
  onDragEnd: () => void;
  onRecall: () => void;
  onHoverUnit: (unit: OwnedUnit, event: MouseEvent<HTMLElement>) => void;
  onMoveTooltip: (event: MouseEvent<HTMLElement>) => void;
  onLeaveTooltip: () => void;
}) {
  return (
    <article className={`unit-chip ${selected ? 'selected' : ''}`}>
      <button
        type="button"
        draggable
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        onMouseEnter={(event) => onHoverUnit(unit, event)}
        onMouseMove={onMoveTooltip}
        onMouseLeave={onLeaveTooltip}
        onClick={onSelect}
      >
        <strong>{unit.pf2Class}</strong>
        <span>{unit.name}</span>
        <small>Tier {unit.tier} / {unit.items.length}/2 items</small>
      </button>
      <button type="button" aria-label={`Recall ${unit.name}`} onClick={onRecall}>
        <Crosshair className="h-4 w-4" />
      </button>
    </article>
  );
}

function InventoryPanel({
  inventory,
  selectedUnit,
  onAssign,
  onUnequip,
  onSell
}: {
  inventory: string[];
  selectedUnit: OwnedUnit | null;
  onAssign: (itemId: string) => void;
  onUnequip: (unitId: string, itemIndex: number) => void;
  onSell: (itemId: string) => void;
}) {
  return (
    <section className="side-section">
      <header>
        <h2><Package className="h-4 w-4" /> Items</h2>
        <span>{selectedUnit ? selectedUnit.pf2Class : 'Select a unit'}</span>
      </header>
      <div className="inventory-list">
        {inventory.length === 0 ? <p>No loose items.</p> : inventory.map((itemId, index) => {
          const item = getItem(itemId);
          return (
            <article key={`${itemId}-${index}`} className="inventory-item">
              <div>
                <strong>{item.name}</strong>
                <span>{item.stat}</span>
              </div>
              <div>
                <button type="button" onClick={() => onAssign(itemId)} disabled={!selectedUnit || selectedUnit.items.length >= 2}>Equip</button>
                <button type="button" onClick={() => onSell(itemId)}>Sell</button>
              </div>
            </article>
          );
        })}
      </div>
      {selectedUnit && (
        <div className="equipped-list">
          <span>Equipped</span>
          {selectedUnit.items.length === 0 ? (
            <p>None</p>
          ) : selectedUnit.items.map((itemId, index) => (
            <article key={`${selectedUnit.instanceId}-${itemId}-${index}`} className="equipped-item">
              <strong>{getItem(itemId).name}</strong>
              <button type="button" onClick={() => onUnequip(selectedUnit.instanceId, index)}>Remove</button>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function SynergyPanel({ activeSynergies, armyPower }: { activeSynergies: Array<{ trait: UnitTrait; count: number; tier: number }>; armyPower: number }) {
  return (
    <section className="side-section">
      <header>
        <h2><Sparkles className="h-4 w-4" /> Edicts</h2>
        <span>{armyPower} power</span>
      </header>
      <div className="synergy-list">
        {activeSynergies.length === 0 ? <p>Field more units to activate orders.</p> : activeSynergies.map(item => (
          <article key={item.trait}>
            <strong>{item.trait} {item.count}</strong>
            <span>Tier {item.tier}: {synergies[item.trait].text}</span>
          </article>
        ))}
      </div>
    </section>
  );
}

function LogPanel({ log, wins, losses, streak }: { log: string[]; wins: number; losses: number; streak: number }) {
  return (
    <section className="side-section">
      <header>
        <h2><Dices className="h-4 w-4" /> Ledger</h2>
        <span>{wins}-{losses} / streak {streak}</span>
      </header>
      <ol className="combat-log">
        {log.map((entry, index) => <li key={`${entry}-${index}`}>{entry}</li>)}
      </ol>
    </section>
  );
}

function combatHexToPosition(q: number, r: number) {
  return {
    x: 50 + q * 10 + r * 5,
    y: 60 + r * 11
  };
}

function formatTime(timeMs: number) {
  return `${(timeMs / 1000).toFixed(1)}s`;
}

function getUnitSpells(unit: UnitDefinition) {
  const classAbilities: Record<string, string[]> = {
    Barbarian: ['Rage opening: bonus damage and temporary durability'],
    Champion: ['Champion Reaction: shield a wounded adjacent ally', 'Devotion aura: front-line mitigation'],
    Cleric: ['Divine Font: heal the lowest-health ally', 'Doctrine strike: minor divine damage'],
    Druid: ['Order Spell: temporary health surge', 'Primal cantrip: ranged magic attack'],
    Fighter: ['Reactive Strike: punish closing or casting enemies', 'Weapon mastery: reliable physical pressure'],
    Gunslinger: ['Singular Expertise: opening back-line shot', 'Reload rhythm: slower high-impact attacks'],
    Inventor: ['Overdrive: bonus mixed damage', 'Unstable burst: engineering heat strike'],
    Kineticist: ['Impulse Junction: elemental cone pressure', 'Elemental gate: no spell slot dependency'],
    Magus: ['Spellstrike: weapon hit plus spell burst', 'Recharge: slower ability cycle'],
    Monk: ['Flurry of Blows: repeated strike sequence', 'Pinning form: brief target pressure'],
    Oracle: ['Mystery Curse: stronger magic while wounded', 'Divine spell: high-risk burst'],
    Psychic: ['Unleash Psyche: empowered spell window', 'Psi cantrip: reliable mental damage'],
    Ranger: ['Hunt Prey: focus-fire priority target', 'Skirmish shot: ranged martial pressure'],
    Rogue: ['Sneak Attack: bonus damage with allied pressure', 'Exploit flank: prefers engaged enemies'],
    Sorcerer: ['Sorcerous Potency: amplified spell damage', 'Bloodline spell: heavy ranged burst'],
    Summoner: ['Eidolon Link: projected vanguard protection', 'Shared spell: caster-backed pressure'],
    Swashbuckler: ['Panache: dodge into finishing pressure', 'Finisher: stronger isolated strike'],
    Thaumaturge: ['Exploit Vulnerability: mark the toughest enemy', 'Implement strike: mixed occult damage'],
    Witch: ['Hex Cantrip: weaken a focused enemy', 'Patron spell: repeatable ranged magic'],
    Wizard: ['Arcane Thesis: first spell enhancement', 'Prepared spell: ranged arcane burst']
  };

  return classAbilities[unit.pf2Class] ?? [unit.featText];
}

function buildLobby(tick: number): PlayerRecord[] {
  const count = Math.min(maxPlayers, 1 + tick);
  return playerNames.slice(0, count).map((name, index) => ({
    id: `player-${index}`,
    name,
    isPlayer: index === 0,
    health: 100,
    streak: 0
  }));
}

function fillLobby(players: PlayerRecord[]) {
  const filled = [...players];
  for (let index = players.length; index < maxPlayers; index += 1) {
    filled.push({
      id: `bot-${index}`,
      name: `Hellknight Automaton ${index + 1}`,
      isPlayer: false,
      health: 0,
      streak: 0
    });
  }
  return filled;
}

function buildShop(seed: number, round: number) {
  return Array.from({ length: roundShopSize }, (_, index) => {
    const roll = seededNumber(seed + round * 7 + index * 11, 0, units.length - 1);
    return units[(roll + index) % units.length];
  });
}

function buildItemShop(seed: number, round: number) {
  return Array.from({ length: 4 }, (_, index) => items[(seed + round * 3 + index * 5) % items.length]);
}

function seededNumber(seed: number, min: number, max: number) {
  const x = Math.sin(seed * 999) * 10000;
  const normalized = x - Math.floor(x);
  return Math.floor(normalized * (max - min + 1)) + min;
}

function getItem(itemId: string) {
  return items.find(item => item.id === itemId) ?? items[0];
}

function removeFirst(values: string[], target: string) {
  const index = values.indexOf(target);
  if (index < 0) return values;
  return values.filter((_, valueIndex) => valueIndex !== index);
}

function combineUnitCopies(currentBench: OwnedUnit[], selectedUnitId: string) {
  const selected = currentBench.find(unit => unit.instanceId === selectedUnitId);
  if (!selected || selected.tier >= 3) {
    return { units: currentBench, message: '', consumedIds: [], upgradedUnit: null, overflowItems: [] };
  }

  const matchingCopies = currentBench.filter(unit => unit.id === selected.id && unit.tier === selected.tier);
  if (matchingCopies.length < 3) {
    return { units: currentBench, message: '', consumedIds: [], upgradedUnit: null, overflowItems: [] };
  }

  const selectedCopy = matchingCopies.find(unit => unit.instanceId === selectedUnitId) ?? matchingCopies[0];
  const consumedCopies = [
    selectedCopy,
    ...matchingCopies.filter(unit => unit.instanceId !== selectedCopy.instanceId).slice(0, 2)
  ];
  const consumed = new Set(consumedCopies.map(unit => unit.instanceId));
  const definition = units.find(unit => unit.id === selected.id) ?? selected;
  const carriedItems = consumedCopies.flatMap(unit => unit.items);
  const upgraded: OwnedUnit = {
    ...definition,
    instanceId: `${selected.id}-tier-${selected.tier + 1}-${selectedCopy.instanceId}`,
    tier: (selected.tier + 1) as 2 | 3,
    items: carriedItems.slice(0, 2)
  };

  return {
    units: [...currentBench.filter(unit => !consumed.has(unit.instanceId)), upgraded],
    message: `${definition.pf2Class} promoted to tier ${selected.tier + 1}`,
    consumedIds: Array.from(consumed),
    upgradedUnit: upgraded,
    overflowItems: carriedItems.slice(2)
  };
}

function placeCombinedUnit(board: BoardSlot[], consumedIds: string[], upgradedUnitId: string, preferredUnitId: string) {
  const preferredIndex = board.findIndex(slot => slot.unitId === preferredUnitId);
  const anchorIndex = preferredIndex >= 0
    ? preferredIndex
    : board.findIndex(slot => slot.unitId && consumedIds.includes(slot.unitId));
  if (anchorIndex < 0) {
    return board;
  }
  return board.map((slot, index) => {
    if (index === anchorIndex) return { ...slot, unitId: upgradedUnitId };
    if (slot.unitId && consumedIds.includes(slot.unitId)) return { ...slot, unitId: null };
    return slot;
  });
}

function getActiveSynergies(army: OwnedUnit[]) {
  const counts = new Map<UnitTrait, number>();
  army.forEach(unit => unit.traits.forEach(trait => counts.set(trait, (counts.get(trait) ?? 0) + 1)));
  return Array.from(counts.entries()).flatMap(([trait, count]) => {
    const tier = synergies[trait].thresholds.filter(threshold => count >= threshold).length;
    return tier > 0 ? [{ trait, count, tier }] : [];
  });
}

function calculateArmyPower(army: OwnedUnit[], activeSynergies: Array<{ trait: UnitTrait; count: number; tier: number }>) {
  const unitPower = army.reduce((total, unit) => {
    const itemPower = unit.items.reduce((sum, itemId) => sum + getItem(itemId).cost * 18, 0);
    const spellPower = unit.spellSlots * unit.magicDamage * 0.6;
    const tierMultiplier = unit.tier === 1 ? 1 : unit.tier === 2 ? 1.85 : 3.2;
    const effectiveHealth = getDisplayedHealth(unit, activeSynergies, true);
    return total + Math.round(effectiveHealth * 0.26 + (unit.attackDamage * unit.attackSpeed * 8 + spellPower + itemPower) * tierMultiplier);
  }, 0);
  const synergyPower = activeSynergies.reduce((total, synergy) => total + synergy.tier * 85 + synergy.count * 12, 0);
  return Math.round(unitPower + synergyPower);
}

function moveUnitOnBoard(board: BoardSlot[], unitId: string, slotIndex: number): BoardSlot[] {
  if (!board[slotIndex]) return board;
  const originIndex = board.findIndex(slot => slot.unitId === unitId);
  const targetUnitId = board[slotIndex].unitId;
  if (originIndex === slotIndex) return board;
  return board.map((slot, index) => {
    if (index === slotIndex) return { ...slot, unitId };
    if (index === originIndex) return { ...slot, unitId: targetUnitId };
    return slot;
  });
}

function getDisplayedHealth(
  unit: UnitDefinition | OwnedUnit,
  activeSynergies: Array<{ trait: UnitTrait; count: number; tier: number }>,
  edictsApply: boolean
) {
  const tierMultiplier = 'tier' in unit ? unit.tier === 1 ? 1 : unit.tier === 2 ? 1.85 : 3.2 : 1;
  const itemHealth = 'items' in unit ? unit.items.reduce((total, itemId) => {
    if (itemId === 'sturdy-shield') return total + 150;
    if (itemId === 'resilient-rune') return total + 120;
    if (itemId === 'elixir-life') return total + 80;
    return total;
  }, 0) : 0;
  const vanguardTier = edictsApply && unit.traits.includes('Vanguard')
    ? activeSynergies.find(synergy => synergy.trait === 'Vanguard')?.tier ?? 0
    : 0;
  return Math.round((unit.health + itemHealth + vanguardTier * 110) * tierMultiplier);
}
