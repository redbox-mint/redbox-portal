import { Injectable, inject } from '@angular/core';
import {
  FormFieldCompMapEntry,
  ITranslationOptions,
  TranslationService,
} from '@researchdatabox/portal-ng-common';
import {
  applyRecordValueChanges,
  canonicallyEqualRecordValues,
  diffRecordValuesForConcurrency,
  rebaseRecordValues,
  recordValuePathsOverlap,
  RecordValueChange,
  RecordValuePath,
} from '@researchdatabox/sails-ng-common';
import { FormConflictState, immutableFormMetadata } from './form-concurrency-state';

export type FormConflictChoice = 'mine' | 'latest';

export interface FormConflictRenderedValue {
  readonly summary: string;
  readonly details: readonly string[];
}

export interface FormConflictReviewItem {
  readonly id: string;
  readonly path: Readonly<RecordValuePath>;
  readonly label: string;
  readonly wholeValue: boolean;
  readonly mine: FormConflictRenderedValue;
  readonly latest: FormConflictRenderedValue;
}

export interface FormConflictReviewProjection {
  readonly requestId: string;
  readonly items: readonly FormConflictReviewItem[];
  readonly candidateWithNonOverlappingChanges: Readonly<Record<string, unknown>>;
  readonly local: Readonly<Record<string, unknown>>;
  readonly latest: Readonly<Record<string, unknown>>;
}

interface LocatedValue {
  readonly exists: boolean;
  readonly value: unknown;
}

interface OptionDefinition {
  readonly label: string;
  readonly value: unknown;
}

/**
 * Builds data-only, current-form-aware review projections and resolved
 * candidates. The service never grants write authority: callers submit its
 * candidate through the normal validation and conditional save path.
 */
@Injectable({ providedIn: 'root' })
export class FormConflictReviewService {
  private readonly translationService = inject(TranslationService);

  public project(
    conflict: FormConflictState | null,
    local: Readonly<Record<string, unknown>>,
    componentEntries: readonly FormFieldCompMapEntry[]
  ): FormConflictReviewProjection | null {
    if (!conflict?.latest || (conflict.status !== 'stale' && conflict.status !== 'reviewing')) {
      return null;
    }

    const rebase = rebaseRecordValues(conflict.base, local, conflict.latest);
    const itemsById = new Map<string, FormConflictReviewItem>();
    for (const overlap of rebase.unresolvedOverlaps) {
      const path = [...overlap.path];
      const id = this.pathId(path);
      if (itemsById.has(id)) {
        continue;
      }
      const entry = this.findCurrentEntry(path, componentEntries);
      const mine = this.valueAtPath(local, path);
      const latest = this.valueAtPath(conflict.latest, path);
      const wholeValue = Array.isArray(mine.value) || Array.isArray(latest.value);
      itemsById.set(id, {
        id,
        path,
        label: this.entryLabel(entry, path),
        wholeValue,
        mine: this.renderValue(mine, path, componentEntries, wholeValue),
        latest: this.renderValue(latest, path, componentEntries, wholeValue),
      });
    }

    return {
      requestId: conflict.requestId,
      items: [...itemsById.values()],
      candidateWithNonOverlappingChanges: immutableFormMetadata(rebase.candidate),
      local: immutableFormMetadata(local),
      latest: immutableFormMetadata(conflict.latest),
    };
  }

  /**
   * Apply every selected `mine` conflict domain to the already-rebased
   * candidate. `latest` choices need no patch because the candidate starts
   * from the latest projection. Missing or stale choices fail closed.
   */
  public resolve(
    projection: FormConflictReviewProjection,
    choices: Readonly<Record<string, FormConflictChoice>>
  ): Record<string, unknown> | null {
    const expectedIds = new Set(projection.items.map(item => item.id));
    if (
      Object.keys(choices).some(id => !expectedIds.has(id)) ||
      projection.items.some(item => choices[item.id] !== 'mine' && choices[item.id] !== 'latest')
    ) {
      return null;
    }

    // Latest-to-local changes: the candidate already starts from latest, so a
    // `mine` domain only needs the changes that move it back to the local value.
    const localChanges = diffRecordValuesForConcurrency(projection.latest, projection.local);
    const selectedMineChanges: RecordValueChange[] = [];
    for (const item of projection.items) {
      if (choices[item.id] !== 'mine') {
        continue;
      }
      for (const change of localChanges) {
        if (
          recordValuePathsOverlap(change.path, item.path) &&
          !selectedMineChanges.some(selected => this.sameChange(selected, change))
        ) {
          selectedMineChanges.push(change);
        }
      }
    }

    return applyRecordValueChanges(
      projection.candidateWithNonOverlappingChanges as Record<string, unknown>,
      selectedMineChanges
    );
  }

