import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': Deno.env.get('FOUNDRY_ALLOWED_ORIGIN') ?? 'https://localhost.invalid',
  'Access-Control-Allow-Headers': 'authorization, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const payload = await request.json() as {
    installationId: string;
    worldExternalId: string;
    heartbeatId: string;
    occurredAt: string;
    worldName?: string;
  };
  const bearerSecret = readBearerSecret(request);
  if (!bearerSecret) return json({ error: 'Missing installation secret' }, 401);

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  );

  const { data: worldLink } = await supabase
    .from('foundry_world_links')
    .select('*')
    .eq('installation_id', payload.installationId)
    .eq('world_external_id', payload.worldExternalId)
    .eq('status', 'active')
    .maybeSingle();

  if (!worldLink || await sha256Hex(bearerSecret) !== worldLink.hashed_installation_secret) {
    return json({ error: 'Unknown installation or invalid installation secret' }, 401);
  }

  const lastSeenAt = payload.occurredAt || new Date().toISOString();
  const { error } = await supabase
    .from('foundry_world_links')
    .update({ last_seen_at: lastSeenAt, world_name: payload.worldName ?? worldLink.world_name })
    .eq('id', worldLink.id);

  if (error) return json({ error: error.message }, 400);
  return json({
    ok: true,
    status: interpretHeartbeat(lastSeenAt),
    connectedThresholdSeconds: Number(Deno.env.get('FOUNDRY_CONNECTED_SECONDS') ?? 30),
    delayedThresholdSeconds: Number(Deno.env.get('FOUNDRY_DELAYED_SECONDS') ?? 90)
  });
});

function interpretHeartbeat(lastSeenAt: string) {
  const connected = Number(Deno.env.get('FOUNDRY_CONNECTED_SECONDS') ?? 30);
  const delayed = Number(Deno.env.get('FOUNDRY_DELAYED_SECONDS') ?? 90);
  const ageSeconds = (Date.now() - new Date(lastSeenAt).getTime()) / 1000;
  if (ageSeconds <= connected) return 'connected';
  if (ageSeconds <= delayed) return 'delayed';
  return 'disconnected';
}

function readBearerSecret(request: Request) {
  const authorization = request.headers.get('authorization') ?? '';
  return authorization.startsWith('Bearer ') ? authorization.slice('Bearer '.length).trim() : '';
}

async function sha256Hex(value: string) {
  const bytes = new TextEncoder().encode(value);
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(hash)).map(byte => byte.toString(16).padStart(2, '0')).join('');
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  });
}
