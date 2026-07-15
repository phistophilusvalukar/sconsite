export type ShiftActionType =
  | 'open_document'
  | 'request_record'
  | 'interview_visitor'
  | 'verify_document'
  | 'flag_field'
  | 'open_decision_panel'
  | 'submit_case';

export function getShiftCost(actionType: ShiftActionType): number {
  switch (actionType) {
    case 'request_record':
    case 'interview_visitor':
      return 1;
    case 'verify_document':
      return 2;
    default:
      return 0;
  }
}

export function formatShiftUnits(units: number): string {
  if (units === 0) return 'Start of shift';
  if (units === 1) return '1 shift unit used';
  return `${units} shift units used`;
}
