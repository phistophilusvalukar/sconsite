import type { Json, MatchEventRow, MatchRow } from "./types.js";
export interface EventLogRepository { append(row: Omit<MatchEventRow,"id"|"created_at">):Promise<void>; list(matchId:string):Promise<readonly MatchEventRow[]> }
export interface MatchRepository { create(row: Omit<MatchRow,"id"|"created_at"> & {id?:string}):Promise<string>; finish(matchId:string,winnerId:string|undefined,finalSnapshot:Json):Promise<void> }
export interface DeckSnapshotRepository { loadValidated(ownerId:string,deckId:string):Promise<{deckId:string;version:number;cards:readonly {cardDefinitionId:string;cardVersion:number;quantity:number}[]}> }
