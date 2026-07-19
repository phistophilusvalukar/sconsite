import {createClient} from "npm:@supabase/supabase-js@2";

const headers={"content-type":"application/json","access-control-allow-origin":"*","access-control-allow-headers":"authorization, apikey, content-type"};
function response(body:unknown,status=200){return new Response(JSON.stringify(body),{status,headers});}
Deno.serve(async request=>{
  if(request.method==="OPTIONS")return new Response("ok",{headers});
  if(request.method!=="POST")return response({error:"method_not_allowed"},405);
  const authorization=request.headers.get("authorization");
  if(!authorization)return response({error:"authentication_required"},401);
  let body:Record<string,unknown>;try{body=await request.json();}catch{return response({error:"invalid_json"},400);}
  const url=Deno.env.get("SUPABASE_URL"),anon=Deno.env.get("SUPABASE_ANON_KEY");
  if(!url||!anon)return response({error:"server_configuration_error"},500);
  const client=createClient(url,anon,{global:{headers:{Authorization:authorization}},auth:{persistSession:false}});
  const {data,error}=await client.rpc("submit_match_command",{command_id:body.commandId,target_match_id:body.matchId,player_sequence:body.playerSequence,expected_revision:body.expectedRevision,command_payload:body.command});
  if(error){const safe=error.message.match(/rate_limited|stale_revision|out_of_order|invalid_command|not_match_participant/)?.[0]??"command_rejected";return response({commandId:body.commandId,status:"rejected",rejectionCode:safe},safe==="not_match_participant"?403:409);}
  return response(data,202);
});
