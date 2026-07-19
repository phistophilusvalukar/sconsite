import { z } from "zod";
import type { Json } from "./types.js";

const uuid=z.string().uuid();
export const commandSubmissionSchema=z.object({matchId:uuid,commandId:uuid,playerSequence:z.number().int().positive(),expectedRevision:z.number().int().nonnegative(),command:z.object({type:z.string().min(1).max(64)}).passthrough()}).strict();
export type CommandSubmission=z.infer<typeof commandSubmissionSchema>;
export interface MatchSnapshotMessage {matchId:string;revision:number;snapshot:Json}
export interface MatchEventMessage {matchId:string;sequence:number;commandId:string;events:Json}
export interface CommandReceipt {commandId:string;status:"pending"|"accepted"|"rejected";rejectionCode?:string|undefined}
export interface TransportHandlers {onSnapshot(message:MatchSnapshotMessage):void;onEvents(message:MatchEventMessage):void;onPresence?(onlinePlayerIds:readonly string[]):void;onStatus?(status:"connected"|"reconnecting"|"closed"|"error"):void}

interface ChannelLike {
  on(kind:"postgres_changes",filter:Record<string,string>,callback:(payload:{new:Record<string,unknown>})=>void):ChannelLike;
  on(kind:"presence",filter:{event:"sync"},callback:()=>void):ChannelLike;
  subscribe(callback?:(status:string)=>void):ChannelLike;
  track(value:{playerId:string}):Promise<unknown>;
  presenceState():Record<string,readonly {playerId?:string}[]>;
}
export interface RealtimeClientLike {
  channel(topic:string,options?:{config:{presence:{key:string};private:boolean}}):ChannelLike;
  removeChannel(channel:ChannelLike):Promise<unknown>;
  functions:{invoke(name:string,options:{body:unknown}):Promise<{data:unknown;error:{message:string}|null}>};
}

export class SupabaseMatchTransport {
  private channel:ChannelLike|undefined;
  constructor(private readonly client:RealtimeClientLike,private readonly matchId:string,private readonly playerId:string) { uuid.parse(matchId); uuid.parse(playerId); }
  async connect(handlers:TransportHandlers):Promise<void>{
    if(this.channel) return;
    const channel=this.client.channel(`match:${this.matchId}`,{config:{presence:{key:this.playerId},private:true}});
    channel.on("postgres_changes",{event:"INSERT",schema:"public",table:"match_event_logs",filter:`match_id=eq.${this.matchId}`},payload=>{
      const row=payload.new; handlers.onEvents({matchId:String(row.match_id),sequence:Number(row.sequence),commandId:String(row.command_id),events:row.events as Json});
    });
    channel.on("postgres_changes",{event:"INSERT",schema:"public",table:"match_snapshots",filter:`match_id=eq.${this.matchId}`},payload=>{
      const row=payload.new;if(row.player_id===this.playerId) handlers.onSnapshot({matchId:String(row.match_id),revision:Number(row.revision),snapshot:row.snapshot as Json});
    });
    channel.on("presence",{event:"sync"},()=>handlers.onPresence?.(Object.values(channel.presenceState()).flat().map(value=>value.playerId).filter((id):id is string=>typeof id==="string")));
    channel.subscribe(status=>{if(status==="SUBSCRIBED"){handlers.onStatus?.("connected");void channel.track({playerId:this.playerId});}else if(status==="CHANNEL_ERROR")handlers.onStatus?.("error");else if(status==="CLOSED")handlers.onStatus?.("closed");else if(status==="TIMED_OUT")handlers.onStatus?.("reconnecting");});
    this.channel=channel;
  }
  async submit(input:CommandSubmission):Promise<CommandReceipt>{
    const command=commandSubmissionSchema.parse(input);if(command.matchId!==this.matchId)throw new Error("Command match does not equal connected match");
    const {data,error}=await this.client.functions.invoke("match-command",{body:command});if(error)throw new Error(error.message);
    return z.object({commandId:uuid,status:z.enum(["pending","accepted","rejected"]),rejectionCode:z.string().optional()}).parse(data);
  }
  async disconnect():Promise<void>{const channel=this.channel;this.channel=undefined;if(channel)await this.client.removeChannel(channel);}
}
