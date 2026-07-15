import { supabase } from '../../../config/database';
import { CaseRunState, ContractCaseResult, ContractRuling } from '../types/contracts';

export async function upsertContractRun(state: CaseRunState, userId?: string): Promise<void> {
  window.localStorage.setItem(getLocalRunKey(state.caseSlug), JSON.stringify(state));
  if (!userId || state.runId.startsWith('local-')) return;

  const { error } = await supabase
    .from('contract_case_runs')
    .update({
      shift_units: state.shiftUnits,
      desk_state: state,
      discovered_document_keys: state.discoveredDocumentIds,
      selected_flag_ids: state.selectedFlagIds,
      notes: state.notes,
      visitor_state: state.visitorState,
      updated_at: new Date().toISOString(),
    })
    .eq('id', state.runId)
    .eq('user_id', userId)
    .eq('status', 'active');

  if (error) throw error;
}

export async function startContractRun(caseId: string, caseVersion: number, state: CaseRunState, userId?: string): Promise<string> {
  window.localStorage.setItem(getLocalRunKey(state.caseSlug), JSON.stringify(state));
  if (!userId) return state.runId;

  const { data, error } = await supabase
    .from('contract_case_runs')
    .insert({
      user_id: userId,
      case_id: caseId,
      case_version: caseVersion,
      status: 'active',
      desk_state: state,
      discovered_document_keys: state.discoveredDocumentIds,
      selected_flag_ids: state.selectedFlagIds,
      notes: state.notes,
      visitor_state: state.visitorState,
    })
    .select('id')
    .single();

  if (error || !data?.id) return state.runId;
  return data.id;
}

export async function submitContractCaseRun(
  runId: string,
  ruling: ContractRuling,
  flagIds: string[]
): Promise<ContractCaseResult> {
  const { data, error } = await supabase.rpc('submit_contract_case_v2', {
    p_run_id: runId,
    p_ruling: ruling,
    p_flag_ids: flagIds,
  });

  if (error) throw error;
  return data as ContractCaseResult;
}

export function loadLocalRun(slug: string): CaseRunState | undefined {
  const raw = window.localStorage.getItem(getLocalRunKey(slug));
  if (!raw) return undefined;
  try {
    return normalizeLocalRun(JSON.parse(raw) as CaseRunState);
  } catch {
    return undefined;
  }
}

export function getLocalRunKey(slug: string): string {
  return `underhaul-contract-run:${slug}`;
}

function normalizeLocalRun(state: CaseRunState & { decision?: string; justification?: string }): CaseRunState {
  if (state.status === 'submitted') {
    const result = state.resultSummary as ContractCaseResult & {
      decision?: string;
      totalScore?: number;
      caughtFacts?: string[];
      missedFacts?: string[];
      clues?: string[];
      professionalNote?: string;
    } | undefined;

    if (result && !result.ruling && result.decision) {
      return {
        ...state,
        resultSummary: {
          ruling: result.decision === 'approve' ? 'approve' : 'deny',
          correctRuling: true,
          score: result.totalScore || 0,
          categories: {
            rulingAccuracy: 0,
            criticalEvidence: 0,
            supportingEvidence: 0,
            incorrectFlags: 0,
            optionalDiscoveries: 0,
            efficiency: 0,
          },
          foundEvidence: result.caughtFacts || [],
          missedEvidence: result.missedFacts || [],
          incorrectEvidence: [],
          resultTitle: 'Legacy completed report',
          resultSummary: result.professionalNote || 'Legacy report filed before binary rulings.',
          consequences: result.consequences || [],
          unlockedClues: result.clues || [],
          legacyDecision: result.decision,
          legacySummary: {
            decision: result.decision,
            totalScore: result.totalScore,
            caughtFacts: result.caughtFacts,
            missedFacts: result.missedFacts,
            clues: result.clues,
            professionalNote: result.professionalNote,
          },
        },
      };
    }

    return state;
  }

  const next = { ...state };
  if (!next.ruling && (state.decision === 'approve' || state.decision === 'deny')) {
    next.ruling = state.decision;
  } else if (state.decision) {
    next.legacyDecision = state.decision;
  }

  delete (next as CaseRunState & { decision?: string }).decision;
  delete (next as CaseRunState & { justification?: string }).justification;
  return next;
}
