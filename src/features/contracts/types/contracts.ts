export type ContractRuling = 'approve' | 'deny';

export type SemanticType =
  | 'person_name'
  | 'company_name'
  | 'date'
  | 'dungeon_name'
  | 'dungeon_floor'
  | 'hazard_grade'
  | 'ownership_claim'
  | 'payment'
  | 'loot_rights'
  | 'signature'
  | 'magical_inscription'
  | 'permit_number'
  | 'map_location'
  | 'witness_statement';

export interface DocumentField {
  id: string;
  label: string;
  displayedValue: string;
  semanticType: SemanticType;
  selectable: boolean;
  visuallyEmphasized?: boolean;
  relatedFieldIds?: string[];
}

export type DocumentBlock =
  | { kind: 'heading'; text: string }
  | { kind: 'paragraph'; text: string }
  | { kind: 'fieldList'; fieldIds: string[] }
  | { kind: 'rule'; text: string };

export interface ContractDocument {
  id: string;
  caseId: string;
  documentType: string;
  title: string;
  issuer: string;
  issuedDate: string;
  bodyBlocks: DocumentBlock[];
  fields: DocumentField[];
  signatures: string[];
  seals: string[];
  attachments: string[];
  startingDeskPosition: { x: number; y: number; z: number };
  optional?: boolean;
  initiallyLocked?: boolean;
}

export interface VisitorQuestion {
  id: string;
  label: string;
  response: string;
  grantsDocumentIds?: string[];
}

export interface ContractVisitor {
  id: string;
  name: string;
  role: string;
  portraitAsset?: string;
  trigger: EventTrigger;
  openingDialogue: string;
  questionOptions: VisitorQuestion[];
  documentsGranted: string[];
  dispositionChanges?: Record<string, number>;
  exitDialogue: string;
}

export interface EventTrigger {
  type:
    | 'document_opened'
    | 'field_flagged'
    | 'question_asked'
    | 'action_count'
    | 'decision_panel_opened'
    | 'elapsed_shift_units'
    | 'manual';
  value?: string | number;
}

export interface TimedOrActionEvent {
  id: string;
  title: string;
  trigger: EventTrigger;
  message: string;
  unlockDocumentIds?: string[];
  visitorId?: string;
}

export interface ContractCase {
  id: string;
  slug: string;
  title: string;
  clientName: string;
  clientType: string;
  jobType: string;
  urgency: string;
  difficulty: number;
  estimatedMinutes: number;
  briefing: string;
  handbookSections: string[];
  documents: ContractDocument[];
  visitors: ContractVisitor[];
  timedOrActionEvents: TimedOrActionEvent[];
  publicMetadata: Record<string, unknown>;
  version: number;
}

export interface DeskDocumentState {
  x: number;
  y: number;
  z: number;
  open: boolean;
  zoom: number;
  inFolder?: boolean;
}

export interface CaseRunState {
  runId: string;
  caseSlug: string;
  caseVersion: number;
  status: 'active' | 'submitted';
  shiftUnits: number;
  activeDocumentId?: string;
  comparisonDocumentIds: string[];
  desk: Record<string, DeskDocumentState>;
  discoveredDocumentIds: string[];
  selectedFlagIds: string[];
  notes: Record<string, string>;
  pinnedFacts: string[];
  visitorState: Record<string, { visible: boolean; askedQuestionIds: string[]; dismissed?: boolean }>;
  triggeredEventIds: string[];
  ruling?: ContractRuling;
  legacyDecision?: string;
  resultSummary?: ContractCaseResult;
  saveError?: string;
}

export interface ContractCaseResult {
  ruling: ContractRuling;
  correctRuling: boolean;
  score: number;
  categories: {
    rulingAccuracy: number;
    criticalEvidence: number;
    supportingEvidence: number;
    incorrectFlags: number;
    optionalDiscoveries: number;
    efficiency: number;
  };
  foundEvidence: string[];
  missedEvidence: string[];
  incorrectEvidence: string[];
  resultTitle: string;
  resultSummary: string;
  consequences: string[];
  unlockedClues: string[];
  legacyDecision?: string;
  legacySummary?: {
    decision?: string;
    totalScore?: number;
    caughtFacts?: string[];
    missedFacts?: string[];
    clues?: string[];
    professionalNote?: string;
  };
}

export interface ContractCaseSolution {
  caseSlug: string;
  correctRuling: ContractRuling;
  requiredEvidenceIds: string[];
  supportingEvidenceIds: string[];
  criticalEvidenceIds: string[];
  irrelevantEvidenceIds: string[];
  misleadingEvidenceIds: string[];
  optionalDiscoveryIds: string[];
  scoringWeights: Record<string, number>;
  resultText: {
    approve: string;
    deny: string;
    correctComplete: string;
    correctPartial: string;
    incorrect: string;
  };
  persistentOutcomes: Array<{ key: string; data: Record<string, unknown> }>;
}
