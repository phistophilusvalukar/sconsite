import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';

type FoundryAccessEventRequest = {
  installationId: string;
  worldExternalId: string;
  eventId: string;
  occurredAt: string;
  sessionId: string;
  sceneExternalId: string;
  updates: Array<{
    lockInstanceId: string;
    foundryUserExternalId: string;
    foundryActorExternalId?: string;
    tokenExternalId?: string;
    canInteract: boolean;
    canReadInstructions: boolean;
    distanceToLock?: number;
    tokenElevation?: number;
    lockElevation?: number;
    metadata?: Record<string, unknown>;
  }>;
};

const corsHeaders = {
  'Access-Control-Allow-Origin': Deno.env.get('FOUNDRY_ALLOWED_ORIGIN') ?? 'https://localhost.invalid',
  'Access-Control-Allow-Headers': 'authorization, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const payload = await request.json() as FoundryAccessEventRequest;
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

  if (!worldLink) return json({ error: 'Unknown or revoked installation' }, 401);
  if (await sha256Hex(bearerSecret) !== worldLink.hashed_installation_secret) {
    return json({ error: 'Invalid installation secret' }, 401);
  }

  const { error: eventError } = await supabase
    .from('foundry_access_event_log')
    .insert({ world_link_id: worldLink.id, event_id: payload.eventId, payload });

  if (eventError?.code === '23505') return json({ duplicate: true, results: [] });
  if (eventError) return json({ error: eventError.message }, 400);

  const results = [];
  for (const update of payload.updates) {
    const { data: binding } = await supabase
      .from('foundry_lock_bindings')
      .select('id')
      .eq('world_link_id', worldLink.id)
      .eq('session_id', payload.sessionId)
      .eq('lock_instance_id', update.lockInstanceId)
      .eq('scene_external_id', payload.sceneExternalId)
      .maybeSingle();

    if (!binding) {
      results.push({ lockInstanceId: update.lockInstanceId, foundryUserExternalId: update.foundryUserExternalId, ok: false, error: 'unbound_lock' });
      continue;
    }

    const { data: userLink } = await supabase
      .from('foundry_user_links')
      .select('supabase_user_id')
      .eq('world_link_id', worldLink.id)
      .eq('foundry_user_external_id', update.foundryUserExternalId)
      .maybeSingle();

    if (!userLink) {
      results.push({ lockInstanceId: update.lockInstanceId, foundryUserExternalId: update.foundryUserExternalId, ok: false, error: 'unknown_user' });
      continue;
    }

    const { error } = await supabase
      .from('arcane_lock_player_access')
      .update({
        provider_type: 'foundry',
        provider_can_interact: update.canInteract,
        provider_can_read: update.canReadInstructions,
        provider_updated_at: payload.occurredAt,
        provider_metadata: {
          foundryActorExternalId: update.foundryActorExternalId,
          tokenExternalId: update.tokenExternalId,
          distanceToLock: update.distanceToLock,
          tokenElevation: update.tokenElevation,
          lockElevation: update.lockElevation,
          metadata: update.metadata ?? {}
        },
        updated_at: new Date().toISOString()
      })
      .eq('lock_id', update.lockInstanceId)
      .eq('user_id', userLink.supabase_user_id);

    results.push({
      lockInstanceId: update.lockInstanceId,
      foundryUserExternalId: update.foundryUserExternalId,
      ok: !error,
      error: error?.message
    });
  }

  return json({ duplicate: false, results });
});

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
