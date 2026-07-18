import { describe, expect, it } from "vitest";
import { AuthoritativeMatch, MemoryMatchPersistence, type CanonicalState } from "../src/index.js";
const state: CanonicalState={players:{a:{playerId:"a",hand:[{instanceId:"a1",definitionId:"secret"}],deck:[]},b:{playerId:"b",hand:[{instanceId:"b1",definitionId:"hidden"}],deck:[]}}};
const envelope=(id:string,sequence=1,revision=0)=>({commandId:id,sequence,expectedRevision:revision,command:{type:"PASS"}});
describe("AuthoritativeMatch",()=>{
  it("redacts opponent identities",()=>{ const room=new AuthoritativeMatch("m",state,{apply:(s,_player,_command)=>({state:s,events:[]})},new MemoryMatchPersistence()); expect(room.join("a").players.b?.hand[0]).toEqual({instanceId:"b1"}); });
  it("persists once and rejects stale or out of order commands",async()=>{ const p=new MemoryMatchPersistence(); await p.createMatch({matchId:"m",rulesVersion:"1",randomSeed:"s"},{}); const room=new AuthoritativeMatch("m",state,{apply:(s,_player,_command)=>({state:s,events:[{type:"PASSED"}]})},p); room.join("a"); const id="00000000-0000-4000-8000-000000000001"; expect((await room.command("a",envelope(id))).ok).toBe(true); expect((await room.command("a",envelope(id))).ok).toBe(true); expect((await room.command("a",envelope("00000000-0000-4000-8000-000000000002",3,1))).ok).toBe(false); expect(await p.load("m")).toHaveLength(1); });
});
