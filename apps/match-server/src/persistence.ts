export interface MatchEventRecord { readonly matchId: string; readonly sequence: number; readonly commandId: string; readonly playerId: string; readonly command: unknown; readonly events: readonly unknown[]; readonly stateHash?: string; readonly createdAt: string }
export interface MatchSummary { readonly matchId: string; readonly rulesVersion: string; readonly randomSeed: string; readonly winnerId?: string; readonly endedAt?: string }
export interface MatchPersistence {
  createMatch(summary: MatchSummary, deckSnapshots: Readonly<Record<string, unknown>>): Promise<void>;
  append(record: MatchEventRecord): Promise<void>;
  finish(summary: MatchSummary): Promise<void>;
  load(matchId: string): Promise<readonly MatchEventRecord[]>;
}

export class MemoryMatchPersistence implements MatchPersistence {
  readonly logs = new Map<string, MatchEventRecord[]>();
  async createMatch(summary: MatchSummary, deckSnapshots: Readonly<Record<string, unknown>>): Promise<void> { void deckSnapshots; if (this.logs.has(summary.matchId)) throw new Error("Match already exists"); this.logs.set(summary.matchId, []); }
  async append(record: MatchEventRecord): Promise<void> { const log=this.logs.get(record.matchId); if (!log) throw new Error("Unknown match"); if (log.some(x=>x.sequence===record.sequence||x.commandId===record.commandId)) return; log.push(record); }
  async finish(): Promise<void> {}
  async load(matchId: string): Promise<readonly MatchEventRecord[]> { return [...(this.logs.get(matchId) ?? [])].sort((a,b)=>a.sequence-b.sequence); }
}
