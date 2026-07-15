import { describe, expect, it } from 'vitest';
import { contractCases } from '../data/contractCases';
import { contractCaseSolutions } from '../data/contractCaseSolutions';
import { createInitialRunState, reduceCaseState } from '../engine/caseReducer';
import { getTriggeredEvents } from '../engine/eventEngine';
import { isRulingAllowed, normalizeEvidenceSelection, validateCaseSolution } from '../engine/clientValidation';
import { getShiftCost } from '../engine/shiftLogic';
import { contractCaseSolutionsSchema, contractCasesSchema } from '../schemas/contractCaseSchema';

describe('UnderHaul contract cases', () => {
  it('validates authored starter cases with the Zod schema', () => {
    const parsed = contractCasesSchema.parse(contractCases);
    expect(parsed).toHaveLength(3);
  });

  it('validates authored binary solutions with known evidence ids', () => {
    const parsed = contractCaseSolutionsSchema.parse(contractCaseSolutions);
    expect(parsed).toHaveLength(3);
    expect(contractCases.flatMap(contractCase => {
      const solution = contractCaseSolutions.find(item => item.caseSlug === contractCase.slug);
      return solution ? validateCaseSolution(contractCase, solution) : [`missing solution for ${contractCase.slug}`];
    })).toEqual([]);
  });

  it('uses action-based shift costs', () => {
    expect(getShiftCost('open_document')).toBe(0);
    expect(getShiftCost('interview_visitor')).toBe(1);
    expect(getShiftCost('verify_document')).toBe(2);
  });

  it('opens and compares documents without relying on drag', () => {
    const contractCase = contractCases[0];
    const first = contractCase.documents[0].id;
    const second = contractCase.documents[1].id;
    let state = createInitialRunState(contractCase);

    state = reduceCaseState(contractCase, state, { type: 'openDocument', documentId: first });
    state = reduceCaseState(contractCase, state, { type: 'compareDocument', documentId: first });
    state = reduceCaseState(contractCase, state, { type: 'compareDocument', documentId: second });

    expect(state.activeDocumentId).toBe(first);
    expect(state.comparisonDocumentIds).toEqual([first, second]);
  });

  it('flags stable document field ids and triggers authored events', () => {
    const contractCase = contractCases[0];
    const state = reduceCaseState(contractCase, createInitialRunState(contractCase), {
      type: 'flagField',
      fieldId: 'satchel-request-floor',
    });

    expect(state.selectedFlagIds).toContain('satchel-request-floor');
    expect(state.visitorState['orra-brindle']?.visible).toBe(true);
    expect(getTriggeredEvents(contractCase, state)).toEqual([]);
  });

  it('advances shift units when questioning a visitor', () => {
    const contractCase = contractCases[0];
    const state = reduceCaseState(contractCase, createInitialRunState(contractCase), {
      type: 'askVisitorQuestion',
      visitorId: 'orra-brindle',
      questionId: 'floor-question',
    });

    expect(state.shiftUnits).toBe(1);
    expect(state.visitorState['orra-brindle'].askedQuestionIds).toContain('floor-question');
  });

  it('normalizes evidence selection to selectable fields', () => {
    expect(normalizeEvidenceSelection(contractCases[0], ['satchel-request-floor', 'not-real'])).toEqual(['satchel-request-floor']);
  });

  it('allows only approve and deny as final rulings', () => {
    expect(isRulingAllowed('approve')).toBe(true);
    expect(isRulingAllowed('deny')).toBe(true);
    expect(isRulingAllowed('emergency_provisional')).toBe(false);
    expect(isRulingAllowed('approve_with_amendments')).toBe(false);
  });

  it('sets the tutorial correct ruling to deny', () => {
    expect(contractCaseSolutions.find(solution => solution.caseSlug === 'surveyors-satchel')?.correctRuling).toBe('deny');
  });

  it('keeps completed runs immutable in the reducer', () => {
    const contractCase = contractCases[0];
    const submitted = reduceCaseState(contractCase, createInitialRunState(contractCase), {
      type: 'markSubmitted',
      resultSummary: {
        ruling: 'deny',
        correctRuling: true,
        score: 90,
        categories: {
          rulingAccuracy: 40,
          criticalEvidence: 0,
          supportingEvidence: 0,
          incorrectFlags: 0,
          optionalDiscoveries: 0,
          efficiency: 0,
        },
        foundEvidence: [],
        missedEvidence: [],
        incorrectEvidence: [],
        resultTitle: 'Filed',
        resultSummary: 'Filed',
        consequences: [],
        unlockedClues: [],
      },
    });

    const changed = reduceCaseState(contractCase, submitted, { type: 'flagField', fieldId: 'satchel-request-floor' });
    expect(changed.selectedFlagIds).toEqual([]);
  });

  it('serializes autosave state as plain JSON', () => {
    const state = reduceCaseState(contractCases[0], createInitialRunState(contractCases[0]), {
      type: 'setNote',
      key: 'general',
      value: 'Check floor mismatch.',
    });

    expect(JSON.parse(JSON.stringify(state))).toMatchObject({
      caseSlug: 'surveyors-satchel',
      notes: { general: 'Check floor mismatch.' },
    });
  });
});