  private findCurrentEntry(
    path: readonly (string | number)[],
    entries: readonly FormFieldCompMapEntry[]
  ): FormFieldCompMapEntry | undefined {
    let best: FormFieldCompMapEntry | undefined;
    for (const entry of this.flattenEntries(entries)) {
      const entryPath = entry.lineagePaths?.dataModel ?? [];
      if (entryPath.length === 0 || entryPath.length > path.length || !this.isPathPrefix(entryPath, path)) {
        continue;
      }
      if (!best || entryPath.length > (best.lineagePaths?.dataModel.length ?? 0)) {
        best = entry;
      }
    }
    return best;
  }

  private flattenEntries(entries: readonly FormFieldCompMapEntry[]): FormFieldCompMapEntry[] {
    const queue = [...entries];
    const result: FormFieldCompMapEntry[] = [];
    const seen = new Set<FormFieldCompMapEntry>();
    while (queue.length > 0) {
      const entry = queue.shift();
      if (!entry || seen.has(entry)) {
        continue;
      }
      seen.add(entry);
      result.push(entry);
      queue.push(...(entry.component?.formFieldCompMapEntries ?? []));
    }
    return result;
  }

  private entryLabel(entry: FormFieldCompMapEntry | undefined, path: readonly (string | number)[]): string {
    const layoutConfig = this.asRecord(entry?.compConfigJson?.layout?.config);
    const componentConfig = this.asRecord(entry?.compConfigJson?.component?.config);
    const configured = layoutConfig?.['label'] ?? componentConfig?.['label'];
    if (typeof configured === 'string' && configured.trim().length > 0) {
      return this.translate(configured.trim());
    }
    const entryName = entry?.compConfigJson?.name?.trim();
    const fallbackSegment = [...path].reverse().find(segment => typeof segment === 'string');
    const fallback =
      entryName ||
      (typeof fallbackSegment === 'string'
        ? fallbackSegment
        : this.translateKey('@form-conflict-value-changed-field', 'Changed field'));
    return this.humanize(fallback);
  }

  private renderValue(
    located: LocatedValue,
    path: readonly (string | number)[],
    entries: readonly FormFieldCompMapEntry[],
    wholeValue: boolean
  ): FormConflictRenderedValue {
    if (!located.exists) {
      return { summary: this.translateKey('@form-conflict-value-not-present', 'Not present'), details: [] };
    }
    if (located.value === undefined || located.value === null) {
      return { summary: this.translateKey('@form-conflict-value-no-value', 'No value'), details: [] };
    }
    if (located.value === '') {
      return { summary: this.translateKey('@form-conflict-value-empty-text', 'Empty text'), details: [] };
    }

    if (Array.isArray(located.value)) {
      return {
        summary: this.translateKey(
          '@form-conflict-value-item-count',
          `${located.value.length} ${located.value.length === 1 ? 'item' : 'items'}`,
          { count: located.value.length }
        ),
        details: located.value.map(
          (value, index) => `${index + 1}. ${this.renderValueAtPath(value, [...path, index], entries)}`
        ),
      };
    }
    if (wholeValue && this.asRecord(located.value)) {
      return {
        summary: this.translateKey('@form-conflict-value-item-count', '1 item', { count: 1 }),
        details: [this.renderValueAtPath(located.value, path, entries)],
      };
    }
    return { summary: this.renderValueAtPath(located.value, path, entries), details: [] };
  }

