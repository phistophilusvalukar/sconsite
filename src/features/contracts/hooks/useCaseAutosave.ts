import { useEffect, useState } from 'react';
import { upsertContractRun } from '../api/contractMutations';
import { CaseRunState } from '../types/contracts';

export function useCaseAutosave(state: CaseRunState | undefined, userId?: string) {
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'failed'>('idle');

  useEffect(() => {
    if (!state || state.status === 'submitted') return;
    setStatus('saving');
    const timer = window.setTimeout(() => {
      upsertContractRun(state, userId)
        .then(() => setStatus('saved'))
        .catch(() => setStatus('failed'));
    }, 500);

    return () => window.clearTimeout(timer);
  }, [state, userId]);

  return status;
}
