#!/usr/bin/env node

const endpoint = process.env.FOUNDRY_ACCESS_ENDPOINT;
const installationSecret = process.env.FOUNDRY_INSTALLATION_SECRET;

if (!endpoint || !installationSecret) {
  console.error('Set FOUNDRY_ACCESS_ENDPOINT and FOUNDRY_INSTALLATION_SECRET.');
  process.exit(1);
}

const payload = {
  installationId: process.env.FOUNDRY_INSTALLATION_ID,
  worldExternalId: process.env.FOUNDRY_WORLD_EXTERNAL_ID,
  eventId: process.env.FOUNDRY_EVENT_ID ?? crypto.randomUUID(),
  occurredAt: new Date().toISOString(),
  sessionId: process.env.ARCANE_SESSION_ID,
  sceneExternalId: process.env.FOUNDRY_SCENE_EXTERNAL_ID,
  updates: [
    {
      lockInstanceId: process.env.ARCANE_LOCK_ID,
      foundryUserExternalId: process.env.FOUNDRY_USER_EXTERNAL_ID,
      foundryActorExternalId: process.env.FOUNDRY_ACTOR_EXTERNAL_ID,
      canInteract: process.env.CAN_INTERACT !== 'false',
      canReadInstructions: process.env.CAN_READ !== 'false',
      distanceToLock: Number(process.env.DISTANCE_TO_LOCK ?? 5),
      metadata: { simulator: true }
    }
  ]
};

const response = await fetch(endpoint, {
  method: 'POST',
  headers: {
    'content-type': 'application/json',
    authorization: `Bearer ${installationSecret}`
  },
  body: JSON.stringify(payload)
});

console.log(JSON.stringify(await response.json(), null, 2));
process.exit(response.ok ? 0 : 1);
