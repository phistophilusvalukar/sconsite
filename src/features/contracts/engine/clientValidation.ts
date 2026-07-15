import { ContractCase, ContractCaseSolution, ContractRuling } from '../types/contracts';

const obsoleteRulings = new Set([
  'approve_with_amendments',
  'request_more_evidence',
  'escalate_specialist',
  'emergency_provisional',
  'amendments_required',
  'specialist_review',
  'emergency_authorization',
]);

export function isRulingAllowed(ruling?: string): ruling is ContractRuling {
  return ruling === 'approve' || ruling === 'deny';
}

export function getSelectableFieldIds(contractCase: ContractCase): string[] {
  return contractCase.documents.flatMap(document =>
    document.fields.filter(field => field.selectable).map(field => field.id)
  );
}

export function normalizeEvidenceSelection(contractCase: ContractCase, flagIds: string[]): string[] {
  const allowed = new Set(getSelectableFieldIds(contractCase));
  return Array.from(new Set(flagIds.filter(id => allowed.has(id))));
}

export function validateCaseSolution(contractCase: ContractCase, solution: ContractCaseSolution): string[] {
  const errors: string[] = [];
  const selectable = new Set(getSelectableFieldIds(contractCase));
  const evidenceGroups = [
    ['requiredEvidenceIds', solution.requiredEvidenceIds],
    ['supportingEvidenceIds', solution.supportingEvidenceIds],
    ['criticalEvidenceIds', solution.criticalEvidenceIds],
    ['irrelevantEvidenceIds', solution.irrelevantEvidenceIds],
    ['misleadingEvidenceIds', solution.misleadingEvidenceIds],
    ['optionalDiscoveryIds', solution.optionalDiscoveryIds],
  ] as const;

  if (!isRulingAllowed(solution.correctRuling)) {
    errors.push(`${contractCase.slug} has invalid correct ruling`);
  }

  evidenceGroups.forEach(([groupName, ids]) => {
    ids.forEach(id => {
      if (!selectable.has(id)) {
        errors.push(`${contractCase.slug} ${groupName} references missing field ${id}`);
      }
      if (obsoleteRulings.has(id)) {
        errors.push(`${contractCase.slug} ${groupName} references obsolete ruling ${id}`);
      }
    });
  });

  const serialized = JSON.stringify(contractCase);
  obsoleteRulings.forEach(value => {
    if (serialized.includes(value)) {
      errors.push(`${contractCase.slug} contains obsolete final ruling ${value}`);
    }
  });

  if (!solution.resultText.approve || !solution.resultText.deny) {
    errors.push(`${contractCase.slug} must define approval and denial result text`);
  }

  return errors;
}
