import { relatedDisplayPointerTokens } from '@researchdatabox/sails-ng-common';
import { relatedDisplayEmptyValue, setRelatedDisplayAbsent } from './form-state/related-records/related-display-control-state';
import { retainRelatedDisplayValues, relatedDisplayActive } from '@researchdatabox/sails-ng-common';
import { Injectable, inject } from '@angular/core';
import { AbstractControl, FormArray, FormGroup, ValueChangeEvent } from '@angular/forms';
import { get, has, isEqual, set, unset } from 'lodash-es';
import { LoggerService } from '@researchdatabox/portal-ng-common';
import { FormComponentsMap, FormService } from './form.service';
import { setControlValue } from './form-state/custom-set-value.control';

export type ServerSyncMode = 'always' | 'preserveLocalEdits' | 'never';
export type ServerSyncSkipReason =
  | 'not-in-server'
  | 'no-control'
  | 'excluded'
  | 'unchanged'
  | 'local-edit'
  | 'local-edit-during-sync'
  | 'set-failed';

export interface ServerSyncResult {
  patched: string[];
  skipped: Array<{ name: string; reason: ServerSyncSkipReason }>;
}

@Injectable({ providedIn: 'root' })
export class FormServerSyncService {
  private readonly formService = inject(FormService);
  private readonly logger = inject(LoggerService);

  public async applyServerMetadata(
    sentValue: Record<string, unknown>,
    serverValue: Record<string, unknown>,
    formDefMap: FormComponentsMap,
    form: FormGroup,
    mode: ServerSyncMode
  ): Promise<ServerSyncResult> {
    return this.syncServerMetadata(sentValue, serverValue, formDefMap, form, mode, false);
  }

  /** Replace every projected form control after an explicit discard/adopt decision. */
  public async replaceWithServerMetadata(
    serverValue: Record<string, unknown>,
    formDefMap: FormComponentsMap,
    form: FormGroup
  ): Promise<ServerSyncResult> {
    return this.syncServerMetadata({}, serverValue, formDefMap, form, 'always', true);
  }

