import { useEffect, useState } from 'react';
import { loadContractCaseBySlug, loadPublishedContractCases } from '../api/contractQueries';
import { ContractCase } from '../types/contracts';

export function useContractCases() {
  const [cases, setCases] = useState<ContractCase[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadPublishedContractCases()
      .then(setCases)
      .finally(() => setIsLoading(false));
  }, []);

  return { cases, isLoading };
}

export function useContractCase(slug?: string) {
  const [contractCase, setContractCase] = useState<ContractCase | undefined>();
  const [isLoading, setIsLoading] = useState(Boolean(slug));

  useEffect(() => {
    if (!slug) return;
    setIsLoading(true);
    loadContractCaseBySlug(slug)
      .then(setContractCase)
      .finally(() => setIsLoading(false));
  }, [slug]);

  return { contractCase, isLoading };
}
