/** Configuration consumed by persistence; domain and host settings remain with their owners. */
export interface PersistenceConfiguration {
  datastores?: Record<string, unknown>;
  branding?: { variableAllowList?: string[] };
  [key: string]: unknown;
}

/** Identity and resources belong to this object, with no framework or process lifecycle. */
export interface PersistenceOwner {
  readonly config: PersistenceConfiguration;
  readonly log: { warn(message: string): void };
}
