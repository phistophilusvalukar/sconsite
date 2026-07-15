import { applyTriggeredEvents } from './eventEngine';
import { getShiftCost } from './shiftLogic';
import { CaseRunState, ContractCase, ContractRuling } from '../types/contracts';

export type CaseAction =
  | { type: 'openDocument'; documentId: string }
  | { type: 'closeDocument'; documentId: string }
  | { type: 'returnToFolder'; documentId: string }
  | { type: 'moveDocument'; documentId: string; x: number; y: number }
  | { type: 'nudgeDocument'; documentId: string; dx: number; dy: number }
  | { type: 'zoomDocument'; documentId: string; zoom: number }
  | { type: 'compareDocument'; documentId: string }
  | { type: 'flagField'; fieldId: string }
  | { type: 'setNote'; key: string; value: string }
  | { type: 'pinFact'; text: string }
  | { type: 'askVisitorQuestion'; visitorId: string; questionId: string; grantsDocumentIds?: string[] }
  | { type: 'selectRuling'; ruling: ContractRuling }
  | { type: 'markSubmitted'; resultSummary: CaseRunState['resultSummary'] }
  | { type: 'restore'; state: CaseRunState };

export function createInitialRunState(contractCase: ContractCase, runId = `local-${contractCase.slug}`): CaseRunState {
  const desk = Object.fromEntries(contractCase.documents.map(document => [
    document.id,
    {
      ...document.startingDeskPosition,
      open: false,
      zoom: 1,
      inFolder: Boolean(document.initiallyLocked),
    },
  ]));

  return {
    runId,
    caseSlug: contractCase.slug,
    caseVersion: contractCase.version,
    status: 'active',
    shiftUnits: 0,
    comparisonDocumentIds: [],
    desk,
    discoveredDocumentIds: contractCase.documents.filter(document => !document.initiallyLocked).map(document => document.id),
    selectedFlagIds: [],
    notes: {},
    pinnedFacts: [],
    visitorState: {},
    triggeredEventIds: [],
  };
}

export function reduceCaseState(contractCase: ContractCase, state: CaseRunState, action: CaseAction): CaseRunState {
  if (state.status === 'submitted' && action.type !== 'restore') return state;

  const next = reduceCaseStateOnce(contractCase, state, action);
  return applyTriggeredEvents(contractCase, next);
}

function reduceCaseStateOnce(contractCase: ContractCase, state: CaseRunState, action: CaseAction): CaseRunState {
  switch (action.type) {
    case 'openDocument':
      return {
        ...state,
        activeDocumentId: action.documentId,
        discoveredDocumentIds: Array.from(new Set([...state.discoveredDocumentIds, action.documentId])),
        desk: {
          ...state.desk,
          [action.documentId]: { ...state.desk[action.documentId], open: true, inFolder: false },
        },
      };
    case 'closeDocument':
      return {
        ...state,
        activeDocumentId: state.activeDocumentId === action.documentId ? undefined : state.activeDocumentId,
        desk: { ...state.desk, [action.documentId]: { ...state.desk[action.documentId], open: false } },
      };
    case 'returnToFolder':
      return {
        ...state,
        activeDocumentId: state.activeDocumentId === action.documentId ? undefined : state.activeDocumentId,
        comparisonDocumentIds: state.comparisonDocumentIds.filter(id => id !== action.documentId),
        desk: { ...state.desk, [action.documentId]: { ...state.desk[action.documentId], open: false, inFolder: true } },
      };
    case 'moveDocument':
      return {
        ...state,
        desk: { ...state.desk, [action.documentId]: { ...state.desk[action.documentId], x: action.x, y: action.y } },
      };
    case 'nudgeDocument': {
      const current = state.desk[action.documentId];
      return {
        ...state,
        desk: {
          ...state.desk,
          [action.documentId]: {
            ...current,
            x: Math.max(0, Math.min(76, current.x + action.dx)),
            y: Math.max(0, Math.min(62, current.y + action.dy)),
          },
        },
      };
    }
    case 'zoomDocument':
      return {
        ...state,
        desk: { ...state.desk, [action.documentId]: { ...state.desk[action.documentId], zoom: action.zoom } },
      };
    case 'compareDocument': {
      const comparisonDocumentIds = state.comparisonDocumentIds.includes(action.documentId)
        ? state.comparisonDocumentIds.filter(id => id !== action.documentId)
        : [...state.comparisonDocumentIds, action.documentId].slice(-2);
      return { ...state, comparisonDocumentIds };
    }
    case 'flagField':
      return {
        ...state,
        selectedFlagIds: state.selectedFlagIds.includes(action.fieldId)
          ? state.selectedFlagIds.filter(id => id !== action.fieldId)
          : [...state.selectedFlagIds, action.fieldId],
      };
    case 'setNote':
      return { ...state, notes: { ...state.notes, [action.key]: action.value } };
    case 'pinFact':
      return { ...state, pinnedFacts: Array.from(new Set([...state.pinnedFacts, action.text])) };
    case 'askVisitorQuestion': {
      const current = state.visitorState[action.visitorId] || { visible: true, askedQuestionIds: [] };
      return {
        ...state,
        shiftUnits: state.shiftUnits + getShiftCost('interview_visitor'),
        discoveredDocumentIds: Array.from(new Set([...state.discoveredDocumentIds, ...(action.grantsDocumentIds || [])])),
        visitorState: {
          ...state.visitorState,
          [action.visitorId]: {
            ...current,
            visible: true,
            askedQuestionIds: Array.from(new Set([...current.askedQuestionIds, action.questionId])),
          },
        },
      };
    }
    case 'selectRuling':
      return { ...state, ruling: action.ruling };
    case 'markSubmitted':
      return { ...state, status: 'submitted', resultSummary: action.resultSummary };
    case 'restore':
      return action.state.caseSlug === contractCase.slug ? action.state : state;
    default:
      return state;
  }
}
