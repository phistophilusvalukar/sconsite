import { applyCommand, createGame, type CreateGameOptions } from "./engine.js";
import { RulesError, type GameState, type Replay } from "./types.js";

export function replayMatch(replay: Replay, definitions: CreateGameOptions["definitions"]): GameState {
  const created = createGame({ seed: replay.seed, players: replay.players, startingLife: replay.startingLife, startingHand: replay.startingHand ?? 5, definitions });
  let state = created.state;
  for (const record of replay.commands) {
    const transition = applyCommand(state, record.command);
    if (JSON.stringify(transition.events) !== JSON.stringify(record.events)) throw new RulesError("REPLAY_DIVERGED", `Replay diverged at ${record.command.type}`);
    state = transition.state;
  }
  return state;
}
