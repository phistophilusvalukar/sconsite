import { describe, expect, it } from 'vitest';
import { ContractCaseResult } from '../types/contracts';

function renderResultSummary(result: ContractCaseResult) {
  return `${result.ruling}:${result.score}:${result.foundEvidence.join('|')}`;
}

describe('contract result rendering data', () => {
  it('renders from a mocked RPC response shape', () => {
    const rpcResult: ContractCaseResult = {
      ruling: 'deny',
      correctRuling: true,
      score: 88,
      categories: {
        rulingAccuracy: 40,
        criticalEvidence: 20,
        supportingEvidence: 15,
        incorrectFlags: -2,
        optionalDiscoveries: 5,
        efficiency: 10,
      },
      foundEvidence: ['Conflicting inscription wording'],
      missedEvidence: [],
      incorrectEvidence: [],
      resultTitle: 'Correct ruling',
      resultSummary: 'Filed',
      consequences: ['Escalated'],
      unlockedClues: ['Broker clue'],
    };

    expect(renderResultSummary(rpcResult)).toBe('deny:88:Conflicting inscription wording');
  });
});
