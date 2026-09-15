import { executeOuroboros, formatOuroborosFailure } from './ouroborosRuntime';

export const DEFAULT_STARTUP_SOURCE = `# startup.oro
# Programs are resolved relative to C:\\ANCIENT\\SCRIPTS.
# Use ../HOME/folder/program.oro to run a script from HOME.
# Add or remove {path: "...", functions: ["..."]} entries in the returned list.

fn startup():
    return [{path: "./world_init.oro", functions: ["getTime", "getPop"]}]
`;

export type StartupProgram = {
  path: string;
  functions: string[];
};

export type StartupPlanResult =
  | { ok: true; programs: StartupProgram[] }
  | { ok: false; error: string };

export function parseStartupPlan(source: string): StartupPlanResult {
  try {
    const result = executeOuroboros({
      source,
      functionName: 'startup',
      limits: { maxCallDepth: 8, maxOutputCharacters: 2_048, maxSteps: 5_000 },
    }).result;
    if (!Array.isArray(result)) return { ok: false, error: 'startup() must return a list.' };
    if (result.length > 16) return { ok: false, error: 'startup() may register at most 16 programs.' };

    const programs: StartupProgram[] = [];
    for (let index = 0; index < result.length; index += 1) {
      const entry = result[index];
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
        return { ok: false, error: `startup entry ${index + 1} must be a dictionary.` };
      }
      const path = entry.path;
      const functions = entry.functions;
      if (typeof path !== 'string' || !path.trim().toLowerCase().endsWith('.oro')) {
        return { ok: false, error: `startup entry ${index + 1} requires an .oro path.` };
      }
      if (!Array.isArray(functions) || functions.some(name => typeof name !== 'string' || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(name))) {
        return { ok: false, error: `startup entry ${index + 1} requires a list of function names.` };
      }
      programs.push({ path: path.trim(), functions });
    }
    return { ok: true, programs };
  } catch (error) {
    const failure = formatOuroborosFailure(error);
    return { ok: false, error: `${failure.line}:${failure.column} ${failure.kind}: ${failure.message}` };
  }
}
