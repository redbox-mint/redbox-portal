import { DOCUMENT } from '@angular/common';
import { ElementRef, Injectable, OnDestroy, computed, inject, signal } from '@angular/core';
import { isString as _isString, isUndefined as _isUndefined } from 'lodash-es';
import { LineagePaths } from '@researchdatabox/sails-ng-common';
import { FormComponentEvent, FormComponentEventType } from '../form-state/events/form-component-event.types';

export type DebugInfo = {
  id: string,
  kind: 'form' | 'layout' | 'component',
  class: string,
  status: string,
  name: string,
  lineagePaths?: LineagePaths,
  componentAttributes?: Record<string, unknown>,
  layoutAttributes?: Record<string, unknown>,
  modelAttributes?: Record<string, unknown>,
  componentsLoaded?: boolean,
  viewInitialised?: boolean,
  isReady?: boolean,
  children?: DebugInfo[]
};

export type DebugEventItem = {
  id: string;
  timestamp: number;
  type: string;
  sourceId?: string;
  fieldId?: string;
  payload: Record<string, unknown>;
};

const FORM_DEBUG_QUERY_PARAM = 'formDebug';
const FORM_DEBUG_POPOUT_QUERY_PARAM = 'formDebugPopout';
const FORM_DEBUG_ENABLED_VALUES = new Set(['1', 'true', 'yes']);
const FORM_DEBUG_CHANNEL_NAME = 'rb-form-debug-events';

type FormDebugBridgeMessage = {
  scope: string;
  event: DebugEventItem;
};

@Injectable({ providedIn: 'root' })
export class FormDebugStateService implements OnDestroy {
  private readonly document = inject(DOCUMENT);
  private readonly debugScope = this.readDebugScopeFromUrl();
  private debugBroadcastChannel?: BroadcastChannel;

  isDebugEnabled = signal<boolean>(false);
  isDebugPopoutWindow = signal<boolean>(false);
  panelCollapsed = signal<boolean>(true);
  activeTab = signal<'model' | 'config' | 'events'>('model');

  debugFormComponents = signal<Record<string, unknown>>({});
  debugFormValues = signal<Record<string, unknown>>({});
  debugRawFormValues = signal<Record<string, unknown>>({});
  debugUseRawValues = signal<boolean>(false);
  debugShowTranslatedConfig = signal<boolean>(false);
  debugShowModelChanges = signal<boolean>(true);
  debugTranslatedFormConfigInitial = signal<Record<string, unknown>>({});
  debugTranslatedFormConfigCurrent = signal<Record<string, unknown>>({});
  debugModelCurrent = signal<Record<string, unknown>>({});
  debugModelPrevious = signal<Record<string, unknown>>({});
  debugModelChangedPaths = signal<string[]>([]);
  debugExpandedRows = signal<Record<string, boolean>>({});
  debugEventStreamEnabled = signal<boolean>(true);
  debugEventPaused = signal<boolean>(false);
  debugEventFilterType = signal<string>('');
  debugEventFilterFieldId = signal<string>('');
  debugEventFilterSourceId = signal<string>('');
  debugEventAutoScroll = signal<boolean>(true);
  debugEventMaxItems = signal<number>(200);
  debugEventSortField = signal<'timestamp' | 'type' | 'sourceId' | 'fieldId'>('timestamp');
  debugEventSortDirection = signal<'asc' | 'desc'>('desc');
  debugEvents = signal<DebugEventItem[]>([]);
  debugExpandedEventRows = signal<Record<string, boolean>>({});
  readonly debugEventTypes = Object.values(FormComponentEventType);

  readonly filteredDebugEvents = computed(() => {
    const typeFilter = this.debugEventFilterType().trim();
    const fieldFilter = this.debugEventFilterFieldId().trim().toLowerCase();
    const sourceFilter = this.debugEventFilterSourceId().trim().toLowerCase();
    const sortField = this.debugEventSortField();
    const sortDirection = this.debugEventSortDirection();
    const filtered = this.debugEvents().filter((event) => {
      if (typeFilter && event.type !== typeFilter) {
        return false;
      }
      if (fieldFilter && !String(event.fieldId ?? '').toLowerCase().includes(fieldFilter)) {
        return false;
      }
      if (sourceFilter && !String(event.sourceId ?? '').toLowerCase().includes(sourceFilter)) {
        return false;
      }
      return true;
    });
    return [...filtered].sort((left, right) => this.compareDebugEvents(left, right, sortField, sortDirection));
  });

  private debugEventCounter = 0;

  constructor() {
    this.initBroadcastBridge();
    this.refreshFromUrl();
  }

  ngOnDestroy(): void {
    this.debugBroadcastChannel?.close();
  }

