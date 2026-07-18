import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { Server } from "colyseus";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { LocalJwtVerifier, createSupabaseJwtVerifier } from "./auth.js";
import { MatchRoom } from "./colyseus-room.js";
import { MemoryMatchPersistence } from "./persistence.js";
import { setRuntimeDependencies } from "./runtime.js";

export async function startServer():Promise<{port:number;shutdown:()=>Promise<void>}> {
  const port=Number(process.env.PORT??2567);
  const localAuth=process.env.MATCH_SERVER_LOCAL_AUTH==="true";
  const supabaseUrl=process.env.SUPABASE_URL;
  if(!localAuth&&!supabaseUrl) throw new Error("SUPABASE_URL is required unless MATCH_SERVER_LOCAL_AUTH=true");
  const verifier=localAuth?new LocalJwtVerifier():await createSupabaseJwtVerifier(supabaseUrl!);
  setRuntimeDependencies({verifier,persistence:new MemoryMatchPersistence(),reconnectSeconds:Number(process.env.RECONNECT_SECONDS??60)});
  const httpServer=createServer((request,response)=>{ if(request.url==="/healthz"){response.writeHead(200,{"content-type":"application/json"});response.end(JSON.stringify({ok:true}));return;} response.writeHead(404);response.end(); });
  const gameServer=new Server({transport:new WebSocketTransport({server:httpServer})});
  gameServer.define("match",MatchRoom);
  await gameServer.listen(port);
  const address=httpServer.address();
  const boundPort=typeof address==="object"&&address ? (address as AddressInfo).port : port;
  return {port:boundPort,shutdown:()=>gameServer.gracefullyShutdown(false)};
}
const entrypoint = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : undefined;
if(import.meta.url===entrypoint){ startServer().then(({port})=>console.log(`Match server listening on http://localhost:${port}`)).catch(error=>{console.error(error);process.exitCode=1;}); }
