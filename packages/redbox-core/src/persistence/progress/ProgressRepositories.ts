/** J1 status data only. Progress writes do not transact with jobs or record storage. */
export interface ProgressRow extends Record<string, unknown> {
  id: string;
  name: string;
  branding: string;
  started_by: string;
  status?: string;
  currentIdx?: number;
  targetIdx?: number;
  createdAt?: string;
  updatedAt?: string;
}
export interface WorkspaceStatus extends Record<string, unknown> {
  id: string;
  name: string;
  recordType: string;
  started_by: string;
  service: string;
  method: string;
  args: unknown;
  status?: string;
}
/** Existing progress-screen criteria; scoped to this domain, never a collection selector. */
export type ProgressQuery = Record<string, unknown>;
export interface ProgressRepositories {
  progress: {
    startProgress(values: Record<string, unknown>): Promise<ProgressRow>;
    reviseProgress(criteria: ProgressQuery, values: Record<string, unknown>): Promise<ProgressRow[]>;
    listProgress(criteria: ProgressQuery): Promise<ProgressRow[]>;
    removeProgress(criteria: ProgressQuery): Promise<void>;
  };
  workspaces: {
    registerWork(values: Record<string, unknown>): Promise<WorkspaceStatus>;
    reviseStatus(id: string, values: Record<string, unknown>): Promise<WorkspaceStatus[]>;
    listStatus(status: string, recordType?: string): Promise<WorkspaceStatus[]>;
    removeWork(id: string): Promise<void>;
  };
}
