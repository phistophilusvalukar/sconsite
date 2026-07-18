import { parsePayload, ProtocolError, type CommandEnvelope, type CommandReply } from "./protocol.js";
import { TokenBucket } from "./rate-limit.js";
import { playerView, type CanonicalState } from "./private-view.js";
import type { MatchPersistence } from "./persistence.js";

export interface RulesAdapter { apply(state: CanonicalState, playerId: string, command: CommandEnvelope["command"]): { state: CanonicalState; events: readonly unknown[] } }
interface Session { nextSequence: number; seen: Map<string, CommandReply>; limiter: TokenBucket; disconnectedAt?: number }

export class AuthoritativeMatch {
  private revision = 0;
  private readonly sessions = new Map<string, Session>();
  constructor(readonly matchId: string, private state: CanonicalState, private readonly rules: RulesAdapter, private readonly persistence: MatchPersistence, private readonly reconnectMs = 60_000) {}
  join(playerId: string): CanonicalState { if (!this.state.players[playerId]) throw new Error("Player is not in match"); const session=this.sessions.get(playerId); if (session?.disconnectedAt && Date.now()-session.disconnectedAt>this.reconnectMs) throw new Error("Reconnect window expired"); if (session) delete session.disconnectedAt; else this.sessions.set(playerId,{nextSequence:1,seen:new Map(),limiter:new TokenBucket()}); return playerView(this.state,playerId); }
  disconnect(playerId: string): void { const s=this.sessions.get(playerId); if (s) s.disconnectedAt=Date.now(); }
  view(playerId: string): CanonicalState { return playerView(this.state, playerId); }
  async command(playerId: string, raw: unknown, now=Date.now()): Promise<CommandReply> {
    const session=this.sessions.get(playerId); if (!session) return {ok:false,code:"UNAUTHENTICATED",message:"Join before sending commands",revision:this.revision};
    let envelope: CommandEnvelope;
    try { envelope=parsePayload(raw); } catch(error) { const e=error as ProtocolError; return {ok:false,code:e.code,message:e.message,revision:this.revision}; }
    const prior=session.seen.get(envelope.commandId); if (prior) return prior.ok ? prior : {ok:false,commandId:envelope.commandId,code:"DUPLICATE",message:"Command was already rejected",revision:this.revision};
    if (!session.limiter.take(now)) return {ok:false,commandId:envelope.commandId,code:"RATE_LIMITED",message:"Too many commands",revision:this.revision};
    if (envelope.sequence!==session.nextSequence) return {ok:false,commandId:envelope.commandId,code:"OUT_OF_ORDER",message:`Expected sequence ${session.nextSequence}`,revision:this.revision};
    if (envelope.expectedRevision!==this.revision) return {ok:false,commandId:envelope.commandId,code:"STALE",message:"Snapshot revision is stale",revision:this.revision};
    try {
      const result=this.rules.apply(this.state,playerId,envelope.command); const nextRevision=this.revision+1;
      await this.persistence.append({matchId:this.matchId,sequence:nextRevision,commandId:envelope.commandId,playerId,command:envelope.command,events:result.events,createdAt:new Date(now).toISOString()});
      this.state=result.state; this.revision=nextRevision; session.nextSequence+=1;
      const reply: CommandReply={ok:true,commandId:envelope.commandId,revision:this.revision,events:result.events}; session.seen.set(envelope.commandId,reply); return reply;
    } catch { const reply: CommandReply={ok:false,commandId:envelope.commandId,code:"ILLEGAL",message:"Command is not legal",revision:this.revision}; session.seen.set(envelope.commandId,reply); return reply; }
  }
}
