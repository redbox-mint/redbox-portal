import { isRecord } from '../helpers';

type SearchQueryRecord = Record<string, unknown>;

function toSearchFieldNames(value: unknown): string[] {
    if (Array.isArray(value)) {
        return value.flatMap(item => toSearchFieldNames(item));
    }
    if (typeof value !== 'string') {
        return [];
    }
    return value
        .split(',')
        .map(name => name.trim())
        .filter(name => name.length > 0);
}

function getSearchFieldMap(source: SearchQueryRecord, fieldName: 'exactNames' | 'facetNames', legacyPrefix: 'exact_' | 'facet_') {
    const rawValue = source[fieldName];
    if (isRecord(rawValue)) {
        return Object.entries(rawValue).reduce((acc, [name, value]) => {
            acc[name] = value;
            return acc;
        }, {} as Record<string, unknown>);
    }

    const normalized: Record<string, unknown> = {};
    for (const field of toSearchFieldNames(rawValue)) {
        const legacyKey = `${legacyPrefix}${field}`;
        if (Object.prototype.hasOwnProperty.call(source, legacyKey)) {
            normalized[field] = source[legacyKey];
        }
    }

    for (const [key, value] of Object.entries(source)) {
        if (!key.startsWith(legacyPrefix)) {
            continue;
        }
        const field = key.slice(legacyPrefix.length).trim();
        if (field && !Object.prototype.hasOwnProperty.call(normalized, field)) {
            normalized[field] = value;
        }
    }

    return normalized;
}

export function normalizeSearchQuery(query: unknown): SearchQueryRecord {
    const source = isRecord(query) ? query : {};
    return {
        ...source,
        exactNames: getSearchFieldMap(source, 'exactNames', 'exact_'),
        facetNames: getSearchFieldMap(source, 'facetNames', 'facet_'),
    };
}