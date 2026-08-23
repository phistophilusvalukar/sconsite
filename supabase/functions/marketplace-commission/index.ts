import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';

const corsHeaders = { 'Access-Control-Allow-Origin': Deno.env.get('SITE_ORIGIN') ?? '*', 'Access-Control-Allow-Headers': 'authorization, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

Deno.serve(async request => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  const authorization = request.headers.get('Authorization');
  if (!authorization) return json({ error: 'Sign in required' }, 401);
  const client = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_ANON_KEY') ?? '', { global: { headers: { Authorization: authorization } } });
  const payload = await request.json();
  const { data, error } = await client.rpc('create_shop_commission_command', { p_commission: payload });
  if (error) return json({ error: error.message }, 400);
  const webhook = Deno.env.get('MARKETPLACE_DISCORD_WEBHOOK_URL');
  if (!webhook) return json({ error: 'Commission saved, but Discord delivery is not configured', commissionId: data.commissionId }, 503);
  const siteOrigin = Deno.env.get('SITE_ORIGIN') ?? '';
  const mention = /^\d{17,20}$/.test(data.ownerDiscordId ?? '') ? `<@${data.ownerDiscordId}>` : `**${data.shopTitle} owner**`;
  const discordResponse = await fetch(webhook, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
    content: `${mention} — a new ${data.shopKind} commission has arrived.`, allowed_mentions: { users: /^\d{17,20}$/.test(data.ownerDiscordId ?? '') ? [data.ownerDiscordId] : [] },
    embeds: [{ title: payload.itemName, url: payload.aonUrl, color: data.shopKind === 'ritual' ? 0x8b5cf6 : 0xd1cabf, fields: [
      { name: 'Requested by', value: data.requesterName, inline: true }, { name: 'Tier / quantity', value: `${payload.itemTier} / ${payload.quantity}`, inline: true },
      { name: 'Budget', value: payload.budget || 'Not specified', inline: true }, { name: 'Needed by', value: payload.deadline || 'No deadline', inline: true },
      { name: 'Details', value: String(payload.details).slice(0, 1024) }, ...(payload.needsSecondaryHelp ? [{ name: 'Secondary checks', value: 'Contributor help requested' }] : [])
    ], footer: { text: siteOrigin ? `Manage: ${siteOrigin}/marketplace` : 'SCON Marketplace' } }]
  }) });
  if (!discordResponse.ok) return json({ error: 'Commission saved, but Discord rejected the alert', commissionId: data.commissionId }, 502);
  return json({ commissionId: data.commissionId });
});
