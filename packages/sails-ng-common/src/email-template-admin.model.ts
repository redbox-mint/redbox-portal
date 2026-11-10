/** Shared JSON contracts for the email template Admin application. */
export interface EmailAdminContent {
  subject: string;
  body: string;
  format: 'html' | 'text';
}
export interface EmailAdminToken {
  id: string;
  revision: number;
}
export interface EmailAdminActor {
  id: string;
  name: string;
}
export interface EmailAdminDiagnostic {
  code: string;
  field: 'subject' | 'body' | 'context';
  reason: string;
  line: number;
  column: number;
}
export interface EmailAdminChange {
  updatedBy: string | null;
  updatedByName: string | null;
  updatedAt: string | null;
}
export interface EmailAdminLive extends EmailAdminContent, EmailAdminChange {
  token: EmailAdminToken;
  defaultHash: string | null;
}
export interface EmailAdminDraft extends EmailAdminContent, EmailAdminChange {
  draftRevision: number;
  baseVersion: EmailAdminToken | null;
  restoredFromVersion: number | null;
}
export interface EmailAdminConsistency {
  code: 'INCOMPLETE_LIVE_TRANSITION' | 'PUBLISHED_DRAFT_RETAINED';
  version: number;
}
export interface EmailAdminCurrent {
  live: ({ token: EmailAdminToken } & EmailAdminChange) | null;
  draft: ({ draftRevision: number } & EmailAdminChange) | null;
  latestVersion: number;
  lastChange: EmailAdminChange | null;
}
export interface EmailAdminHelp {
  contextRoots: string[];
  helpers: string[];
  maxSubjectBytes: number;
  maxBodyBytes: number;
  maxContextBytes: number;
}
export interface EmailAdminEditorState {
  templateId: string;
  suppliedDefault: EmailAdminContent;
  live: EmailAdminLive | null;
  draft: EmailAdminDraft | null;
  defaultUpdated: boolean;
  invalid: boolean;
  diagnostics: EmailAdminDiagnostic[];
  consistency: EmailAdminConsistency[];
  help: EmailAdminHelp;
  latestVersion: number;
  historyMaxVersions: number;
}
export interface EmailAdminCatalogueEntry extends EmailAdminChange {
  templateId: string;
  description: string;
  source: 'default' | 'override';
  liveVersion: number | null;
  latestVersion: number;
  hasDraft: boolean;
  draftRevision: number | null;
  invalid: boolean;
  defaultUpdated: boolean;
  consistency: EmailAdminConsistency[];
}
export interface EmailAdminHistory {
  version: number;
  event: 'publish' | 'reset' | 'restore-published';
  subject: string | null;
  body: string | null;
  format: 'html' | 'text' | null;
  restoredFromVersion: number | null;
  defaultHash: string;
  actorId: string;
  actorDisplayName: string;
  createdAt: string;
  live: boolean;
  applied: boolean;
}
export interface EmailAdminPreview {
  subject: string;
  html?: string;
  text?: string;
  sanitiserRemovals: Array<{ element?: string; attribute?: string }>;
  diagnostics: EmailAdminDiagnostic[];
}
export interface EmailAdminErrorResponse {
  error: { code: string; message: string };
  diagnostics: EmailAdminDiagnostic[];
  current?: EmailAdminCurrent;
}
export interface EmailAdminDraftRequest {
  content: EmailAdminContent;
  expectedDraftRevision: number | null;
}
export interface EmailAdminDraftRevisionRequest {
  expectedDraftRevision: number | null;
}
export interface EmailAdminPublishRequest {
  expectedDraftRevision: number;
  expectedLiveToken: EmailAdminToken | null;
}
export interface EmailAdminResetRequest {
  expectedLiveToken: EmailAdminToken;
}
export interface EmailAdminContentRequest {
  content: EmailAdminContent;
}
export interface EmailAdminPreviewRequest extends EmailAdminContentRequest {
  context: string;
}
export interface EmailAdminDraftResponse {
  draft: EmailAdminDraft;
  diagnostics: EmailAdminDiagnostic[];
}
export interface EmailAdminMutationResponse {
  state: EmailAdminEditorState;
  draftRetained: boolean;
}
export interface EmailAdminRecordSearch {
  records: Array<{ oid: string; title: string }>;
  page: number;
  hasMore: boolean;
}

export interface EmailAdminDiscardRequest {
  expectedDraftRevision: number;
}
export interface EmailAdminDiscardResponse {
  discarded: true;
}
export interface EmailAdminCatalogueResponse {
  templates: EmailAdminCatalogueEntry[];
}
export interface EmailAdminHistoryResponse {
  versions: EmailAdminHistory[];
}
export interface EmailAdminValidationResponse {
  diagnostics: EmailAdminDiagnostic[];
}
export interface EmailAdminRecordContextResponse {
  context: Record<string, unknown>;
}