  refreshFromUrl(): void {
    this.isDebugEnabled.set(this.readDebugEnabledFromUrl());
    const isPopout = this.readDebugPopoutFromUrl();
    this.isDebugPopoutWindow.set(isPopout);
    if (isPopout) {
      this.panelCollapsed.set(false);
    }
  }

  setTranslatedConfigSnapshot(value: unknown, resetInitial: boolean): void {
    const currentConfigSnapshot = this.safePlainObjectSnapshot(value);
    this.debugTranslatedFormConfigCurrent.set(currentConfigSnapshot);
    if (resetInitial || Object.keys(this.debugTranslatedFormConfigInitial()).length === 0) {
      this.debugTranslatedFormConfigInitial.set(this.safePlainObjectSnapshot(currentConfigSnapshot));
    }
  }

  setModelSnapshot(currentValue: unknown, captureModelPrevious: boolean): void {
    const currentSnapshot = this.safePlainObjectSnapshot(currentValue);
    const previousSnapshot = captureModelPrevious
      ? this.safePlainObjectSnapshot(this.debugModelCurrent())
      : this.debugModelPrevious();
    this.debugModelPrevious.set(this.safePlainObjectSnapshot(previousSnapshot));
    this.debugModelCurrent.set(currentSnapshot);
    this.debugModelChangedPaths.set(this.computeChangedPaths(previousSnapshot, currentSnapshot, { maxDepth: 5, maxPaths: 200 }));
  }

  setFormValueSnapshots(formValues: unknown, rawFormValues: unknown): void {
    this.debugFormValues.set(this.safePlainObjectSnapshot(formValues));
    this.debugRawFormValues.set(this.safePlainObjectSnapshot(rawFormValues));
  }

  setComponentDebugInfo(debugInfo: unknown): void {
    const debugInfoSnapshot = this.safePlainObjectSnapshot(debugInfo);
    this.debugFormComponents.set(debugInfoSnapshot);
    const validIds = new Set<string>();
    this.collectDebugRowIds(debugInfoSnapshot as DebugInfo, validIds);
    const expandedRows = this.debugExpandedRows();
    const prunedExpandedRows: Record<string, boolean> = {};
    for (const [id, expanded] of Object.entries(expandedRows)) {
      if (expanded && validIds.has(id)) {
        prunedExpandedRows[id] = true;
      }
    }
    this.debugExpandedRows.set(prunedExpandedRows);
  }

  toggleDebugExpandedRow(rowId: string): void {
    const current = this.debugExpandedRows();
    this.debugExpandedRows.set({
      ...current,
      [rowId]: !current[rowId]
    });
  }

  isDebugExpandedRow(rowId: string): boolean {
    return !!this.debugExpandedRows()?.[rowId];
  }

  captureDebugEvent(event: FormComponentEvent): void {
    if (!this.isDebugEnabled() || !this.debugEventStreamEnabled() || this.debugEventPaused()) {
      return;
    }

    const timestamp = typeof event.timestamp === 'number' ? event.timestamp : Date.now();
    const id = `${timestamp}-${++this.debugEventCounter}`;
    const eventItem: DebugEventItem = {
      id,
      timestamp,
      type: String(event.type ?? ''),
      sourceId: _isString(event.sourceId) ? event.sourceId : undefined,
      fieldId: _isString(event.fieldId) ? event.fieldId : undefined,
      payload: this.extractDebugEventPayload(event)
    };

    this.appendDebugEvent(eventItem);
    this.publishDebugBridgeEvent(eventItem);
  }

