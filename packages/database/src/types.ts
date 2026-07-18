export type Json = null | boolean | number | string | Json[] | { [key: string]: Json | undefined };
export interface DeckRow { id:string; owner_id:string; name:string; format:string; version:number; is_valid:boolean; created_at:string; updated_at:string }
export interface MatchRow { id:string; status:"waiting"|"active"|"complete"|"abandoned"; rules_version:string; random_seed:string; initial_snapshot:Json; final_snapshot:Json|null; started_at:string|null; ended_at:string|null; created_at:string }
export interface MatchEventRow { id:number; match_id:string; sequence:number; command_id:string; actor_id:string|null; command:Json; events:Json; state_hash:string|null; created_at:string }
export interface GameDatabase {
  public: { Tables: {
    decks:{Row:DeckRow;Insert:Omit<DeckRow,"id"|"created_at"|"updated_at"> & {id?:string;created_at?:string;updated_at?:string};Update:Partial<Omit<DeckRow,"id"|"owner_id">>};
    matches:{Row:MatchRow;Insert:Omit<MatchRow,"id"|"created_at"> & {id?:string;created_at?:string};Update:Partial<Omit<MatchRow,"id">>};
    match_event_logs:{Row:MatchEventRow;Insert:Omit<MatchEventRow,"id"|"created_at"> & {id?:number;created_at?:string};Update:never};
  }};
}
