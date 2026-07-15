import { CaseRunState, ContractCase, TimedOrActionEvent } from '../types/contracts';

export function getTriggeredEvents(contractCase: ContractCase, state: CaseRunState): TimedOrActionEvent[] {
  return contractCase.timedOrActionEvents.filter(event => {
    if (state.triggeredEventIds.includes(event.id)) return false;

    switch (event.trigger.type) {
      case 'elapsed_shift_units':
      case 'action_count':
        return typeof event.trigger.value === 'number' && state.shiftUnits >= event.trigger.value;
      case 'document_opened':
        return typeof event.trigger.value === 'string' && state.discoveredDocumentIds.includes(event.trigger.value);
      case 'field_flagged':
        return typeof event.trigger.value === 'string' && state.selectedFlagIds.includes(event.trigger.value);
      case 'decision_panel_opened':
        return state.ruling !== undefined;
      case 'manual':
      case 'question_asked':
        return false;
      default:
        return false;
    }
  });
}

export function applyTriggeredEvents(contractCase: ContractCase, state: CaseRunState): CaseRunState {
  const events = getTriggeredEvents(contractCase, state);
  if (events.length === 0) return state;

  const discovered = new Set(state.discoveredDocumentIds);
  const visitorState = { ...state.visitorState };

  events.forEach(event => {
    event.unlockDocumentIds?.forEach(id => discovered.add(id));
    if (event.visitorId) {
      visitorState[event.visitorId] = {
        visible: true,
        askedQuestionIds: visitorState[event.visitorId]?.askedQuestionIds || [],
      };
    }
  });

  return {
    ...state,
    discoveredDocumentIds: Array.from(discovered),
    visitorState,
    triggeredEventIds: [...state.triggeredEventIds, ...events.map(event => event.id)],
  };
}
