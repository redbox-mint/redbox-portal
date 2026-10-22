import type {
  EntryFilter,
  EntryLookup,
  VocabularyFilter,
  SourceFilter,
  CrosswalkFilter,
} from './VocabularyRepositories';
/** Closed domain search/selection to loaded-model criteria. Never accepts arbitrary operators. */
export function vocabularySelection(filter: VocabularyFilter): object {
  const { search, ...equal } = filter;
  return {
    ...equal,
    ...(search === undefined ? {} : { or: [{ name: { contains: search } }, { slug: { contains: search } }] }),
  };
}
export function entrySelection(filter: EntryFilter): object {
  const { search, parent, ...equal } = filter;
  return {
    ...equal,
    ...(parent === undefined ? {} : { parent: Array.isArray(parent) ? { in: [...parent] } : parent }),
    ...(search === undefined ? {} : { labelLower: { contains: search } }),
  };
}
export function entryLookup(lookup: EntryLookup): object {
  const { notation, ...equal } = lookup;
  return {
    ...equal,
    ...(notation === undefined ? {} : { or: [{ identifier: notation }, { valueLower: notation.toLowerCase() }] }),
  };
}
export function sourceSelection(filter: SourceFilter): object {
  const { search, ...equal } = filter;
  return { ...equal, ...(search === undefined ? {} : { displayName: { contains: search } }) };
}
export function crosswalkSelection(filter: CrosswalkFilter): object {
  const { search, ...equal } = filter;
  return { ...equal, ...(search === undefined ? {} : { name: { contains: search } }) };
}
