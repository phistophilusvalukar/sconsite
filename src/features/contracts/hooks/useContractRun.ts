import { useMemo, useReducer } from 'react';
import { loadLocalRun } from '../api/contractMutations';
import { createInitialRunState, reduceCaseState } from '../engine/caseReducer';
import { ContractCase } from '../types/contracts';

export function useContractRun(contractCase: ContractCase | undefined) {
  const initialState = useMemo(() => {
    if (!contractCase) return undefined;
    return loadLocalRun(contractCase.slug) || createInitialRunState(contractCase);
  }, [contractCase]);

  const [state, dispatch] = useReducer((current: typeof initialState, action: Parameters<typeof reduceCaseState>[2]) => {
    if (!contractCase || !current) return current;
    return reduceCaseState(contractCase, current, action);
  }, initialState);

  return { state, dispatch };
}
