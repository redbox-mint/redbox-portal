import type {
  PublicationApproval,
  PublicationIntent,
  PublicationSourceReference,
  PublicationPreparationFailure,
  PublicationWorkflowDecision,
} from './services/publication/contracts';
import type { FigshareSourceRequest } from './model/storage/FigshareSyncModel';

/** Internal options: never populated from an incoming record or HTTP options. */
export interface RecordWriteOptions {
  figshareIntent?: {
    intents: FigshareSourceRequest[];
    requestedBy: string;
    saveToken: string;
    readiness: 'initialising' | 'ready';
  };
  /** Trusted server preparation only. Public option normalization deliberately drops it. */
  publicationIntent?: PublicationWriteIntent;
  expectedVersion?: number;
  maintenance?: boolean;
}
export interface RecordFieldWriteResult {
  updated: boolean;
  recordVersion?: number;
}
export class RecordWriteConflict extends Error {
  constructor() {
    super('Record changed while background work was in progress');
    this.name = 'RecordWriteConflict';
  }
}
export function assertRecordFieldPaths(fields: Record<string, unknown>, allowed: string[]): void {
  for (const path of Object.keys(fields)) {
    if (
      !allowed.includes(path) ||
      !/^(metadata|metaMetadata)\.[A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+)*$/.test(path) ||
      path.split('.').some(p => ['__proto__', 'constructor', 'prototype'].includes(p))
    ) {
      throw new Error(`Unsupported record projection path: ${path}`);
    }
  }
}

/** A content write advances source identity even when local preparation grants nothing. */
export interface PublicationWriteIntent {
  kind: 'content' | 'approval' | 'preserve' | 'revoke';
  expectedSourceRevision: number;
  saveToken: string;
  approvals: PublicationApproval[];
  /** Exact preflight content identity prevents permissive saves rebasing prepared authority. */
  expectedRecordDigest?: string;
  expectedPriorRecordDigest?: string;
  preparationFailures?: PublicationPreparationFailure[];
  revocations?: Array<{ approvalId: string; epoch: number }>;
  /** Only the coordinator's already reserved decision can accompany an internal transition. */
  workflowDecisionId?: string;
}
export interface PublicationSaveCompletion {
  sourceRevision: number;
  recordDigest: string;
  /** Durable tracker decision identity, issued only after synchronous save work succeeds. */
  evidenceId: string;
}
export interface PublicationAcknowledgement extends PublicationIntent {
  source: PublicationSourceReference;
}
export interface PublicationRecoveryResult {
  scanned: number;
  ready: number;
  quarantined: number;
  afterOid?: string;
}
export interface PublicationProjection {
  /** Host-registered content replacement; never a maintenance field exemption. */
  contentReplacement?: import('./services/publication/contracts').PublicationContentReplacement;
  /** Trusted host-resolved persistence actor; historical approval attribution is never substituted. */
  persistenceIdentity?: { username: string; userType: string };
  brandId: string;
  oid: string;
  expectedRevision: number;
  sourceRevision: number;
  fields: Record<string, unknown>;
  allowedPaths: string[];
  approvalId: string;
  approvalEpoch: number;
  destinationId: string;
  generation: number;
  workflowDecisionId?: string;
  workflowDecision?: { operation: 'claim' | 'finish'; decision: PublicationWorkflowDecision };
}
