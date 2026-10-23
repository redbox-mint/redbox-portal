/** Plain vocabulary data; no loaded model, query, BSON, session or connection. */
export interface VocabularyData extends Record<string, unknown> {
  id: string;
  createdAt?: string;
  updatedAt?: string;
}
export type VocabularyValues = Record<string, unknown>;
export interface VocabularyRow extends VocabularyData {
  branding: string;
  description?: string;
  entries?: EntryRow[];
  lastSyncedAt?: string;
  figshareSourceKey?: string | null;
  name: string;
  owner?: string;
  rvaSourceKey?: string | null;
  slug: string;
  source?: 'local' | 'rva' | 'external' | string;
  sourceId?: string;
  sourceVersionId?: string;
  type?: 'flat' | 'tree' | string;
}

export interface EntryRow extends VocabularyData {
  children?: EntryRow[];
  identifier?: string;
  label: string;
  labelLower: string;
  order?: number;
  historical?: boolean;
  parent?: string | null;
  value: string;
  valueLower: string;
  vocabulary: string;
}

export interface SourceRow extends VocabularyData {
  archived?: boolean;
  branding: string;
  connectionKey?: string;
  createdBy: string;
  displayName: string;
  lastSyncRun?: string;
  lastSyncedAt?: string;
  remoteHash?: string;
  scope: string;
  taxonomyId: string;
  updatedBy: string;
  vocabulary: string;
}

export interface CategoryRow extends VocabularyData {
  categoryId: number;
  contentHash: string;
  entry: string;
  firstSeenAt: string;
  historical?: boolean;
  lastSeenAt: string;
  parentSourceId?: string;
  path?: string[];
  selectable?: boolean;
  source: string;
  sourceId: string;
  taxonomyId: string;
}

export interface CrosswalkRow extends VocabularyData {
  approvedAt?: string;
  approvedBy?: string;
  approvedRevision?: number | null;
  branding: string;
  figshareSource: string;
  localVocabulary: string;
  name: string;
  status: string;
  updatedBy: string;
  workingRevision: number;
}

export interface MappingRow extends VocabularyData {
  approvedAt?: string;
  approvedBy?: string;
  crosswalk: string;
  evidence?: Record<string, unknown>;
  figshareCategory: string;
  localEntry: string;
  matchType: string;
  revision: number;
  status: string;
}

export interface SyncRunRow extends VocabularyData {
  appliedAt?: string;
  appliedBy?: string;
  baseHash?: string;
  branding: string;
  createLocalClone?: boolean;
  crosswalk?: string | null;
  diff?: Record<string, unknown>;
  errorCode?: string;
  errorDetail?: string;
  expiresAt: string;
  localCloneName?: string;
  localCloneSlug?: string;
  localVocabulary?: string | null;
  normalizedSnapshot?: unknown[];
  normalizerVersion: string;
  proposals?: unknown[];
  remoteHash?: string;
  requestedBy: string;
  result?: Record<string, unknown>;
  scope: string;
  source?: string | null;
  state: string;
  summary?: Record<string, unknown>;
  taxonomyId: string;
  warnings?: unknown[];
}

