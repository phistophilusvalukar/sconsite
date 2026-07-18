import { afterEach, describe, expect, it } from "vitest";
import { Client } from "colyseus.js";
import { startServer } from "../src/server.js";

describe("Colyseus transport",()=>{
  let shutdown:(()=>Promise<void>)|undefined;
  afterEach(async()=>{await shutdown?.(); shutdown=undefined; delete process.env.MATCH_SERVER_LOCAL_AUTH; delete process.env.PORT;});
  it("authenticates two clients and transports an authoritative command",async()=>{
    process.env.MATCH_SERVER_LOCAL_AUTH="true"; process.env.PORT="0";
    const server=await startServer(); shutdown=server.shutdown;
    const aliceClient=new Client(`ws://127.0.0.1:${server.port}`); const bobClient=new Client(`ws://127.0.0.1:${server.port}`);
    const alice=await aliceClient.joinOrCreate("match",{accessToken:"local:alice"});
    const aliceReady=new Promise<void>(resolve=>alice.onMessage("ready",()=>resolve()));
    const bob=await bobClient.joinOrCreate("match",{accessToken:"local:bob"});
    await aliceReady;
    const result=new Promise<{ok:boolean;revision:number}>(resolve=>alice.onMessage("commandResult",resolve));
    alice.send("command",{commandId:"00000000-0000-4000-8000-000000000001",sequence:1,expectedRevision:0,command:{type:"PASS_PRIORITY"}});
    await expect(result).resolves.toMatchObject({ok:true,revision:1});
    await Promise.all([alice.leave(),bob.leave()]);
  });
});
