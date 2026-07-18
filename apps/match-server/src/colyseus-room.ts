import { Room, type Client } from "colyseus";
import { AuthoritativeMatch, type RulesAdapter } from "./authoritative-room.js";
import type { VerifiedIdentity } from "./auth.js";
import { getRuntimeDependencies } from "./runtime.js";
import type { CanonicalState } from "./private-view.js";

type AuthOptions={accessToken?:unknown};
const passRules:RulesAdapter={apply:(state,playerId,command)=>({state,events:[{type:"COMMAND_ACCEPTED",playerId,commandType:command.type}]})};

export class MatchRoom extends Room {
  maxClients=2;
  private authority?:AuthoritativeMatch;
  private readonly identities=new Map<string,VerifiedIdentity>();
  async onAuth(_client:Client,options:AuthOptions):Promise<VerifiedIdentity> {
    if(typeof options.accessToken!=="string") throw new Error("accessToken is required");
    return getRuntimeDependencies().verifier.verify(options.accessToken);
  }
  async onCreate():Promise<void> {
    this.autoDispose=true;
    this.onMessage("command",async(client,payload)=>{
      const identity=this.identities.get(client.sessionId);
      if(!identity||!this.authority){ client.send("commandResult",{ok:false,code:"UNAUTHENTICATED",message:"Match is waiting for two authenticated players",revision:0}); return; }
      const result=await this.authority.command(identity.userId,payload);
      client.send("commandResult",result);
      if(result.ok) for(const peer of this.clients){ const peerIdentity=this.identities.get(peer.sessionId); if(peerIdentity) peer.send("snapshot",this.authority.view(peerIdentity.userId)); }
    });
  }
  async onJoin(client:Client,_options:unknown,auth:VerifiedIdentity):Promise<void> {
    if([...this.identities.values()].some(value=>value.userId===auth.userId)) throw new Error("Player is already connected");
    this.identities.set(client.sessionId,auth);
    if(this.identities.size===2){
      const players=Object.fromEntries([...this.identities.values()].map(identity=>[identity.userId,{playerId:identity.userId,hand:[],deck:[]}])) as CanonicalState["players"];
      const persistence=getRuntimeDependencies().persistence;
      await persistence.createMatch({matchId:this.roomId,rulesVersion:"transport-v1",randomSeed:this.roomId},{});
      this.authority=new AuthoritativeMatch(this.roomId,{players},passRules,persistence,getRuntimeDependencies().reconnectSeconds*1000);
      for(const peer of this.clients){ const peerIdentity=this.identities.get(peer.sessionId); if(peerIdentity){ this.authority.join(peerIdentity.userId); peer.send("ready",{matchId:this.roomId,playerId:peerIdentity.userId}); peer.send("snapshot",this.authority.view(peerIdentity.userId)); } }
    } else client.send("waiting",{players:1});
  }
  async onLeave(client:Client,consented:boolean):Promise<void> {
    const identity=this.identities.get(client.sessionId); if(!identity)return;
    this.authority?.disconnect(identity.userId);
    if(consented){this.identities.delete(client.sessionId);return;}
    try { await this.allowReconnection(client,getRuntimeDependencies().reconnectSeconds); }
    catch { this.identities.delete(client.sessionId); }
  }
}
