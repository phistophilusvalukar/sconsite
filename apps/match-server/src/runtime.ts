import type { JwtVerifier } from "./auth.js";
import type { MatchPersistence } from "./persistence.js";
export interface RuntimeDependencies { verifier:JwtVerifier; persistence:MatchPersistence; reconnectSeconds:number }
let runtime:RuntimeDependencies|undefined;
export function setRuntimeDependencies(value:RuntimeDependencies):void { runtime=value; }
export function getRuntimeDependencies():RuntimeDependencies { if(!runtime) throw new Error("Match server runtime is not configured"); return runtime; }