/** Closed entity selections, independent of a datastore query language. */
export interface VocabularyLookup {
  id?: string;
  branding?: string;
  slug?: string;
  rvaSourceKey?: string;
}
export interface VocabularyFilter {
  type?: string;
  source?: string;
  search?: string;
}
export interface EntryLookup {
  id?: string;
  vocabulary?: string;
  identifier?: string;
  valueLower?: string;
  notation?: string;
}
export interface EntryFilter {
  id?: readonly string[];
  vocabulary?: string;
  parent?: string | null | readonly string[];
  historical?: boolean;
  search?: string;
}
export interface SourceLookup {
  id?: string;
  branding?: string;
  vocabulary?: string;
  scope?: string;
  taxonomyId?: string;
}
export interface SourceFilter {
  branding?: string;
  scope?: string;
  search?: string;
}
export interface CategoryLookup {
  id: string;
  source?: string;
}
export interface CategoryFilter {
  id?: readonly string[];
  source?: string;
  historical?: boolean;
  selectable?: boolean;
}
export interface CrosswalkLookup {
  id?: string;
  branding?: string;
  name?: string;
  localVocabulary?: string;
  figshareSource?: string;
}
export interface CrosswalkFilter {
  branding?: string;
  status?: string;
  localVocabulary?: string;
  figshareSource?: string;
  search?: string;
}
export interface MappingFilter {
  crosswalk?: string;
  revision?: number;
  status?: string;
  localEntry?: string | readonly string[];
  figshareCategory?: string;
}
export interface MappingLookup {
  crosswalk: string;
  revision: number;
  localEntry: string;
  figshareCategory: string;
}
export interface RunLookup {
  id: string;
  branding?: string;
}
export interface RunFilter {
  branding?: string;
  source?: string;
}
export interface VocabularyPage {
  sort?: string | Array<Record<string, 'ASC' | 'DESC'>>;
  offset?: number;
  limit?: number;
}
export interface VocabularyRepositories {
  getVocabulary(lookup: VocabularyLookup): Promise<VocabularyRow | null>;
  listVocabularies(filter: VocabularyFilter, page?: VocabularyPage): Promise<VocabularyRow[]>;
  countVocabularies(filter: VocabularyFilter): Promise<number>;
  createVocabulary(values: VocabularyValues): Promise<VocabularyRow>;
  reviseVocabulary(id: string, values: VocabularyValues): Promise<VocabularyRow | null>;
  removeVocabulary(id: string): Promise<void>;
  getEntry(lookup: EntryLookup): Promise<EntryRow | null>;
  listEntries(filter: EntryFilter, page?: VocabularyPage): Promise<EntryRow[]>;
  countEntries(filter: EntryFilter): Promise<number>;
  createEntry(values: VocabularyValues): Promise<EntryRow>;
  createEntries(values: VocabularyValues[]): Promise<EntryRow[]>;
  reviseEntry(id: string, values: VocabularyValues): Promise<EntryRow | null>;
  removeVocabularyEntries(vocabulary: string): Promise<void>;
  getSource(lookup: SourceLookup): Promise<SourceRow | null>;
  listSources(filter: SourceFilter, page?: VocabularyPage): Promise<SourceRow[]>;
  countSources(filter: SourceFilter): Promise<number>;
  createSource(values: VocabularyValues): Promise<SourceRow>;
  reviseSource(id: string, values: VocabularyValues): Promise<SourceRow | null>;
  removeSource(id: string): Promise<void>;
  getCategory(lookup: CategoryLookup): Promise<CategoryRow | null>;
  listCategories(filter: CategoryFilter): Promise<CategoryRow[]>;
  countCategories(filter: CategoryFilter): Promise<number>;
  createCategory(values: VocabularyValues): Promise<CategoryRow>;
  reviseCategory(id: string, values: VocabularyValues): Promise<CategoryRow | null>;
  removeSourceCategories(source: string): Promise<void>;
  getCrosswalk(lookup: CrosswalkLookup): Promise<CrosswalkRow | null>;
  listCrosswalks(filter: CrosswalkFilter, page?: VocabularyPage): Promise<CrosswalkRow[]>;
  countCrosswalks(filter: CrosswalkFilter): Promise<number>;
  createCrosswalk(values: VocabularyValues): Promise<CrosswalkRow>;
  reviseCrosswalk(id: string, values: VocabularyValues): Promise<CrosswalkRow | null>;
  removeCrosswalk(id: string): Promise<void>;
  getMapping(lookup: MappingLookup): Promise<MappingRow | null>;
  listMappings(filter: MappingFilter): Promise<MappingRow[]>;
  countMappings(filter: MappingFilter): Promise<number>;
  createMapping(values: VocabularyValues): Promise<MappingRow>;
  reviseMapping(id: string, values: VocabularyValues): Promise<MappingRow | null>;
  removeMappings(filter: MappingFilter): Promise<void>;
  getRun(lookup: RunLookup): Promise<SyncRunRow | null>;
  listRuns(filter: RunFilter, page?: VocabularyPage): Promise<SyncRunRow[]>;
  countRuns(filter: RunFilter): Promise<number>;
  createRun(values: VocabularyValues): Promise<SyncRunRow>;
  changeRunState(id: string, from: string, values: VocabularyValues): Promise<SyncRunRow | null>;
  expirePreviews(branding: string, before: string): Promise<void>;
}