  private renderValueAtPath(
    value: unknown,
    path: readonly (string | number)[],
    entries: readonly FormFieldCompMapEntry[]
  ): string {
    const options = this.entryOptions(this.findCurrentEntry(path, entries));
    const option = options.find(candidate => canonicallyEqualRecordValues(candidate.value, value));
    if (option) {
      return this.translate(option.label);
    }
    if (typeof value === 'string') {
      return value.length > 0
        ? value
        : this.translateKey('@form-conflict-value-not-provided', 'Not provided');
    }
    if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
      return String(value);
    }
    if (Array.isArray(value)) {
      return value.map((item, index) => this.renderValueAtPath(item, [...path, index], entries)).join(', ');
    }
    const record = this.asRecord(value);
    if (record) {
      const recordEntries = Object.entries(record);
      if (recordEntries.length === 0) {
        return this.translateKey('@form-conflict-value-not-provided', 'Not provided');
      }
      return recordEntries
        .map(([key, child]) => {
          const childPath = [...path, key];
          const childEntry = this.findCurrentEntry(childPath, entries);
          return `${this.entryLabel(childEntry, childPath)}: ${this.renderValueAtPath(child, childPath, entries)}`;
        })
        .join('; ');
    }
    return String(value);
  }

  private entryOptions(entry: FormFieldCompMapEntry | undefined): OptionDefinition[] {
    const config = this.asRecord(entry?.compConfigJson?.component?.config);
    const options = config?.['options'];
    if (!Array.isArray(options)) {
      return [];
    }
    const result: OptionDefinition[] = [];
    for (const option of options) {
      const typed = this.asRecord(option);
      if (typed && typeof typed['label'] === 'string' && Object.hasOwn(typed, 'value')) {
        result.push({ label: typed['label'], value: typed['value'] });
      }
    }
    return result;
  }

  private valueAtPath(value: unknown, path: readonly (string | number)[]): LocatedValue {
    let current = value;
    for (const segment of path) {
      const container = this.asRecordOrArray(current);
      if (!container || !Object.prototype.hasOwnProperty.call(container, segment)) {
        return { exists: false, value: undefined };
      }
      current = container[segment];
    }
    return { exists: true, value: current };
  }

  private pathId(path: readonly (string | number)[]): string {
    if (path.length === 0) {
      return 'record-root';
    }
    // `/` cannot survive encodeURIComponent, so it separates segments without a
    // field name ever being able to forge a different path's identifier.
    return path
      .map(segment => `${typeof segment === 'number' ? 'n' : 's'}-${encodeURIComponent(String(segment))}`)
      .join('/');
  }

  private isPathPrefix(prefix: readonly (string | number)[], path: readonly (string | number)[]): boolean {
    return prefix.every((segment, index) => {
      const pathSegment = path[index];
      return (
        String(segment) === String(pathSegment) || (typeof pathSegment === 'number' && /^\d+$/.test(String(segment)))
      );
    });
  }

  private sameChange(first: RecordValueChange, second: RecordValueChange): boolean {
    return (
      first.kind === second.kind &&
      first.path.length === second.path.length &&
      first.path.every((segment, index) => segment === second.path[index])
    );
  }

  private translate(value: string): string {
    const translated = this.translationService.t(value);
    const text = translated?.toString().trim();
    return text || value;
  }

  private translateKey(key: string, fallback: string, options?: ITranslationOptions): string {
    const translated = this.translationService.t(key, fallback, options);
    const text = translated?.toString().trim();
    return text || fallback;
  }

  private humanize(value: string): string {
    const spaced = value
      .replace(/[_-]+/g, ' ')
      .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
      .trim();
    return spaced.length > 0
      ? `${spaced.charAt(0).toUpperCase()}${spaced.slice(1)}`
      : this.translateKey('@form-conflict-value-changed-field', 'Changed field');
  }

  private asRecord(value: unknown): Record<string, unknown> | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return null;
    }
    return value as Record<string, unknown>;
  }

  private asRecordOrArray(value: unknown): Record<string | number, unknown> | null {
    if (!value || typeof value !== 'object') {
      return null;
    }
    return value as Record<string | number, unknown>;
  }
}
