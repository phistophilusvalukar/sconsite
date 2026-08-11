import { useEffect, useMemo, useState } from 'react';
import type { CSSProperties, DragEvent, MouseEvent } from 'react';
import { Coins, Dices, Hourglass, Package, Play, RefreshCw, Shield, ShoppingBag, Sparkles, Swords } from 'lucide-react';
import {
  boardSlots as initialBoardSlots,
  items,
  lobbyNames,
  synergies,
  units,
  type AttackSpeed,
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
  type CombatSimulationResult,
  type CombatUnitEffect
} from '../engine/combatEngine';
import { calculateUnitBalanceMetrics } from '../engine/balanceMetrics';
import {
  addRoundSupply,
  createUnitPool,
  getShopRerollCost,
  getUnitPrice,
  getUnitRarity,
  getUnitCopiesForTier,
  getUnitSellValue,
  removeShopOffer,
  returnUnitToPool,
  rollBattleItemDrop,
  rollUnitShop,
  takeUnitFromPool,
  type ShopOffer
} from '../engine/shopEngine';
import {
  EXPERIENCE_PURCHASE_COST,
  MATCH_EXPERIENCE,
  MATCH_WIN_GOLD,
  PURCHASE_EXPERIENCE,
  applyRoundOutcomes,
  areAllActiveParticipantsReady,
  calculateBattleOutcomeDamage,
  createMatchParticipants,
  createRoundPairings,
  getExperienceRequired,
  getLastStanding,
  getTeamCapacity,
  markNpcParticipantsReady,
  purchaseExperience,
  resolveNpcPairing,
  setParticipantReady,
  trimBoardToCapacity,
  type BattleOutcome,
  type MatchParticipant,
  type RoundPairing
} from '../engine/matchEngine';
import './hellknightAutobattler.css';

type Phase = 'lobby' | 'shop' | 'combat' | 'item-shop';
type ActiveSynergy = { trait: UnitTrait; count: number; tier: number };
interface EffectiveUnitStats {
  health: number;
  attackDamage: number;
  magicDamage: number;
  attackSpeed: AttackSpeed;
  range: number;
  spellSlots: number;
  edictNotes: string[];
}

type HoveredUnit =
  | { kind: 'unit'; unit: UnitDefinition | OwnedUnit; stats: EffectiveUnitStats; x: number; y: number }
  | { kind: 'combat'; unit: CombatFrameUnit; x: number; y: number };

interface LobbyPlayerRecord {
  id: string;
  name: string;
  isPlayer: boolean;
  health: number;
  streak: number;
}

interface CombatResult {
  round: number;
  opponentId: string | null;
  opponent: string;
  won: boolean;
  loserDamage: number;
  summary: string;
  simulation: CombatSimulationResult;
  participants: MatchParticipant[];
  pairings: RoundPairing[];
  playerPairing: RoundPairing;
  rewardItemId: string | null;
}

const playerNames = ['You', 'Avarice Trial', 'Ink Rack', 'Citadel Nail', 'Black Archive', 'Gate Signifer', 'Pyre Marshal', 'Torrent Bailiff'];
const maxPlayers = 8;
const startingGold = 5;
const benchLimit = 9;
const roundShopSize = 5;

type SpellShape = 'orb' | 'shard' | 'diamond' | 'star' | 'cross' | 'leaf' | 'hex' | 'gear' | 'eye';
type EffectTone = 'buff' | 'debuff';

interface ProjectileTheme {
  primary: string;
  secondary: string;
  glow: string;
  shape: SpellShape;
}

const projectileThemes: Record<string, ProjectileTheme> = {
  Fighter: { primary: '#f59e0b', secondary: '#fef3c7', glow: '#fbbf24', shape: 'shard' },
  Barbarian: { primary: '#ef4444', secondary: '#fed7aa', glow: '#f97316', shape: 'shard' },
  Champion: { primary: '#eab308', secondary: '#ffffff', glow: '#fde047', shape: 'cross' },
  Ranger: { primary: '#22c55e', secondary: '#d9f99d', glow: '#4ade80', shape: 'leaf' },
  Rogue: { primary: '#a855f7', secondary: '#fbcfe8', glow: '#d946ef', shape: 'shard' },
  Wizard: { primary: '#7c3aed', secondary: '#a5f3fc', glow: '#8b5cf6', shape: 'diamond' },
  Sorcerer: { primary: '#f43f5e', secondary: '#fed7aa', glow: '#fb7185', shape: 'star' },
  Cleric: { primary: '#38bdf8', secondary: '#ffffff', glow: '#7dd3fc', shape: 'cross' },
  Druid: { primary: '#16a34a', secondary: '#bef264', glow: '#4ade80', shape: 'leaf' },
  Witch: { primary: '#9333ea', secondary: '#bbf7d0', glow: '#c084fc', shape: 'hex' },
  Magus: { primary: '#4f46e5', secondary: '#67e8f9', glow: '#818cf8', shape: 'diamond' },
  Gunslinger: { primary: '#94a3b8', secondary: '#e0f2fe', glow: '#38bdf8', shape: 'shard' },
  Inventor: { primary: '#f97316', secondary: '#67e8f9', glow: '#fb923c', shape: 'gear' },
  Kineticist: { primary: '#06b6d4', secondary: '#fed7aa', glow: '#22d3ee', shape: 'orb' },
  Oracle: { primary: '#d946ef', secondary: '#fef08a', glow: '#e879f9', shape: 'eye' },
  Monk: { primary: '#f59e0b', secondary: '#fef9c3', glow: '#facc15', shape: 'orb' },
  Swashbuckler: { primary: '#0ea5e9', secondary: '#fde68a', glow: '#38bdf8', shape: 'shard' },
  Summoner: { primary: '#14b8a6', secondary: '#ddd6fe', glow: '#2dd4bf', shape: 'hex' },
  Thaumaturge: { primary: '#ea580c', secondary: '#e9d5ff', glow: '#fb923c', shape: 'star' },
  Psychic: { primary: '#ec4899', secondary: '#a5f3fc', glow: '#f472b6', shape: 'eye' }
};

const fallbackProjectileTheme: ProjectileTheme = {
  primary: '#38bdf8',
  secondary: '#f8fafc',
  glow: '#7dd3fc',
  shape: 'orb'
};

const projectileScaleByTier: Record<CombatFrameUnit['tier'], number> = { 1: 0.9, 2: 1.25, 3: 1.65 };

const combatEffectDetails: Record<CombatUnitEffect, { label: string; shortLabel: string; tone: EffectTone }> = {
  warded: { label: 'Warded', shortLabel: 'WD', tone: 'buff' },
  raging: { label: 'Raging', shortLabel: 'RG', tone: 'buff' },
  psyche: { label: 'Unleashed Psyche', shortLabel: 'PS', tone: 'buff' },
  panache: { label: 'Panache', shortLabel: 'PN', tone: 'buff' },
  hexed: { label: 'Hexed', shortLabel: 'HX', tone: 'debuff' },
  burning: { label: 'Burning', shortLabel: 'BR', tone: 'debuff' },
  pinned: { label: 'Pinned', shortLabel: 'PI', tone: 'debuff' },
  hunted: { label: 'Hunted Prey', shortLabel: 'HT', tone: 'debuff' },
  exposed: { label: 'Exploit Vulnerability', shortLabel: 'EX', tone: 'debuff' },
  fleeing: { label: 'Fleeing', shortLabel: 'FL', tone: 'debuff' }
};