  private async syncServerMetadata(
    sentValue: Record<string, unknown>,
    serverValue: Record<string, unknown>,
    formDefMap: FormComponentsMap,
    form: FormGroup,
    mode: ServerSyncMode,
    replaceMissing: boolean
  ): Promise<ServerSyncResult> {
    const result: ServerSyncResult = { patched: [], skipped: [] };
    if (mode === 'never') {
      return result;
    }

    const contract = formDefMap.formConfig?.relatedRecords;
    const initial = contract?.displayTargets.length ? form.getRawValue() : undefined;
    const targets = initial ? contract!.displayTargets.map(target => ({
        ...target,
        display: relatedDisplayActive(initial, contract!, target.relationId) ||
          relatedDisplayActive(serverValue, contract!, target.relationId),
        path: relatedDisplayPointerTokens(target.metadataPointer),
        reference: contract!.relations.find(relation => relation.relationId === target.relationId),
      })) : [];
    const originalServer = serverValue;
    if (targets.length) {
      serverValue = retainRelatedDisplayValues(serverValue, initial!, contract);
      for (const target of targets) {
        if (target.display && target.reference && !has(serverValue, target.reference.referenceTokens)) {
          set(serverValue, target.reference.referenceTokens, undefined);
        }
      }
    }
    const controls = formDefMap.withFormControl ?? {};
    const completeGroupMap = formDefMap.completeGroupMap ?? {};
    const classification = (path: string[]) => {
      if (targets.some(target => target.display && target.path.length <= path.length && target.path.every((token, index) => token === path[index]))) return 'display';
      if (targets.some(target => target.display && path.length < target.path.length && path.every((token, index) => token === target.path[index]))) return 'ancestor';
      return 'local';
    };
    // Compare only the non-target part of an atomic legacy ancestor. Display
    // changes must not affect its unchanged-echo or dirty decisions.
    const localView = (value: unknown, path: string[]): unknown => {
      if (classification(path) === 'display') return undefined;
      if (classification(path) !== 'ancestor' || value === null || typeof value !== 'object') return value;
      const result: Record<string, unknown> = {};
      for (const [name, child] of Object.entries(value)) {
        if (classification([...path, name]) !== 'display') result[name] = localView(child, [...path, name]);
      }
      return result;
    };
    const localDirty = (control: AbstractControl, path: string[]): boolean => {
      const kind = classification(path);
      if (kind === 'display') return false;
      if (kind === 'local' || !(control instanceof FormGroup)) return control.dirty;
      const children = Object.entries(control.controls);
      // A directly dirtied ancestor (pristine children) retains legacy atomic
      // protection. Dirtiness propagated solely from display children does not.
      return children.some(([name, child]) => localDirty(child, [...path, name])) ||
        (control.dirty && children.every(([, child]) => child.pristine));
    };
    const preserveReason = (control: AbstractControl, path: string[]): ServerSyncSkipReason | undefined => {
      const ancestor = classification(path) === 'ancestor';
      const comparison = ancestor ? originalServer : serverValue;
      const present = has(comparison, path);
      const sent = get(sentValue, path);
      const server = get(comparison, path);
      if (!present && !replaceMissing) return 'not-in-server';
      if (isEqual(ancestor ? localView(sent, path) : sent, ancestor ? localView(server, path) : server) &&
        (!replaceMissing || present)) return 'unchanged';
      if (mode === 'preserveLocalEdits' && (ancestor ? localDirty(control, path) : control.dirty)) return 'local-edit';
      return undefined;
    };
    type Target = typeof targets[number];
    const pendingTargets = new Map<Target, Record<string, unknown> | undefined>();
    const preservedDirty = new Set<AbstractControl>();
    const appliedTargets = new Map<Target, { reference: unknown; value: unknown; absent: boolean }>();
    const edits = new Map<Target, { value: unknown; version: number; local: boolean }>();
    const targetSubscriptions = targets.map(target => form.get(target.path)?.valueChanges.subscribe(value => {
      const control = form.get(target.path)!;
      edits.set(target, { value: structuredClone(value), version: (edits.get(target)?.version ?? 0) + 1,
        local: control.dirty || !relatedDisplayActive(form.getRawValue(), contract!, target.relationId) });
    }));
    const hasTargetEdit = (target: Target) => {
      const edit = edits.get(target);
      if (edit && form.get(target.path)?.dirty) edit.local = true;
      return !!edit?.local;
    };
    const preserveTargetEdit = async (target: Target): Promise<boolean> => {
      if (!hasTargetEdit(target)) return false;
      const control = form.get(target.path)!;
      let restored = 0;
      while (restored !== edits.get(target)!.version) {
        const edit = edits.get(target)!;
        const version = edit.version;
        if (!isEqual(control.getRawValue(), edit.value)) await setControlValue(control, structuredClone(edit.value), { emitEvent: false });
        restored = version;
      }
      control.markAsDirty();
      setRelatedDisplayAbsent(control, false);
      result.skipped.push({ name: target.path[0], reason: 'local-edit-during-sync' });
      return true;
    };
    const expectedReferences = new Map(targets.map(target => {
      const tokens = target.reference?.referenceTokens;
      if (!tokens) return [target, undefined];
      const owner = controls[tokens[0]] as AbstractControl | undefined;
      const component = completeGroupMap[tokens[0]];
      return [target, !owner || (component && !this.formService.shouldIncludeInFormControlMap(component)) ||
        preserveReason(owner, [tokens[0]]) ? get(initial, tokens) : get(originalServer, tokens)];
    }));
    const actualReference = (target: Target) => target.reference
      ? get(form.getRawValue(), target.reference.referenceTokens) : undefined;
    // Expected values provide one complete atomic ancestor write; observations
    // after awaits decide whether that optimistic write needs correction.
    const displayValue = (target: Target, latest?: Record<string, unknown>, actual = actualReference(target)) => {
      const before = target.reference && get(initial, target.reference.referenceTokens);
      const incoming = target.reference && get(originalServer, target.reference.referenceTokens);
      const retain = isEqual(actual, before) &&
        (!isEqual(actual, incoming) || relatedDisplayActive(initial!, contract!, target.relationId));
      const unexpected = !isEqual(actual, before) && !isEqual(actual, incoming);
      const source = retain ? latest ?? initial : originalServer;
      const control = form.get(target.path)!;
      const absent = unexpected || !has(source, target.path);
      return { reference: actual, value: absent ? relatedDisplayEmptyValue(control) : get(source, target.path),
        absent };
    };
    const needsStructuralWrite = (control: AbstractControl, value: unknown): boolean => {
      if (control instanceof FormArray) return !Array.isArray(value) || control.length !== value.length ||
        control.controls.some((child, index) => needsStructuralWrite(child, value[index]));
      if (control instanceof FormGroup) return Object.entries(control.controls).some(
        ([name, child]) => needsStructuralWrite(child, get(value, [name])));
      return false;
    };
    const writeDisplay = async (target: Target, latest?: Record<string, unknown>): Promise<void> => {
      const control = form.get(target.path);
      if (!control) return;
      try {
        if (await preserveTargetEdit(target)) return;
        const display = displayValue(target, latest);
        const applied = appliedTargets.get(target);
        if (applied && isEqual(applied.reference, display.reference) &&
          isEqual(control.getRawValue(), display.value)) {
          setRelatedDisplayAbsent(control, display.absent);
          return;
        }
        // Reuse absence state for failed writes: stale values are omitted only
        // while pristine; a genuine dirty local edit restores ordinary presence.
        control.markAsPristine();
        setRelatedDisplayAbsent(control, true);
        if (!isEqual(control.getRawValue(), display.value)) await setControlValue(control, display.value, { emitEvent: false });
        if (await preserveTargetEdit(target)) return;
        if (!isEqual(actualReference(target), display.reference)) {
          // Observe again after every corrective await. A return to A restores
          // A's display; a new selection C is cleared for RR-11 to populate.
          let reference = display.reference;
          while (!isEqual(actualReference(target), reference)) {
            const correction = displayValue(target);
            reference = correction.reference;
            if (!isEqual(control.getRawValue(), correction.value)) {
              await setControlValue(control, correction.value, { emitEvent: false });
            }
            if (await preserveTargetEdit(target)) return;
            setRelatedDisplayAbsent(control, correction.absent);
          }
          result.skipped.push({ name: target.path[0], reason: 'local-edit-during-sync' });
          return;
        }
        setRelatedDisplayAbsent(control, display.absent);
      } catch (error) {
        result.skipped.push({ name: target.path[0], reason: 'set-failed' });
        this.logger.warn('Failed to sync related display; form requires review/reload.', error);
      }
    };
    const visit = async (control: AbstractControl, path: string[]): Promise<void> => {
      const name = path[0];
      const kind = classification(path);
      let server = get(serverValue, path);
      const ancestor = targets.some(target => path.length < target.path.length && path.every((token, index) => token === target.path[index]));
      if (kind === 'display') {
        for (const target of targets.filter(item => item.display && path.every((token, index) => token === item.path[index]))) pendingTargets.set(target, undefined);
        return;
      }
      const preserve = preserveReason(control, path);
      if (preserve) {
        result.skipped.push({ name, reason: preserve });
        if (ancestor) {
          for (const target of targets.filter(item => item.display && path.every((token, index) => token === item.path[index]))) pendingTargets.set(target, undefined);
          if (preserve === 'local-edit' && localDirty(control, path)) preservedDirty.add(control);
        }
        return;
      }
      const deferredTargets: typeof targets = [];
      const mergedDisplays = new Map<Target, ReturnType<typeof displayValue>>();
      if (ancestor) {
        // The normal path exposes the complete expected state exactly once.
        // Only structural changes require the target's custom setter afterward.
        const merged = structuredClone(serverValue);
        for (const target of targets.filter(item => path.every((token, index) => token === item.path[index]))) {
          // Authoritative descriptors can include controls removed by role
          // constraints. They must not add unknown keys to FormGroup.setValue.
          if (!form.get(target.path)) { unset(merged, target.path); continue; }
          const targetControl = form.get(target.path)!;
          const display = displayValue(target, undefined, expectedReferences.get(target));
          mergedDisplays.set(target, display);
          if (needsStructuralWrite(targetControl, display.value)) {
            deferredTargets.push(target);
            set(merged, target.path, targetControl.getRawValue());
          } else set(merged, target.path, display.value);

        }
        server = get(merged, path);
      }
      let concurrentEditVersion = 0;
      let concurrentEditValue: unknown;
      let latestDisplay: Record<string, unknown> | undefined;
      let previousLocal = ancestor ? localView(control.getRawValue(), path) : undefined;
      let eventSource: AbstractControl | undefined;
      const eventSubscription = ancestor ? control.events.subscribe(event => {
        if (event instanceof ValueChangeEvent) eventSource = event.source;
      }) : undefined;
      const subscription = control.valueChanges.subscribe(value => {
        const source = eventSource;
        eventSource = undefined;
        if (ancestor) {
          const nextLocal = localView(control.getRawValue(), path);
          const displayEvent = targets.some(target => {
            if (!target.display) return false;
            const targetControl = form.get(target.path);
            for (let current = source; current; current = current.parent ?? undefined) {
              if (current === targetControl) return true;
            }
            return false;
          });
          if (displayEvent && isEqual(previousLocal, nextLocal)) {
            latestDisplay = structuredClone(form.getRawValue());
            set(latestDisplay!, path, structuredClone(control.getRawValue()));
            return;
          }
          previousLocal = structuredClone(nextLocal);
        }
        concurrentEditVersion += 1;
        concurrentEditValue = structuredClone(value);
      });
      try {
        for (const target of deferredTargets) setRelatedDisplayAbsent(form.get(target.path)!, true);
        await setControlValue(control, server, { emitEvent: false });

        if (concurrentEditVersion > 0) {
          let restoredVersion = 0;
          while (restoredVersion !== concurrentEditVersion) {
            const versionToRestore = concurrentEditVersion;
            await setControlValue(control, structuredClone(concurrentEditValue), { emitEvent: false });
            restoredVersion = versionToRestore;
          }
          for (const target of mergedDisplays.keys()) pendingTargets.set(target, latestDisplay);
          control.markAsDirty();
          result.skipped.push({ name, reason: 'local-edit-during-sync' });
          return;
        }
        // Capture dirty intent before markAsPristine can reset child flags.
        for (const target of mergedDisplays.keys()) hasTargetEdit(target);
        control.markAsPristine();
        for (const [target, display] of mergedDisplays) {
          pendingTargets.set(target, latestDisplay);
          if (!deferredTargets.includes(target)) appliedTargets.set(target, display);
        }
        if (!ancestor) {
          for (const target of targets.filter(item => item.path.length === path.length && item.path.every((token, index) => token === path[index]))) {
            const targetControl = form.get(target.path);
            if (targetControl && has(originalServer, target.path)) setRelatedDisplayAbsent(targetControl, false);
          }
        }
        result.patched.push(name);
      } catch (error) {
        for (const target of targets.filter(item => item.display && path.every((token, index) => token === item.path[index]))) {
          const targetControl = form.get(target.path);
          if (targetControl) {
            setRelatedDisplayAbsent(targetControl, true);
            pendingTargets.set(target, undefined);
          }
        }
        control.markAsDirty();
        result.skipped.push({ name, reason: 'set-failed' });
        this.logger.warn(`Failed to sync server value for form control '${name}'.`, error);
      } finally { subscription.unsubscribe(); eventSubscription?.unsubscribe(); }
    };
    const names = new Set([...Object.keys(sentValue), ...Object.keys(serverValue), ...(replaceMissing ? Object.keys(controls) : [])]);
    const orderedNames = [...names].sort((left, right) => Number(classification([left]) !== 'local') - Number(classification([right]) !== 'local'));
    for (const name of orderedNames) {
      const component = completeGroupMap[name];
      if (!has(serverValue, [name]) && !replaceMissing) {
        result.skipped.push({ name, reason: 'not-in-server' });
      } else if (component && !this.formService.shouldIncludeInFormControlMap(component)) {
        result.skipped.push({ name, reason: 'excluded' });
      } else if (!controls[name]) {
        result.skipped.push({ name, reason: 'no-control' });
      } else {
        await visit(controls[name] as AbstractControl, [name]);
      }
    }
    // Phase 2 observes actual references after successful, failed, and restored
    // concurrent writes from phase 1. Each target failure remains independent.
    try {
      for (const [target, latest] of pendingTargets) {
        // Targets not overwritten by an ancestor still contain source updates,
        // including silent population while any phase-one setter was awaiting.
        await writeDisplay(target, latest ?? (!appliedTargets.has(target) ? form.getRawValue() : undefined));
      }
    } finally {
      for (const subscription of targetSubscriptions) subscription?.unsubscribe();
    }
    for (const control of preservedDirty) control.markAsDirty();
    form.updateValueAndValidity({ emitEvent: false });
    return result;
  }

}
