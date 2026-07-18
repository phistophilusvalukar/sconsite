import { applyCommand, createGame, type CardDefinition, type CommandRecord } from "../src/index.js";

const definitions: CardDefinition[] = [
  { id: "soldier", name: "Dawn Guard", type: "Creature", cost: { Generic: 1 }, power: 3, health: 3 },
  { id: "spark", name: "Star Spark", type: "Spell", cost: { Generic: 1 }, target: "player", effects: [{ op: "damage", amount: 3 }] },
];
const deck = ["soldier", "spark", "soldier", "spark", "soldier", "spark"];
let state = createGame({ seed: 2025, definitions, players: [{ id: "ember", deck }, { id: "dawn", deck }], startingHand: 5, startingLife: 6 }).state;
const records: CommandRecord[] = [];
const run = (command: Parameters<typeof applyCommand>[1]): void => { const result = applyCommand(state, command); records.push({ command, events: result.events }); state = result.state; };
const find = (player: string, definition: string): string => Object.values(state.cards).find((c) => c.owner === player && c.definitionId === definition && c.zone === "hand")!.id;
run({ type: "COMMIT_AS_FONT", playerId: "ember", cardId: find("ember", "soldier") });
const font = state.players.ember!.zones.fontRow[0]!;
run({ type: "ACTIVATE_FONT", playerId: "ember", fontId: font, manaType: "Generic" });
run({ type: "PLAY_CARD", playerId: "ember", cardId: find("ember", "spark"), targets: ["dawn"] });
run({ type: "PASS_PRIORITY", playerId: "dawn" }); run({ type: "PASS_PRIORITY", playerId: "ember" });
run({ type: "CONCEDE", playerId: "dawn" });
console.log(JSON.stringify({ result: state.result, commands: records.length, finalEvent: records.at(-1)?.events.at(-1) }, null, 2));