  extractDebugEventPayload(event: FormComponentEvent): Record<string, unknown> {
    const payload: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(event as unknown as Record<string, unknown>)) {
      if (key === 'type' || key === 'timestamp' || key === 'sourceId' || key === 'fieldId') {
        continue;
      }
      payload[key] = value;
    }
    return this.safePlainObjectSnapshot(payload);
  }

  clearDebugEvents(): void {
    this.debugEvents.set([]);
    this.debugExpandedEventRows.set({});
  }

  toggleDebugEventExpandedRow(id: string): void {
    const current = this.debugExpandedEventRows();
    this.debugExpandedEventRows.set({
      ...current,
      [id]: !current[id]
    });
  }

  isDebugEventExpandedRow(id: string): boolean {
    return !!this.debugExpandedEventRows()?.[id];
  }

  getFilteredDebugEvents(): DebugEventItem[] {
    return this.filteredDebugEvents();
  }

  setDebugEventMaxItems(value: number | string): void {
    const maxItems = this.coerceDebugEventMaxItems(value);
    this.debugEventMaxItems.set(maxItems);
    const current = this.debugEvents();
    if (current.length > maxItems) {
      const trimmed = current.slice(current.length - maxItems);
      this.debugEvents.set(trimmed);
      this.pruneDebugExpandedEventRows(trimmed);
    }
  }

  toggleDebugEventSort(field: 'timestamp' | 'type' | 'sourceId' | 'fieldId'): void {
    if (this.debugEventSortField() === field) {
      this.debugEventSortDirection.set(this.debugEventSortDirection() === 'asc' ? 'desc' : 'asc');
      return;
    }
    this.debugEventSortField.set(field);
    this.debugEventSortDirection.set(field === 'timestamp' ? 'desc' : 'asc');
  }

  getDebugEventSortIndicator(field: 'timestamp' | 'type' | 'sourceId' | 'fieldId'): string {
    if (this.debugEventSortField() !== field) {
      return '';
    }
    return this.debugEventSortDirection() === 'asc' ? '↑' : '↓';
  }

  formatDebugEventTimestamp(timestamp: number): string {
    try {
      return new Date(timestamp).toISOString();
    } catch {
      return '';
    }
  }

  isDebugRowExpandable(item?: DebugInfo): boolean {
    if (!item) {
      return false;
    }
    return !!(item.componentAttributes || item.layoutAttributes || item.modelAttributes || item.lineagePaths);
  }

  computeChangedPaths(
    previous: unknown,
    current: unknown,
    opts?: { maxDepth?: number; maxPaths?: number }
  ): string[] {
    const maxDepth = opts?.maxDepth ?? 5;
    const maxPaths = opts?.maxPaths ?? 200;
    const changedPaths: string[] = [];

    const pushPath = (path: string) => {
      if (changedPaths.length >= maxPaths) {
        return;
      }
      changedPaths.push(path || '(root)');
      if (changedPaths.length === maxPaths) {
        changedPaths.push('...truncated');
      }
    };

    const valuesDiffer = (left: unknown, right: unknown): boolean => {
      if (left === right) {
        return false;
      }
      if (typeof left !== 'object' || left === null || typeof right !== 'object' || right === null) {
        return true;
      }
      try {
        return JSON.stringify(left) !== JSON.stringify(right);
      } catch {
        return true;
      }
    };

    const walk = (left: unknown, right: unknown, path: string, depth: number) => {
      if (changedPaths.length >= maxPaths) {
        return;
      }

      if (depth >= maxDepth) {
        if (valuesDiffer(left, right)) {
          pushPath(path);
        }
        return;
      }

      if (Array.isArray(left) || Array.isArray(right)) {
        const leftArray = Array.isArray(left) ? left : [];
        const rightArray = Array.isArray(right) ? right : [];
        const maxLength = Math.max(leftArray.length, rightArray.length);
        for (let index = 0; index < maxLength; index++) {
          const nextPath = `${path}[${index}]`;
          walk(leftArray[index], rightArray[index], nextPath, depth + 1);
          if (changedPaths.length >= maxPaths) {
            return;
          }
        }
        return;
      }

      const leftIsObject = !!left && typeof left === 'object';
      const rightIsObject = !!right && typeof right === 'object';
      if (leftIsObject || rightIsObject) {
        const leftObject = leftIsObject ? left as Record<string, unknown> : {};
        const rightObject = rightIsObject ? right as Record<string, unknown> : {};
        const keys = new Set([...Object.keys(leftObject), ...Object.keys(rightObject)]);
        for (const key of keys) {
          const nextPath = path ? `${path}.${key}` : key;
          walk(leftObject[key], rightObject[key], nextPath, depth + 1);
          if (changedPaths.length >= maxPaths) {
            return;
          }
        }
        return;
      }

      if (valuesDiffer(left, right)) {
        pushPath(path);
      }
    };

    walk(previous, current, '', 0);
    return changedPaths;
  }

  safePlainObjectSnapshot(value: unknown): Record<string, unknown> {
    const cleaned = this.stripNonSerializable(value);
    if (!cleaned || typeof cleaned !== 'object') {
      return {};
    }
    try {
      return structuredClone(cleaned as Record<string, unknown>);
    } catch {
      try {
        return JSON.parse(JSON.stringify(cleaned)) as Record<string, unknown>;
      } catch {
        return {};
      }
    }
  }

  private readDebugEnabledFromUrl(): boolean {
    const rawHref = this.document?.location?.href;
    if (!rawHref) {
      return false;
    }
    try {
      const parsed = new URL(rawHref);
      const rawValue = parsed.searchParams.get(FORM_DEBUG_QUERY_PARAM);
      if (!rawValue) {
        return false;
      }
      return FORM_DEBUG_ENABLED_VALUES.has(rawValue.trim().toLowerCase());
    } catch {
      return false;
    }
  }

  private readDebugPopoutFromUrl(): boolean {
    const rawHref = this.document?.location?.href;
    if (!rawHref) {
      return false;
    }
    try {
      const parsed = new URL(rawHref);
      const rawValue = parsed.searchParams.get(FORM_DEBUG_POPOUT_QUERY_PARAM);
      if (!rawValue) {
        return false;
      }
      return FORM_DEBUG_ENABLED_VALUES.has(rawValue.trim().toLowerCase());
    } catch {
      return false;
    }
  }

  private readDebugScopeFromUrl(): string {
    const rawHref = this.document?.location?.href;
    if (!rawHref) {
      return '';
    }
    try {
      const parsed = new URL(rawHref);
      parsed.searchParams.delete(FORM_DEBUG_POPOUT_QUERY_PARAM);
      return `${parsed.pathname}?${parsed.searchParams.toString()}`;
    } catch {
      return '';
    }
  }

  private initBroadcastBridge(): void {
    if (typeof BroadcastChannel === 'undefined') {
      return;
    }
    this.debugBroadcastChannel = new BroadcastChannel(FORM_DEBUG_CHANNEL_NAME);
    this.debugBroadcastChannel.onmessage = (msg: MessageEvent<FormDebugBridgeMessage>) => {
      const data = msg?.data;
      if (!data || data.scope !== this.debugScope) {
        return;
      }
      if (!this.isDebugPopoutWindow()) {
        return;
      }
      this.appendDebugEvent(data.event);
    };
  }

  private publishDebugBridgeEvent(eventItem: DebugEventItem): void {
    if (this.isDebugPopoutWindow()) {
      return;
    }
    if (!this.debugBroadcastChannel || !this.debugScope) {
      return;
    }
    this.debugBroadcastChannel.postMessage({
      scope: this.debugScope,
      event: eventItem
    } as FormDebugBridgeMessage);
  }

  private appendDebugEvent(eventItem: DebugEventItem): void {
    const next = [...this.debugEvents(), eventItem];
    const maxItems = this.coerceDebugEventMaxItems(this.debugEventMaxItems());
    if (next.length > maxItems) {
      next.splice(0, next.length - maxItems);
    }
    this.debugEvents.set(next);
    this.pruneDebugExpandedEventRows(next);
  }

  private compareDebugEvents(
    left: DebugEventItem,
    right: DebugEventItem,
    field: 'timestamp' | 'type' | 'sourceId' | 'fieldId',
    direction: 'asc' | 'desc'
  ): number {
    const directionFactor = direction === 'asc' ? 1 : -1;
    if (field === 'timestamp') {
      return (left.timestamp - right.timestamp) * directionFactor;
    }

    const leftValue = String(left[field] ?? '');
    const rightValue = String(right[field] ?? '');
    const compareResult = leftValue.localeCompare(rightValue, undefined, { sensitivity: 'base' });
    if (compareResult !== 0) {
      return compareResult * directionFactor;
    }
    return (left.timestamp - right.timestamp) * -1;
  }

  private collectDebugRowIds(item: DebugInfo | undefined, result: Set<string>): void {
    if (!item) {
      return;
    }
    if (item.id) {
      result.add(item.id);
    }
    const children = item.children ?? [];
    for (const child of children) {
      this.collectDebugRowIds(child, result);
    }
  }

  private coerceDebugEventMaxItems(value: number | string): number {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed < 1) {
      return 1;
    }
    return Math.min(2000, Math.floor(parsed));
  }

  private pruneDebugExpandedEventRows(events: DebugEventItem[]): void {
    const validIds = new Set(events.map((item) => item.id));
    const expandedRows = this.debugExpandedEventRows();
    const prunedExpandedRows: Record<string, boolean> = {};
    for (const [id, expanded] of Object.entries(expandedRows)) {
      if (expanded && validIds.has(id)) {
        prunedExpandedRows[id] = true;
      }
    }
    this.debugExpandedEventRows.set(prunedExpandedRows);
  }

  private stripNonSerializable(value: unknown, visited: WeakSet<object> = new WeakSet<object>()): unknown {
    if (_isUndefined(value) || value === null) {
      return value;
    }
    if (typeof value === 'function' || typeof value === 'symbol') {
      return undefined;
    }
    if (typeof value === 'bigint') {
      return value.toString();
    }
    if (typeof value !== 'object') {
      return value;
    }
    if (value instanceof Date) {
      return value.toISOString();
    }
    if (value instanceof ElementRef) {
      return undefined;
    }

    const asObject = value as object;
    if (visited.has(asObject)) {
      return undefined;
    }
    visited.add(asObject);

    if (Array.isArray(value)) {
      return value
        .map(item => this.stripNonSerializable(item, visited))
        .filter(item => !_isUndefined(item));
    }

    const candidate = value as Record<string, unknown>;
    const result: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(candidate)) {
      const cleanedValue = this.stripNonSerializable(item, visited);
      if (!_isUndefined(cleanedValue)) {
        result[key] = cleanedValue;
      }
    }
    return result;
  }
}
