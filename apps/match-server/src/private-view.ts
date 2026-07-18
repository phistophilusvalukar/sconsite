export interface HiddenCard { readonly instanceId: string; readonly definitionId?: string; readonly version?: number }
export interface PlayerState { readonly playerId: string; readonly hand: readonly HiddenCard[]; readonly deck: readonly HiddenCard[]; readonly [key: string]: unknown }
export interface CanonicalState { readonly players: Readonly<Record<string, PlayerState>>; readonly [key: string]: unknown }

export function playerView(state: CanonicalState, viewerId: string): CanonicalState {
  const players = Object.fromEntries(Object.entries(state.players).map(([id, player]) => {
    if (id === viewerId) return [id, player];
    return [id, { ...player, hand: player.hand.map(card => ({ instanceId: card.instanceId })), deck: player.deck.map(card => ({ instanceId: card.instanceId })) }];
  }));
  return { ...state, players };
}
