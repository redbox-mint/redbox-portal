/** Existing ledger fields. Times are numeric milliseconds; executedBy is the host name. */
export interface MigrationExecution {
  name: string;
  source?: string;
  appVersion?: string;
  ranAt: number;
  durationMs?: number;
  executedBy?: string;
}

/** Umzug history operations, independent of domain-service initialization. */
export interface MigrationLedgerRepository {
  /** History order is ranAt ascending; migration body order remains lexical in Umzug. */
  executedNames(): Promise<string[]>;
  isExecuted(name: string): Promise<boolean>;
  /** Records success after the body. Uniqueness does not make bodies exactly-once. */
  recordExecution(entry: MigrationExecution): Promise<void>;
  removeExecution(name: string): Promise<void>;
}
