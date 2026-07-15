import { supabase } from '../../../config/database';
import { contractCases } from '../data/contractCases';
import { contractCaseSchema } from '../schemas/contractCaseSchema';
import { CaseRunState, ContractCase } from '../types/contracts';

export async function loadPublishedContractCases(): Promise<ContractCase[]> {
  const { data, error } = await supabase
    .from('contract_cases')
    .select(`
      *,
      contract_case_documents (*),
      contract_case_visitors (*),
      contract_case_events (*)
    `)
    .eq('is_published', true)
    .order('difficulty', { ascending: true });

  if (error || !data?.length) {
    return contractCases.map(contractCase => contractCaseSchema.parse(contractCase));
  }

  return contractCases.map(contractCase => contractCaseSchema.parse(contractCase));
}

export async function loadContractCaseBySlug(slug: string): Promise<ContractCase | undefined> {
  const cases = await loadPublishedContractCases();
  return cases.find(contractCase => contractCase.slug === slug);
}

export async function loadOwnContractRuns(userId?: string): Promise<CaseRunState[]> {
  if (!userId) return [];

  const { data, error } = await supabase
    .from('contract_case_runs')
    .select('*')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false });

  if (error || !data) return [];

  return data
    .map(row => row.desk_state as CaseRunState | null)
    .filter((row): row is CaseRunState => Boolean(row?.runId));
}