export default function HellknightAutobattlerPage() {
  const [phase, setPhase] = useState<Phase>('lobby');
  const [lobbyTick, setLobbyTick] = useState(0);
  const [round, setRound] = useState(1);
  const [gold, setGold] = useState(startingGold);
  const [health, setHealth] = useState(100);
  const [wins, setWins] = useState(0);
  const [losses, setLosses] = useState(0);
  const [streak, setStreak] = useState(0);
  const [playerLevel, setPlayerLevel] = useState(1);
  const [playerExperience, setPlayerExperience] = useState(0);
  const [matchParticipants, setMatchParticipants] = useState<MatchParticipant[]>(() => markNpcParticipantsReady(createMatchParticipants(playerNames)));
  const [roundSettled, setRoundSettled] = useState(false);
  const [matchWinner, setMatchWinner] = useState<MatchParticipant | null>(null);
  const [shopSeed, setShopSeed] = useState(17);
  const [itemSeed, setItemSeed] = useState(91);
  const [nextInstance, setNextInstance] = useState(1);
  const [bench, setBench] = useState<OwnedUnit[]>([]);
  const [board, setBoard] = useState<BoardSlot[]>(initialBoardSlots);
  const [inventory, setInventory] = useState<string[]>(['sturdy-shield']);
  const [unitPool, setUnitPool] = useState(createUnitPool);
  const [shop, setShop] = useState<ShopOffer[]>(() => rollUnitShop(17, 1, createUnitPool(), roundShopSize));
  const [selectedUnitId, setSelectedUnitId] = useState<string | null>(null);
  const [inspectedShopUnit, setInspectedShopUnit] = useState<UnitDefinition | null>(null);
  const [inspectedItem, setInspectedItem] = useState<ItemDefinition | null>(null);
  const [draggedUnitId, setDraggedUnitId] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<CombatResult | null>(null);
  const [playbackFrameIndex, setPlaybackFrameIndex] = useState(0);
  const [hoveredUnit, setHoveredUnit] = useState<HoveredUnit | null>(null);
  const [log, setLog] = useState<string[]>(['Queue opens under black iron banners.']);

  const lobbyPlayers = useMemo(() => buildLobby(lobbyTick), [lobbyTick]);
  const itemShop = useMemo(() => buildItemShop(itemSeed, round), [itemSeed, round]);
  const army = useMemo(() => board
    .map(slot => bench.find(unit => unit.instanceId === slot.unitId))
    .filter((unit): unit is OwnedUnit => Boolean(unit)), [bench, board]);
  const activeSynergies = useMemo(() => getActiveSynergies(army), [army]);
  const armyPower = useMemo(() => calculateArmyPower(army, activeSynergies), [army, activeSynergies]);
  const vanguardTier = activeSynergies.find(synergy => synergy.trait === 'Vanguard')?.tier ?? 0;
  const teamCapacity = getTeamCapacity(playerLevel, vanguardTier);
  const readyParticipants = matchParticipants.filter(participant => !participant.eliminated && participant.health > 0 && participant.ready).length;
  const activeParticipants = matchParticipants.filter(participant => !participant.eliminated && participant.health > 0).length;
  const localMatchParticipant = matchParticipants.find(participant => participant.isLocalPlayer) ?? null;
  const experienceRequired = getExperienceRequired(playerLevel);
  const benchUnits = bench.filter(unit => !board.some(slot => slot.unitId === unit.instanceId));
  const selectedUnit = bench.find(unit => unit.instanceId === selectedUnitId) ?? null;
  const detailUnit: UnitDefinition | OwnedUnit | null = selectedUnit ?? inspectedShopUnit;
  const selectedUnitIsDeployed = Boolean(selectedUnit && board.some(slot => slot.unitId === selectedUnit.instanceId));
  const selectedCombineCopies = selectedUnit
    ? bench.filter(unit => unit.id === selectedUnit.id && unit.tier === selectedUnit.tier).length
    : 0;
  const rosterFull = bench.length >= benchLimit + 7;
  const currentCombatFrame = lastResult?.simulation.frames[Math.min(playbackFrameIndex, lastResult.simulation.frames.length - 1)] ?? null;
  const combatPlaybackDone = Boolean(lastResult && playbackFrameIndex >= lastResult.simulation.frames.length - 1);

  useEffect(() => {
    if (phase !== 'combat' || !lastResult || combatPlaybackDone) return undefined;
    const currentFrame = lastResult.simulation.frames[playbackFrameIndex];
    const nextFrame = lastResult.simulation.frames[playbackFrameIndex + 1];
    const playbackDelayMs = Math.max(0, (nextFrame?.timeMs ?? currentFrame.timeMs) - currentFrame.timeMs);
    const timer = window.setTimeout(() => {
      setPlaybackFrameIndex(current => Math.min(current + 1, lastResult.simulation.frames.length - 1));
    }, playbackDelayMs);
    return () => window.clearTimeout(timer);
  }, [combatPlaybackDone, lastResult, phase, playbackFrameIndex]);

  useEffect(() => {
    if (phase !== 'combat' || !lastResult || !combatPlaybackDone || roundSettled) return;
    setRoundSettled(true);
    const localPlayer = lastResult.participants.find(participant => participant.isLocalPlayer);
    if (!localPlayer) return;
    const playerOutcome: BattleOutcome = {
      pairingId: lastResult.playerPairing.id,
      participantIds: [localPlayer.id, ...(lastResult.opponentId ? [lastResult.opponentId] : [])],
      winnerId: lastResult.simulation.winner === 'player'
        ? localPlayer.id
        : lastResult.simulation.winner === 'enemy' ? lastResult.opponentId : null,
      loserId: lastResult.simulation.winner === 'player'
        ? lastResult.opponentId
        : lastResult.simulation.winner === 'enemy' ? localPlayer.id : null,
      damage: lastResult.loserDamage
    };
    const npcOutcomes = lastResult.pairings
      .filter(pairing => pairing.id !== lastResult.playerPairing.id)
      .map(pairing => resolveNpcPairing(pairing, lastResult.participants, lastResult.round, shopSeed + itemSeed));
    const settledParticipants = applyRoundOutcomes(lastResult.participants, [playerOutcome, ...npcOutcomes]);
    const settledLocalPlayer = settledParticipants.find(participant => participant.isLocalPlayer)!;
    const interest = Math.floor(localPlayer.gold / 10);
    const matchGold = lastResult.won ? MATCH_WIN_GOLD : 0;
    const playerDamageTaken = lastResult.simulation.winner === 'enemy' ? lastResult.loserDamage : 0;
    const opponentDamageTaken = lastResult.simulation.winner === 'player' ? lastResult.loserDamage : 0;
    const rewardItem = lastResult.rewardItemId ? getItem(lastResult.rewardItemId) : null;
    const leveledUp = settledLocalPlayer.level > localPlayer.level;
    const verdict = lastResult.simulation.winner === 'player' ? 'Victory' : lastResult.simulation.winner === 'draw' ? 'Draw' : 'Defeat';
    const rewardSummary = matchGold > 0
      ? `${matchGold + interest} gold${interest > 0 ? `, including ${interest} interest` : ''}`
      : `${interest} interest gold and no match gold`;

    setMatchParticipants(settledParticipants);
    setGold(settledLocalPlayer.gold);
    setHealth(settledLocalPlayer.health);
    setStreak(settledLocalPlayer.streak);
    setPlayerLevel(settledLocalPlayer.level);
    setPlayerExperience(settledLocalPlayer.experience);
    setWins(current => current + (lastResult.simulation.winner === 'player' ? 1 : 0));
    setLosses(current => current + (lastResult.simulation.winner === 'enemy' ? 1 : 0));
    if (rewardItem) setInventory(current => [...current, rewardItem.id]);
    const winner = getLastStanding(settledParticipants);
    setMatchWinner(winner);
    setLastResult(current => current ? {
      ...current,
      summary: `${verdict} against ${current.opponent}. Awarded ${rewardSummary}${playerDamageTaken > 0 ? `; took ${playerDamageTaken} damage` : ''}${opponentDamageTaken > 0 ? `; dealt ${opponentDamageTaken} commander damage` : ''}${leveledUp ? `; reached level ${settledLocalPlayer.level}` : ''}${rewardItem ? `; recovered ${rewardItem.name}` : ''}.`
    } : current);
    setLog(current => [
      `${verdict} in round ${lastResult.round} vs ${lastResult.opponent}: ${rewardSummary}${playerDamageTaken > 0 ? `, ${playerDamageTaken} damage taken` : ''}${opponentDamageTaken > 0 ? `, ${opponentDamageTaken} commander damage dealt` : ''}.`,
      `All active commanders gained ${MATCH_EXPERIENCE} XP.${leveledUp ? ` You reached level ${settledLocalPlayer.level}.` : ''}`,
      ...npcOutcomes.map(outcome => formatNpcOutcome(outcome, settledParticipants)),
      ...lastResult.simulation.ledger.slice(0, 3),
      ...current
    ].slice(0, 9));
  }, [combatPlaybackDone, itemSeed, lastResult, phase, roundSettled, shopSeed]);

  useEffect(() => {
    if (army.length <= teamCapacity) return;
    const trimmed = trimBoardToCapacity(board, teamCapacity);
    if (trimmed.recalledUnitIds.length === 0) return;
    setBoard(trimmed.slots);
    setLog(current => [`Team capacity fell to ${teamCapacity}; ${trimmed.recalledUnitIds.length} excess unit${trimmed.recalledUnitIds.length === 1 ? ' was' : 's were'} recalled.`, ...current].slice(0, 9));
  }, [army.length, board, teamCapacity]);

  function advanceLobby() {
    const nextTick = lobbyTick + 1;
    setLobbyTick(nextTick);
    const visibleCount = buildLobby(nextTick).length;
    setLog(current => [`${lobbyNames[nextTick % lobbyNames.length]} joins the queue. ${visibleCount}/${maxPlayers} seats showing.`, ...current].slice(0, 6));
  }

  function startMatch() {
    const participants = markNpcParticipantsReady(createMatchParticipants(playerNames));
    setMatchParticipants(participants);
    setPlayerLevel(1);
    setPlayerExperience(0);
    setHealth(100);
    setGold(startingGold);
    setStreak(0);
    setRoundSettled(false);
    setMatchWinner(null);
    setPhase('shop');
    setLog([
      `Match sealed with ${lobbyPlayers.length} player${lobbyPlayers.length === 1 ? '' : 's'} and ${maxPlayers - lobbyPlayers.length} automata.`,
      `Round ${round}: buy five offered units, place your line, then submit the verdict.`,
      ...log
    ].slice(0, 7));
  }

  function buyUnit(offer: ShopOffer) {
    const { unit } = offer;
    if (!shop.some(currentOffer => currentOffer.offerId === offer.offerId)
      || gold < unit.cost
      || rosterFull
      || (unitPool[unit.id] ?? 0) <= 0) return;
    const ownedUnit: OwnedUnit = {
      ...unit,
      instanceId: `${unit.id}-${nextInstance}`,
      tier: 1,
      items: []
    };
    setBench(current => [...current, ownedUnit]);
    setUnitPool(current => takeUnitFromPool(current, unit.id));
    setShop(current => removeShopOffer(current, offer.offerId));
    setNextInstance(current => current + 1);
    setGold(current => current - unit.cost);
    setInspectedShopUnit(null);
    setLog(current => [`Bought rarity ${offer.rarity} ${unit.name}; its shop slot is now empty.`, ...current].slice(0, 6));
  }

  function inspectShopUnit(unit: UnitDefinition) {
    setSelectedUnitId(null);
    setInspectedItem(null);
    setInspectedShopUnit(unit);
  }

  function inspectItem(item: ItemDefinition) {
    setSelectedUnitId(null);
    setInspectedShopUnit(null);
    setInspectedItem(item);
  }

  function refreshShop() {
    const rerollCost = getShopRerollCost(shop);
    if (gold < rerollCost) return;
    const nextShopSeed = shopSeed + 31;
    setGold(current => current - rerollCost);
    setShopSeed(nextShopSeed);
    setShop(rollUnitShop(nextShopSeed, round, unitPool, roundShopSize));
    setLog(current => [
      `${rerollCost === 0 ? 'The empty roster is refilled' : 'The quartermaster burns a writ'} and deals five new recruits.`,
      ...current
    ].slice(0, 6));
  }

  function placeUnit(unitId: string, slotIndex: number) {
    const alreadyDeployed = board.some(slot => slot.unitId === unitId);
    const replacingUnit = Boolean(board[slotIndex]?.unitId);
    if (!alreadyDeployed && !replacingUnit && army.length >= teamCapacity) {
      setLog(current => [`Deployment is capped at ${teamCapacity} units. Gain a level or activate Vanguard tier 3.`, ...current].slice(0, 9));
      return;
    }
    setBoard(current => moveUnitOnBoard(current, unitId, slotIndex));
    setSelectedUnitId(null);
  }

  function buyExperience() {
    const purchase = purchaseExperience(playerLevel, playerExperience, gold);
    if (!purchase.purchased) return;
    setGold(purchase.gold);
    setPlayerLevel(purchase.level);
    setPlayerExperience(purchase.experience);
    setMatchParticipants(current => current.map(participant => participant.isLocalPlayer ? {
      ...participant,
      gold: purchase.gold,
      level: purchase.level,
      experience: purchase.experience
    } : participant));
    setLog(current => [
      `Purchased ${PURCHASE_EXPERIENCE} XP for ${EXPERIENCE_PURCHASE_COST} gold${purchase.level > playerLevel ? ` and reached level ${purchase.level}` : ''}.`,
      ...current
    ].slice(0, 9));
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
    const refund = getUnitSellValue(unit);
    setBench(current => current.filter(candidate => candidate.instanceId !== unitId));
    setUnitPool(current => returnUnitToPool(current, unit.id, getUnitCopiesForTier(unit.tier)));
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

  function readyForCombat() {
    const localPlayer = matchParticipants.find(participant => participant.isLocalPlayer);
    if (!localPlayer || localPlayer.eliminated || army.length === 0) return;
    let preparedParticipants = matchParticipants.map(participant => participant.isLocalPlayer ? {
      ...participant,
      health,
      gold,
      level: playerLevel,
      experience: playerExperience,
      streak
    } : participant);
    preparedParticipants = markNpcParticipantsReady(setParticipantReady(preparedParticipants, localPlayer.id, true));
    setMatchParticipants(preparedParticipants);
    if (!areAllActiveParticipantsReady(preparedParticipants)) {
      setLog(current => ['Your army is ready. Waiting for the remaining commanders.', ...current].slice(0, 9));
      return;
    }

    const pairings = createRoundPairings(preparedParticipants, round, shopSeed + itemSeed);
    const playerPairing = pairings.find(pairing => pairing.leftId === localPlayer.id || pairing.rightId === localPlayer.id);
    if (!playerPairing) return;
    const opponentId = playerPairing.leftId === localPlayer.id ? playerPairing.rightId : playerPairing.leftId;
    const opponent = preparedParticipants.find(participant => participant.id === opponentId)?.name ?? 'Citadel Echo';
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
    const finalFrame = simulation.frames.at(-1);
    const loserDamage = calculateBattleOutcomeDamage(simulation.winner, finalFrame?.units ?? []);
    const droppedItem = rollBattleItemDrop(itemSeed + shopSeed, round, won);

    setPhase('combat');
    setPlaybackFrameIndex(0);
    setRoundSettled(false);
    setLastResult({
      round,
      opponentId,
      opponent,
      won,
      loserDamage,
      summary: `Combat underway against ${opponent}. Rewards settle when the verdict is final.`,
      simulation,
      participants: preparedParticipants,
      pairings,
      playerPairing,
      rewardItemId: droppedItem?.id ?? null
    });
    setLog(current => [`All ${preparedParticipants.filter(participant => !participant.eliminated).length} active commanders are ready. Round ${round} pairings locked.`, ...current].slice(0, 9));
  }

  function nextPlanningPhase() {
    if (!roundSettled || matchWinner) return;
    const localPlayer = matchParticipants.find(participant => participant.isLocalPlayer);
    if (!localPlayer || localPlayer.eliminated) return;
    const readyForShop = markNpcParticipantsReady(setParticipantReady(matchParticipants, localPlayer.id, true));
    setMatchParticipants(readyForShop);
    if (!areAllActiveParticipantsReady(readyForShop)) {
      setLog(current => ['Ready for the next shop. Waiting for the remaining commanders.', ...current].slice(0, 9));
      return;
    }
    const nextRound = round + 1;
    const nextShopSeed = shopSeed + 13;
    const nextUnitPool = addRoundSupply(unitPool);
    setUnitPool(nextUnitPool);
    setRound(nextRound);
    setShopSeed(nextShopSeed);
    setShop(rollUnitShop(nextShopSeed, nextRound, nextUnitPool, roundShopSize));
    setItemSeed(current => current + 19);
    setMatchParticipants(current => markNpcParticipantsReady(current.map(participant => participant.isLocalPlayer
      ? { ...participant, ready: false }
      : participant)));
    setPhase(round % 3 === 0 ? 'item-shop' : 'shop');
    setLog(current => [`All active commanders are ready. Round ${nextRound} shop phase begins.`, ...current].slice(0, 9));
  }

  function resolveRemainingTournament() {
    const localPlayer = matchParticipants.find(participant => participant.isLocalPlayer);
    if (!localPlayer?.eliminated || matchWinner) return;

    let resolvedParticipants = matchParticipants;
    let resolvedRound = round;
    let finalRoundMessages: string[] = [];

    for (let step = 0; step < 200 && !getLastStanding(resolvedParticipants); step += 1) {
      resolvedRound += 1;
      const pairings = createRoundPairings(resolvedParticipants, resolvedRound, shopSeed + itemSeed + resolvedRound * 29);
      const outcomes = pairings.map(pairing => resolveNpcPairing(
        pairing,
        resolvedParticipants,
        resolvedRound,
        shopSeed + itemSeed + resolvedRound * 29
      ));
      resolvedParticipants = applyRoundOutcomes(resolvedParticipants, outcomes);
      finalRoundMessages = outcomes.map(outcome => formatNpcOutcome(outcome, resolvedParticipants));
    }

    const winner = getLastStanding(resolvedParticipants);
    setRound(resolvedRound);
    setMatchParticipants(resolvedParticipants);
    setMatchWinner(winner);
    setLastResult(current => current ? {
      ...current,
      summary: winner
        ? `${winner.name} is the last commander standing after ${resolvedRound} rounds.`
        : `The automated tournament reached round ${resolvedRound} without a final verdict.`
    } : current);
    setLog(current => [
      winner ? `${winner.name} wins the Citadel Tactics match.` : 'The remaining tournament could not reach a final verdict.',
      ...finalRoundMessages,
      ...current
    ].slice(0, 9));
  }

  function showUnitTooltip(unit: UnitDefinition | OwnedUnit, event: MouseEvent<HTMLElement>) {
    const isDeployed = 'instanceId' in unit && board.some(slot => slot.unitId === unit.instanceId);
    setHoveredUnit({
      kind: 'unit',
      unit,
      stats: getEffectiveUnitStats(unit, activeSynergies, isDeployed),
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
            <span><Sparkles className="h-4 w-4" /> Level {playerLevel} {experienceRequired > 0 ? `(${playerExperience}/${experienceRequired} XP)` : '(Max)'}</span>
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
                  <div className="round-flow-status">
                    <span>Team {army.length}/{teamCapacity}</span>
                    <span>{readyParticipants}/{activeParticipants} ready</span>
                    {vanguardTier >= 3 && <span>Vanguard command +1</span>}
                  </div>
                </div>
                <div className="toolbar-actions">
                  {phase === 'combat' ? (
                    <button
                      type="button"
                      onClick={localMatchParticipant?.eliminated ? resolveRemainingTournament : nextPlanningPhase}
                      disabled={!combatPlaybackDone || !roundSettled || Boolean(matchWinner)}
                    >
                      <Play className="h-4 w-4" /> {matchWinner ? `${matchWinner.name} Wins` : localMatchParticipant?.eliminated ? 'Resolve Remaining Match' : 'Ready for Next Shop'}
                    </button>
                  ) : (
                    <>
                      <button type="button" onClick={buyExperience} disabled={gold < EXPERIENCE_PURCHASE_COST || experienceRequired === 0}>
                        <Sparkles className="h-4 w-4" /> Buy {PURCHASE_EXPERIENCE} XP · {EXPERIENCE_PURCHASE_COST}g
                      </button>
                      <button type="button" className="primary-action" onClick={readyForCombat} disabled={army.length === 0 || Boolean(localMatchParticipant?.ready)}>
                        <Swords className="h-4 w-4" /> {localMatchParticipant?.ready ? 'Waiting for Commanders' : 'Ready for Combat'}
                      </button>
                    </>
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
                <section className="square-board" aria-label="Square deployment board">
                  {board.map((slot, index) => {
                    const unit = bench.find(candidate => candidate.instanceId === slot.unitId);
                    const selected = Boolean(unit && selectedUnitId === unit.instanceId);
                    const effectiveStats = unit ? getEffectiveUnitStats(unit, activeSynergies, true) : null;
                    return (
                      <button
                        key={`${slot.q}:${slot.r}`}
                        type="button"
                        className={`square-cell ${unit ? 'occupied' : ''} ${selected ? 'selected' : ''}`}
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
                            setInspectedShopUnit(null);
                            setInspectedItem(null);
                            setSelectedUnitId(selected ? null : unit.instanceId);
                          }
                        }}
                        disabled={Boolean(!unit && selectedUnitId && army.length >= teamCapacity)}
                        aria-label={`Board square ${index + 1}`}
                      >
                        {unit ? (
                          <>
                            <strong>{unit.pf2Class}</strong>
                            <span>Tier {unit.tier} / HP {effectiveStats?.health ?? unit.health}</span>
                            {unit.items.length > 0 && (
                              <span className="board-item-slots" aria-label={`${unit.items.length} equipped item${unit.items.length === 1 ? '' : 's'}`}>
                                {unit.items.map((itemId, itemIndex) => {
                                  const item = getItem(itemId);
                                  return <span key={`${itemId}-${itemIndex}`} className="board-item-slot" title={item.name}>{item.name}</span>;
                                })}
                              </span>
                            )}
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
                    onSelect={() => {
                      setInspectedShopUnit(null);
                      setInspectedItem(null);
                      setSelectedUnitId(unit.instanceId);
                    }}
                    onDragStart={(event) => startUnitDrag(unit.instanceId, event)}
                    onDragEnd={() => setDraggedUnitId(null)}
                    onHoverUnit={showUnitTooltip}
                    onMoveTooltip={moveTooltip}
                    onLeaveTooltip={() => setHoveredUnit(null)}
                  />
                ))}
              </section>
              {inspectedItem ? (
                <ItemDetailPanel item={inspectedItem} />
              ) : (
                <UnitDetailPanel
                  unit={detailUnit}
                  isDeployed={selectedUnitIsDeployed}
                  combineCopies={selectedCombineCopies}
                  onRecall={recallUnit}
                  onCombine={combineSelectedUnit}
                  onSell={sellUnit}
                  activeSynergies={activeSynergies}
                />
              )}
            </main>

            <aside className="command-column">
              {phase === 'item-shop' ? (
                <ItemShopPanel itemShop={itemShop} gold={gold} onInspect={inspectItem} onBuy={buyItem} onContinue={() => setPhase('shop')} />
              ) : (
                <ShopPanel
                  shop={shop}
                  gold={gold}
                  onInspect={inspectShopUnit}
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
              <StandingsPanel participants={matchParticipants} />
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
  const unitById = new Map(frame.units.map(unit => [unit.id, unit]));
  const effects = frame.units.flatMap(source => source.visualAction?.targetIds.flatMap((targetId, index) => {
    const target = unitById.get(targetId);
    return target ? [{ source, target, index, kind: source.visualAction!.kind }] : [];
  }) ?? []);
  return (
    <section className="combat-arena" aria-label="Real-time combat arena">
      <div className="combat-arena-grid" />
      <div className="combat-status-strip">
        <span>{formatTime(frame.timeMs)}</span>
        <strong>{frame.message}</strong>
        <span>{result ? `${result.opponent}` : 'Opponent'}</span>
      </div>
      <div className="combat-effects-layer" aria-hidden="true">
        {effects.map(effect => (
          <CombatEffect
            key={`${frame.timeMs}-${effect.source.id}-${effect.target.id}-${effect.index}`}
            source={effect.source}
            target={effect.target}
            kind={effect.kind}
          />
        ))}
      </div>
      {frame.units.map(unit => (
        <CombatPiece
          key={`${unit.id}-${unit.visualAction ? frame.timeMs : 'idle'}`}
          unit={unit}
          target={unit.visualAction ? unitById.get(unit.visualAction.targetIds[0]) : undefined}
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

function CombatEffect({
  source,
  target,
  kind
}: {
  source: CombatFrameUnit;
  target: CombatFrameUnit;
  kind: NonNullable<CombatFrameUnit['visualAction']>['kind'];
}) {
  const sourceColumn = Math.max(0, Math.min(8, source.q + 4));
  const sourceRow = Math.max(0, Math.min(8, source.r + 5));
  const targetColumn = Math.max(0, Math.min(8, target.q + 4));
  const targetRow = Math.max(0, Math.min(8, target.r + 5));
  const deltaColumn = targetColumn - sourceColumn;
  const deltaRow = targetRow - sourceRow;
  const distance = Math.hypot(deltaColumn, deltaRow);
  const angle = Math.atan2(deltaRow, deltaColumn) * (180 / Math.PI);
  const sourceLeft = ((sourceColumn + 0.5) / 9) * 100;
  const sourceTop = ((sourceRow + 0.5) / 9) * 100;
  const targetLeft = ((targetColumn + 0.5) / 9) * 100;
  const targetTop = ((targetRow + 0.5) / 9) * 100;
  const theme = projectileThemes[source.pf2Class] ?? fallbackProjectileTheme;
  const projectileScale = projectileScaleByTier[source.tier];
  const style = {
    '--effect-source-left': `${sourceLeft}%`,
    '--effect-source-top': `${sourceTop}%`,
    '--effect-target-left': `${targetLeft}%`,
    '--effect-target-top': `${targetTop}%`,
    '--effect-mid-left': `${sourceLeft + (targetLeft - sourceLeft) * 0.58}%`,
    '--effect-mid-top': `${sourceTop + (targetTop - sourceTop) * 0.58}%`,
    '--effect-trail-length': `${(distance / 9) * 100}%`,
    '--effect-angle': `${angle}deg`,
    '--projectile-primary': theme.primary,
    '--projectile-secondary': theme.secondary,
    '--projectile-glow': theme.glow,
    '--projectile-scale': projectileScale,
    '--projectile-start-scale': projectileScale * 0.38,
    '--projectile-burst-scale': projectileScale * 1.3,
    '--projectile-end-scale': projectileScale * 0.42
  } as CSSProperties;

  return (
    <div
      className={`combat-effect ${kind} ${source.team} spell-shape-${theme.shape} projectile-tier-${source.tier}`}
      style={style}
      data-projectile-class={source.pf2Class}
      data-projectile-rank={source.tier}
      data-spell-shape={theme.shape}
    >
      <i className="combat-target-marker" />
      {kind === 'melee' ? <i className="combat-melee-slash" /> : <i className="combat-effect-trail" />}
      {kind === 'ranged' && (
        <>
          <i className="combat-projectile ranged-projectile" />
          <i className="combat-impact-spark spark-one" />
          <i className="combat-impact-spark spark-two" />
          <i className="combat-impact-spark spark-three" />
        </>
      )}
      {kind === 'magic' && [0, 1, 2].map(particle => (
        <i
          key={particle}
          className="combat-projectile magic-projectile"
          style={{
            '--particle-offset': `${(particle - 1) * 9}px`,
            '--particle-delay': `${particle * 70}ms`
          } as CSSProperties}
        />
      ))}
    </div>
  );
}

function CombatPiece({
  unit,
  target,
  onHoverUnit,
  onMoveTooltip,
  onLeaveTooltip
}: {
  unit: CombatFrameUnit;
  target?: CombatFrameUnit;
  onHoverUnit: (unit: CombatFrameUnit, event: MouseEvent<HTMLElement>) => void;
  onMoveTooltip: (event: MouseEvent<HTMLElement>) => void;
  onLeaveTooltip: () => void;
}) {
  const position = {
    ...combatGridToStyle(unit.q, unit.r),
    ...getMeleeNudgeStyle(unit, target)
  };
  const hpPercent = Math.max(0, Math.round((unit.hp / unit.maxHp) * 100));
  const actionClass = unit.visualAction ? `${unit.visualAction.kind}-action` : '';
  const effects = unit.effects.map(effect => ({ effect, ...combatEffectDetails[effect] }));
  const hasBuff = effects.some(effect => effect.tone === 'buff');
  const hasDebuff = effects.some(effect => effect.tone === 'debuff');
  return (
    <article
      className={`combat-piece ${unit.team} ${unit.alive ? '' : 'defeated'} ${unit.attacking ? 'attacking' : ''} ${unit.casting ? 'casting' : ''} ${actionClass} ${unit.status === 'fleeing' ? 'fleeing' : ''} ${hasBuff ? 'has-buff' : ''} ${hasDebuff ? 'has-debuff' : ''}`}
      style={position}
      onMouseEnter={(event) => onHoverUnit(unit, event)}
      onMouseMove={onMoveTooltip}
      onMouseLeave={onLeaveTooltip}
    >
      <div className="piece-token">
        <span className="piece-tier">T{unit.tier}</span>
        <strong>{getClassAbbreviation(unit.pf2Class)}</strong>
        <div className="piece-hp-track">
          <i style={{ width: `${hpPercent}%` }} />
        </div>
      </div>
      {effects.length > 0 && (
        <div className="piece-effect-stack" aria-label={effects.map(effect => effect.label).join(', ')}>
          {effects.map(effect => (
            <span
              key={effect.effect}
              className={`piece-effect ${effect.tone}`}
              title={effect.label}
              aria-label={effect.label}
            >
              {effect.shortLabel}
            </span>
          ))}
        </div>
      )}
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
  unit: UnitDefinition | OwnedUnit | null;
  isDeployed: boolean;
  combineCopies: number;
  onRecall: (unitId: string) => void;
  onCombine: () => void;
  onSell: (unitId: string) => void;
  activeSynergies: ActiveSynergy[];
}) {
  if (!unit) {
    return (
      <section className="unit-detail-panel empty">
        <p className="hellknight-kicker">Unit Dossier</p>
        <h2>Select a unit to inspect its full breakdown.</h2>
      </section>
    );
  }

  const isOwned = 'instanceId' in unit;
  const itemDetails = isOwned ? unit.items.map(getItem) : [];
  const refund = isOwned ? getUnitSellValue(unit) : 0;
  const rarity = getUnitRarity(unit);
  const effectiveStats = getEffectiveUnitStats(unit, activeSynergies, isDeployed);
  const balanceMetrics = calculateUnitBalanceMetrics({
    ...unit,
    health: effectiveStats.health,
    attackDamage: effectiveStats.attackDamage,
    magicDamage: effectiveStats.magicDamage,
    attackSpeed: effectiveStats.attackSpeed,
    range: effectiveStats.range,
    spellSlots: effectiveStats.spellSlots
  });
  const spells = getUnitSpells(unit);

  return (
    <section className="unit-detail-panel">
      <div className="unit-detail-heading">
        <div>
          <p className="hellknight-kicker">Unit Dossier</p>
          <h2>{unit.name}</h2>
          <span>{unit.pf2Class} / {unit.role} / Tier {'tier' in unit ? unit.tier : 1} / Rarity {rarity} / {getUnitPrice(unit)}g</span>
        </div>
        <div className="unit-trait-row">
          {unit.traits.map(trait => <span key={trait}>{trait}</span>)}
          {isOwned && isDeployed && (
            <button type="button" className="unit-command-button" onClick={() => onRecall(unit.instanceId)}>
              Recall
            </button>
          )}
          {isOwned && (
            <>
              <button type="button" className="unit-command-button" onClick={onCombine} disabled={unit.tier >= 3 || combineCopies < 3}>
                Combine {combineCopies}/3
              </button>
              <button type="button" className="sell-unit-button" onClick={() => onSell(unit.instanceId)}>
                Sell {refund}g
              </button>
            </>
          )}
        </div>
      </div>

      <div className="unit-stat-grid">
        <StatPill label="Health" value={`${effectiveStats.health}`} />
        <StatPill label="Attack" value={`${effectiveStats.attackDamage}`} />
        <StatPill label="Magic" value={`${effectiveStats.magicDamage}`} />
        <StatPill label="Speed" value={effectiveStats.attackSpeed} />
        <StatPill label="Range" value={`${effectiveStats.range}`} />
        <StatPill label="Slots" value={`${effectiveStats.spellSlots}`} />
        <StatPill label="Est. DPS" value={`${balanceMetrics.rangeAdjustedDps}`} />
        <StatPill label="Effective HP" value={`${balanceMetrics.effectiveHealth}`} />
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
        <div>
          <h3>Edict Effects</h3>
          {effectiveStats.edictNotes.length === 0 ? (
            <p>No active edict stat changes.</p>
          ) : (
            <ul>
              {effectiveStats.edictNotes.map(note => <li key={note}>{note}</li>)}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}

function ItemDetailPanel({ item }: { item: ItemDefinition }) {
  return (
    <section className="unit-detail-panel item-detail-panel">
      <div className="unit-detail-heading">
        <div>
          <p className="hellknight-kicker">Item Dossier</p>
          <h2>{item.name}</h2>
          <span>{item.sourceType} / {item.cost} gold</span>
        </div>
      </div>
      <div className="unit-detail-columns">
        <div>
          <h3>Stat Bonus</h3>
          <strong>{item.stat}</strong>
        </div>
        <div>
          <h3>Combat Effect</h3>
          <p>{item.effect}</p>
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
    const itemNames = target.unit.items.map(itemId => getItem(itemId).name);
    const effectNames = target.unit.effects.map(effect => combatEffectDetails[effect].label);
    return (
      <aside className="unit-tooltip floating-unit-tooltip" style={style} role="tooltip">
        <strong>{target.unit.name}</strong>
        <span>{target.unit.pf2Class} / {target.unit.team}</span>
        <span>HP {target.unit.hp}/{target.unit.maxHp}</span>
        <span>Range {target.unit.range} / Tier {target.unit.tier}</span>
        {itemNames.length > 0 && <span>Items: {itemNames.join(' / ')}</span>}
        {effectNames.length > 0 && <span>Effects: {effectNames.join(' / ')}</span>}
        <span>{target.unit.status === 'fleeing' ? 'Fleeing' : target.unit.alive ? 'Fighting' : 'Defeated'}</span>
      </aside>
    );
  }

  const itemNames = 'items' in target.unit ? target.unit.items.map(itemId => getItem(itemId).name) : [];
  const tooltipBalance = calculateUnitBalanceMetrics({
    ...target.unit,
    health: target.stats.health,
    attackDamage: target.stats.attackDamage,
    magicDamage: target.stats.magicDamage,
    attackSpeed: target.stats.attackSpeed,
    range: target.stats.range,
    spellSlots: target.stats.spellSlots
  });

  return (
    <aside className="unit-tooltip floating-unit-tooltip" style={style} role="tooltip">
      <strong>{target.unit.name}</strong>
      <span>{target.unit.pf2Class} / {target.unit.role}</span>
      <span>HP {target.stats.health} / AD {target.stats.attackDamage} / MD {target.stats.magicDamage}</span>
      <span>AS {target.stats.attackSpeed} / Range {target.stats.range} / Slots {target.stats.spellSlots}</span>
      <span>Est. DPS {tooltipBalance.rangeAdjustedDps} / Effective HP {tooltipBalance.effectiveHealth}</span>
      {itemNames.length > 0 && <span>Items: {itemNames.join(' / ')}</span>}
      {target.stats.edictNotes.length > 0 && <span>{target.stats.edictNotes.join(' / ')}</span>}
      <span>{target.unit.traits.join(' - ')}</span>
    </aside>
  );
}

function LobbyPanel({ players, onTick, onStart }: { players: LobbyPlayerRecord[]; onTick: () => void; onStart: () => void }) {
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
  onInspect,
  onBuy,
  onRefresh,
  onHoverUnit,
  onMoveTooltip,
  onLeaveTooltip
}: {
  shop: ShopOffer[];
  gold: number;
  onInspect: (unit: UnitDefinition) => void;
  onBuy: (offer: ShopOffer) => void;
  onRefresh: () => void;
  onHoverUnit: (unit: UnitDefinition, event: MouseEvent<HTMLElement>) => void;
  onMoveTooltip: (event: MouseEvent<HTMLElement>) => void;
  onLeaveTooltip: () => void;
}) {
  const rerollCost = getShopRerollCost(shop);

  return (
    <section className="side-section">
      <header>
        <h2><ShoppingBag className="h-4 w-4" /> Roster</h2>
        <button type="button" onClick={onRefresh} disabled={gold < rerollCost}>
          <RefreshCw className="h-4 w-4" /> {rerollCost}g
        </button>
      </header>
      <div className="shop-list">
        {shop.length === 0 ? <p>The available unit pool is empty.</p> : shop.map(offer => {
          const balance = calculateUnitBalanceMetrics(offer.unit);
          return (
          <article key={offer.offerId} className={`shop-card rarity-${offer.rarity}`}>
            <button
              type="button"
              className="shop-inspect"
              onMouseEnter={(event) => onHoverUnit(offer.unit, event)}
              onMouseMove={onMoveTooltip}
              onMouseLeave={onLeaveTooltip}
              onClick={() => onInspect(offer.unit)}
            >
              <span className="cost">{offer.unit.cost}g</span>
              <strong>{offer.unit.name}</strong>
              <span>{offer.unit.pf2Class} / {offer.unit.role}</span>
              <small>Rarity {offer.rarity} / {offer.unit.traits.join(' - ')}</small>
              <small className="shop-balance">DPS {balance.rangeAdjustedDps} / EHP {balance.effectiveHealth}</small>
            </button>
            <button type="button" className="shop-buy" onClick={() => onBuy(offer)} disabled={gold < offer.unit.cost}>
              Recruit
            </button>
          </article>
          );
        })}
      </div>
    </section>
  );
}

function ItemShopPanel({
  itemShop,
  gold,
  onInspect,
  onBuy,
  onContinue
}: {
  itemShop: ItemDefinition[];
  gold: number;
  onInspect: (item: ItemDefinition) => void;
  onBuy: (item: ItemDefinition) => void;
  onContinue: () => void;
}) {
  return (
    <section className="side-section">
      <header>
        <h2><Package className="h-4 w-4" /> Armory</h2>
        <button type="button" onClick={onContinue}>Close</button>
      </header>
      <div className="shop-list">
        {itemShop.map(item => (
          <article key={item.id} className="shop-card item-card">
            <button type="button" className="shop-inspect" onClick={() => onInspect(item)}>
              <span className="cost">{item.cost}g</span>
              <strong>{item.name}</strong>
              <span>{item.sourceType}</span>
              <small>{item.stat}</small>
            </button>
            <button type="button" className="shop-buy" onClick={() => onBuy(item)} disabled={gold < item.cost}>
              Purchase
            </button>
          </article>
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
  onHoverUnit,
  onMoveTooltip,
  onLeaveTooltip
}: {
  unit: OwnedUnit;
  selected: boolean;
  onSelect: () => void;
  onDragStart: (event: DragEvent<HTMLButtonElement>) => void;
  onDragEnd: () => void;
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

function SynergyPanel({ activeSynergies, armyPower }: { activeSynergies: ActiveSynergy[]; armyPower: number }) {
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

function StandingsPanel({ participants }: { participants: MatchParticipant[] }) {
  const ordered = [...participants].sort((left, right) =>
    Number(left.eliminated) - Number(right.eliminated)
    || right.health - left.health
    || left.name.localeCompare(right.name)
  );
  return (
    <section className="side-section standings-panel">
      <header>
        <h2><Shield className="h-4 w-4" /> Standings</h2>
        <span>{ordered.filter(participant => !participant.eliminated).length} active</span>
      </header>
      <div className="standings-list">
        {ordered.map(participant => (
          <article
            key={participant.id}
            className={`${participant.isLocalPlayer ? 'local' : ''} ${participant.eliminated ? 'eliminated' : ''}`}
          >
            <strong>{participant.name}</strong>
            <span>{participant.eliminated ? 'Eliminated' : `${participant.health} HP · Lv ${participant.level}`}</span>
            <small>{participant.eliminated ? 'Out of the match' : `${participant.gold}g · ${participant.ready ? 'Ready' : 'Planning'}`}</small>
          </article>
        ))}
      </div>
    </section>
  );
}

function formatNpcOutcome(outcome: BattleOutcome, participants: MatchParticipant[]) {
  const winner = outcome.winnerId ? participants.find(participant => participant.id === outcome.winnerId) : null;
  const loser = outcome.loserId ? participants.find(participant => participant.id === outcome.loserId) : null;
  const elimination = loser?.eliminated ? ' and is eliminated' : '';

  if (winner && loser) return `${winner.name} defeats ${loser.name}; ${loser.name} takes ${outcome.damage} damage${elimination}.`;
  if (winner) return `${winner.name} defeats a Citadel Echo.`;
  if (loser) return `A Citadel Echo defeats ${loser.name}; ${loser.name} takes ${outcome.damage} damage${elimination}.`;
  return 'A paired battle ends in a draw.';
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

function combatGridToStyle(q: number, r: number): CSSProperties {
  const column = Math.max(0, Math.min(8, q + 4));
  const row = Math.max(0, Math.min(8, r + 5));
  return {
    '--combat-column': column,
    '--combat-row': row
  } as CSSProperties;
}

function getMeleeNudgeStyle(unit: CombatFrameUnit, target?: CombatFrameUnit): CSSProperties {
  if (unit.visualAction?.kind !== 'melee' || !target) return {};
  const deltaQ = target.q - unit.q;
  const deltaR = target.r - unit.r;
  const distance = Math.hypot(deltaQ, deltaR) || 1;
  return {
    '--melee-nudge-x': `${(deltaQ / distance) * 14}px`,
    '--melee-nudge-y': `${(deltaR / distance) * 14}px`,
    '--melee-return-x': `${(deltaQ / distance) * 10.5}px`,
    '--melee-return-y': `${(deltaR / distance) * 10.5}px`
  } as CSSProperties;
}

function getClassAbbreviation(className: string) {
  return className.slice(0, 3).toUpperCase();
}

function formatTime(timeMs: number) {
  return `${(timeMs / 1000).toFixed(1)}s`;
}

function getUnitSpells(unit: UnitDefinition) {
  const classAbilities: Record<string, string[]> = {
    Barbarian: ['Rage opening: bonus damage and temporary durability'],
    Champion: ['Champion Reaction: shield a wounded adjacent ally', 'Devotion aura: front-line mitigation'],
    Cleric: ['Divine Font: heal the lowest-health ally', 'Dedicated spell path: preserves slots when no ally needs healing'],
    Druid: ['Order Spell: temporary health surge', 'Dedicated spell path: no generic damage spell'],
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
    Wizard: ['More spell-slot allies: summon a tier-matched Zombie', 'More slotless allies: summon a tier-matched Elemental', 'Equal composition: Force Barrage hits every enemy at infinite range']
  };

  return classAbilities[unit.pf2Class] ?? [unit.featText];
}

function buildLobby(tick: number): LobbyPlayerRecord[] {
  const count = Math.min(maxPlayers, 1 + tick);
  return playerNames.slice(0, count).map((name, index) => ({
    id: `player-${index}`,
    name,
    isPlayer: index === 0,
    health: 100,
    streak: 0
  }));
}

function fillLobby(players: LobbyPlayerRecord[]) {
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

function buildItemShop(seed: number, round: number) {
  return Array.from({ length: 4 }, (_, index) => items[(seed + round * 3 + index * 5) % items.length]);
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

function calculateArmyPower(army: OwnedUnit[], activeSynergies: ActiveSynergy[]) {
  const unitPower = army.reduce((total, unit) => {
    const itemPower = unit.items.reduce((sum, itemId) => sum + getItem(itemId).cost * 18, 0);
    const effectiveStats = getEffectiveUnitStats(unit, activeSynergies, true);
    const spellPower = effectiveStats.spellSlots * effectiveStats.magicDamage * 0.6;
    return total + Math.round(effectiveStats.health * 0.26 + effectiveStats.attackDamage * attackSpeedToTier(effectiveStats.attackSpeed) * 4 + spellPower + itemPower);
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

function getEffectiveUnitStats(unit: UnitDefinition | OwnedUnit, activeSynergies: ActiveSynergy[], edictsApply: boolean): EffectiveUnitStats {
  const tierMultiplier = 'tier' in unit ? unit.tier === 1 ? 1 : unit.tier === 2 ? 1.85 : 3.2 : 1;
  const itemStats = getEquippedItemStats(unit);
  const edictNotes: string[] = [];
  let healthBonus = 0;
  let magicBonus = 0;
  let rangeBonus = 0;
  let spellSlotBonus = 0;

  if (edictsApply) {
    const vanguardTier = getUnitEdictTier(unit, activeSynergies, 'Vanguard');
    const signiferTier = getUnitEdictTier(unit, activeSynergies, 'Signifer');
    const gateTier = getUnitEdictTier(unit, activeSynergies, 'Gate');
    const pyreTier = getUnitEdictTier(unit, activeSynergies, 'Pyre');
    const artilleryTier = getUnitEdictTier(unit, activeSynergies, 'Artillery');
    const duelistTier = getUnitEdictTier(unit, activeSynergies, 'Duelist');

    if (vanguardTier > 0) {
      healthBonus += vanguardTier * 110;
      edictNotes.push(`Vanguard ${vanguardTier}: +${vanguardTier * 110} health${vanguardTier >= 3 ? ', +1 team capacity' : ''}`);
    }
    if (signiferTier > 0) {
      magicBonus += signiferTier * 14;
      spellSlotBonus += 1;
      edictNotes.push(`Signifer ${signiferTier}: +${signiferTier * 14} magic, +1 slot`);
    }
    if (gateTier > 0) {
      spellSlotBonus += gateTier;
      edictNotes.push(`Gate ${gateTier}: +${gateTier} spell slot${gateTier === 1 ? '' : 's'}`);
    }
    if (pyreTier > 0) {
      magicBonus += pyreTier * 8;
      edictNotes.push(`Pyre ${pyreTier}: +${pyreTier * 8} magic`);
    }
    if (artilleryTier > 0) {
      rangeBonus += 1;
      edictNotes.push(`Artillery ${artilleryTier}: +1 range`);
    }
    if (duelistTier > 0) {
      edictNotes.push(`Duelist ${duelistTier}: +${duelistTier} attack speed tier${duelistTier === 1 ? '' : 's'} while isolated (max fast)`);
    }
    addNonStatEdictNotes(unit, activeSynergies, edictNotes);
  }

  return {
    health: Math.round((unit.health + itemStats.health + healthBonus) * tierMultiplier),
    attackDamage: Math.round((unit.attackDamage + itemStats.attackDamage) * tierMultiplier),
    magicDamage: Math.round((unit.magicDamage + itemStats.magicDamage + magicBonus) * tierMultiplier),
    attackSpeed: attackSpeedFromTier(Math.min(3, attackSpeedToTier(unit.attackSpeed) + itemStats.attackSpeedTiers)),
    range: unit.range + rangeBonus,
    spellSlots: unit.spellSlots + itemStats.spellSlots + spellSlotBonus,
    edictNotes
  };
}

function getEquippedItemStats(unit: UnitDefinition | OwnedUnit) {
  const itemIds = 'items' in unit ? unit.items : [];
  return itemIds.reduce((stats, itemId) => {
    if (itemId === 'striking-rune') stats.attackDamage += 16;
    if (itemId === 'doubling-rings') stats.attackDamage += 14;
    if (itemId === 'flaming-rune') stats.magicDamage += 18;
    if (itemId === 'staff-fire') stats.magicDamage += 28;
    if (itemId === 'fear-gem') stats.magicDamage += 10;
    if (itemId === 'sturdy-shield') stats.health += 150;
    if (itemId === 'resilient-rune') stats.health += 120;
    if (itemId === 'elixir-life') stats.health += 80;
    if (itemId === 'wand-force-barrage') stats.spellSlots += 1;
    if (itemId === 'endless-grimoire') stats.spellSlots += 1;
    if (itemId === 'boots-bounding' || itemId === 'quicksilver-boots') stats.attackSpeedTiers += 1;
    if (itemId === 'greater-striking-rune') stats.attackDamage += 28;
    if (itemId === 'vitality-amulet') stats.health += 220;
    if (itemId === 'archmage-staff') stats.magicDamage += 42;
    if (itemId === 'scroll-reserve') stats.spellSlots += 2;
    if (itemId === 'battle-mantle') {
      stats.health += 100;
      stats.attackDamage += 10;
    }
    return stats;
  }, { attackDamage: 0, magicDamage: 0, health: 0, spellSlots: 0, attackSpeedTiers: 0 });
}

function attackSpeedToTier(speed: AttackSpeed) {
  return speed === 'slow' ? 1 : speed === 'medium' ? 2 : 3;
}

function attackSpeedFromTier(tier: number): AttackSpeed {
  return tier <= 1 ? 'slow' : tier === 2 ? 'medium' : 'fast';
}
function getUnitEdictTier(unit: UnitDefinition | OwnedUnit, activeSynergies: ActiveSynergy[], trait: UnitTrait) {
  if (!unit.traits.includes(trait)) return 0;
  return activeSynergies.find(synergy => synergy.trait === trait)?.tier ?? 0;
}

function addNonStatEdictNotes(unit: UnitDefinition | OwnedUnit, activeSynergies: ActiveSynergy[], notes: string[]) {
  const noteText: Partial<Record<UnitTrait, (tier: number) => string>> = {
    Rack: tier => `Rack ${tier}: ${tier * 12}% less spell damage`,
    Scourge: tier => `Scourge ${tier}: +${tier * 10}% damage to high-health enemies`,
    Nail: tier => `Nail ${tier}: faster pursuit`,
    Godclaw: tier => `Godclaw ${tier}: ${tier * 8}% less non-true damage`,
    Chain: tier => `Chain ${tier}: third attacks pin longer`,
    Torrent: tier => `Torrent ${tier}: periodic healing and cleansing`,
    Executioner: tier => `Executioner ${tier}: +${tier * 18}% damage to weakened enemies`,
    Mender: tier => `Mender ${tier}: periodic ally healing`
  };

  unit.traits.forEach(trait => {
    const tier = activeSynergies.find(synergy => synergy.trait === trait)?.tier ?? 0;
    const text = noteText[trait];
    if (tier > 0 && text) notes.push(text(tier));
  });
}
