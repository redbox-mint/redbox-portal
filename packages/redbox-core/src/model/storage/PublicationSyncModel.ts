import type {
  PublicationBinding,
  PublicationCompletionEvidence,
  PublicationObject,
  PublicationOperation,
  PublicationSourceReference,
  PublicationWorkKey,
  PublicationWorkStatus,
} from '../../services/publication/contracts';

/** Native publication storage owns indexes and all conditional state/lease writes. */
export interface PublicationSyncModel extends PublicationWorkKey {
  schemaVersion: 1;
  providerId: string;
  providerStateVersion: number;
  providerState: PublicationObject;
  revision: number;
  sourceGeneration: number;
  sourceRevision: number;
  approvalId: string;
  approvalEpoch: number;
  sourceDigest: string;
  source: PublicationSourceReference | null;
  recoverySources: PublicationSourceReference[];
  configurationDigest: string;
  targetFingerprint: string;
  lease: { owner: string; token: string; expiresAt: number } | null;
  dispatchUntil: number;
  nextActionAt: number | null;
  work: Record<
    'synchronise' | 'observe' | 'maintenance',
    {
      requested: number;
      processed: number;
      dueAt: number | null;
    }
  >;
  status: PublicationWorkStatus;
  waitingReason?: string;
  retry?: {
    kind?: 'synchronise' | 'observe' | 'maintenance';
    category: string;
    attempts: number;
    firstAt: string;
    lastAt: string;
    exhausted: boolean;
  };
  retryEpisodes?: Partial<
    Record<'synchronise' | 'observe' | 'maintenance', NonNullable<PublicationSyncModel['retry']>>
  >;
  binding?: PublicationBinding;
  remoteNamespace?: string;
  remoteObjectId?: string;
  operations: PublicationOperation[];
  /** Refused adapter receipts, retained separately from authoritative intent/outcome evidence. */
  operationEvidenceFailures?: Array<{ operationId: string; field: string; reported: unknown; at: string }>;
  completion?: PublicationCompletionEvidence;
  /** Durable local coordination obligation; independent of provider synchronisation work. */
  workflowPending?: boolean;
  links: Record<string, string>;
  audit?: {
    episodeId: string;
    closed: boolean;
    exported?: 'started' | 'terminal';
    startedAt?: string;
    providerId?: string;
    approvalId?: string;
    approvalEpoch?: number;
    sourceGeneration?: number;
    sourceRevision?: number;
    terminalStatus?: string;
    completedAt?: string;
    operationId?: string;
    reason?: string;
    summaries?: Array<{ category: string; message: string; evidence?: PublicationObject }>;
  };
  correctionReferences: string[];
}
