import { z } from 'zod';

export const semanticTypeSchema = z.enum([
  'person_name',
  'company_name',
  'date',
  'dungeon_name',
  'dungeon_floor',
  'hazard_grade',
  'ownership_claim',
  'payment',
  'loot_rights',
  'signature',
  'magical_inscription',
  'permit_number',
  'map_location',
  'witness_statement',
]);

export const contractRulingSchema = z.enum(['approve', 'deny']);

export const documentFieldSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  displayedValue: z.string().min(1),
  semanticType: semanticTypeSchema,
  selectable: z.boolean(),
  visuallyEmphasized: z.boolean().optional(),
  relatedFieldIds: z.array(z.string()).optional(),
});

export const documentBlockSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('heading'), text: z.string() }),
  z.object({ kind: z.literal('paragraph'), text: z.string() }),
  z.object({ kind: z.literal('fieldList'), fieldIds: z.array(z.string()) }),
  z.object({ kind: z.literal('rule'), text: z.string() }),
]);

export const eventTriggerSchema = z.object({
  type: z.enum([
    'document_opened',
    'field_flagged',
    'question_asked',
    'action_count',
    'decision_panel_opened',
    'elapsed_shift_units',
    'manual',
  ]),
  value: z.union([z.string(), z.number()]).optional(),
});

export const contractDocumentSchema = z.object({
  id: z.string().min(1),
  caseId: z.string().min(1),
  documentType: z.string().min(1),
  title: z.string().min(1),
  issuer: z.string().min(1),
  issuedDate: z.string().min(1),
  bodyBlocks: z.array(documentBlockSchema).min(1),
  fields: z.array(documentFieldSchema),
  signatures: z.array(z.string()),
  seals: z.array(z.string()),
  attachments: z.array(z.string()),
  startingDeskPosition: z.object({ x: z.number(), y: z.number(), z: z.number() }),
  optional: z.boolean().optional(),
  initiallyLocked: z.boolean().optional(),
});

export const contractVisitorSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  role: z.string().min(1),
  portraitAsset: z.string().optional(),
  trigger: eventTriggerSchema,
  openingDialogue: z.string().min(1),
  questionOptions: z.array(z.object({
    id: z.string().min(1),
    label: z.string().min(1),
    response: z.string().min(1),
    grantsDocumentIds: z.array(z.string()).optional(),
  })),
  documentsGranted: z.array(z.string()),
  dispositionChanges: z.record(z.string(), z.number()).optional(),
  exitDialogue: z.string(),
});

export const contractCaseSchema = z.object({
  id: z.string().min(1),
  slug: z.string().min(1),
  title: z.string().min(1),
  clientName: z.string().min(1),
  clientType: z.string().min(1),
  jobType: z.string().min(1),
  urgency: z.string().min(1),
  difficulty: z.number().int().min(1).max(5),
  estimatedMinutes: z.number().int().positive(),
  briefing: z.string().min(1),
  handbookSections: z.array(z.string()).min(1),
  documents: z.array(contractDocumentSchema).min(1),
  visitors: z.array(contractVisitorSchema),
  timedOrActionEvents: z.array(z.object({
    id: z.string().min(1),
    title: z.string().min(1),
    trigger: eventTriggerSchema,
    message: z.string().min(1),
    unlockDocumentIds: z.array(z.string()).optional(),
    visitorId: z.string().optional(),
  })),
  publicMetadata: z.record(z.string(), z.unknown()),
  version: z.number().int().positive(),
});

export const contractCasesSchema = z.array(contractCaseSchema);

export const contractCaseSolutionSchema = z.object({
  caseSlug: z.string().min(1),
  correctRuling: contractRulingSchema,
  requiredEvidenceIds: z.array(z.string()),
  supportingEvidenceIds: z.array(z.string()),
  criticalEvidenceIds: z.array(z.string()),
  irrelevantEvidenceIds: z.array(z.string()),
  misleadingEvidenceIds: z.array(z.string()),
  optionalDiscoveryIds: z.array(z.string()),
  scoringWeights: z.record(z.string(), z.number()),
  resultText: z.object({
    approve: z.string().min(1),
    deny: z.string().min(1),
    correctComplete: z.string().min(1),
    correctPartial: z.string().min(1),
    incorrect: z.string().min(1),
  }),
  persistentOutcomes: z.array(z.object({
    key: z.string().min(1),
    data: z.record(z.string(), z.unknown()),
  })),
});

export const contractCaseSolutionsSchema = z.array(contractCaseSolutionSchema);
