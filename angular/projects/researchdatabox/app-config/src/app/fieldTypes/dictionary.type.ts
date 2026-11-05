import { Component, OnInit } from '@angular/core';
import { UntypedFormGroup } from '@angular/forms';
import { FieldType, FormlyFieldConfig } from '@ngx-formly/core';
import { cloneDeep } from 'lodash-es';
import { TranslationService } from '@researchdatabox/portal-ng-common';
import { dictionarySummary } from '../config-form';

@Component({
  selector: 'app-config-dictionary', standalone: false,
  templateUrl: './dictionary.type.html'
})
export class DictionaryTypeComponent extends FieldType implements OnInit {
  constructor(private translationService: TranslationService) { super(); }

  adding = false;
  newKey = '';
  duplicateKey?: string;
  pendingRemove?: FormlyFieldConfig;
  private removeTrigger?: HTMLElement;

  onPopulate(field: FormlyFieldConfig): void {
    const existing = field.fieldGroup || [];
    field.fieldGroup = Object.keys(field.model || {}).map(key => existing.find(child => this.entryKey(child) === key) || field.props!['dictionaryField'](key));
  }

  ngOnInit(): void {
    this.formControl.addValidators(() => this.invalidDraft ? { dictionaryKey: true } : null);
  }

  entryKey(child: FormlyFieldConfig): string { return String(Array.isArray(child.key) ? child.key[0] : child.key); }
  fixed(key: string): boolean { return Object.prototype.hasOwnProperty.call(this.props['dictionarySchema'].properties || {}, key); }
  error(key: string, original?: string): string {
    if (key === original) return ''; // Existing legacy names always remain preservable.
    if (!key.length) return 'admin-config-dictionary-key-required';
    if (key !== original && Object.prototype.hasOwnProperty.call(this.model || {}, key)) return 'admin-config-dictionary-key-duplicate';
    // Formly/lodash reject these path segments. Keep legacy data, but never introduce unsafe new keys.
    if (key !== original && ['__proto__', 'prototype', 'constructor'].includes(key)) return 'admin-config-dictionary-key-unsafe';
    const schema = this.props['dictionarySchema'];
    const patterns = Object.keys(schema.patternProperties || {});
    if (patterns.length && !patterns.some(pattern => new RegExp(pattern).test(key)) && typeof schema.additionalProperties !== 'object') return 'admin-config-dictionary-key-pattern';
    return '';
  }
  get patternHint(): string { return Object.keys(this.props['dictionarySchema'].patternProperties || {}).join(' | '); }
  get invalidDraft(): boolean {
    return (this.adding && !!this.error(this.newKey)) || (this.field.fieldGroup || []).some(child =>
      child.props?.['keyDraft'] !== undefined && !!this.error(child.props['keyDraft'], this.entryKey(child)));
  }
  draftChanged(): void { this.formControl.updateValueAndValidity(); }
  startAdd(source?: FormlyFieldConfig): void {
    this.adding = true; this.newKey = ''; this.duplicateKey = source ? this.entryKey(source) : undefined; this.draftChanged();
  }
  cancelAdd(): void { this.adding = false; this.newKey = ''; this.duplicateKey = undefined; this.draftChanged(); }
  add(): void {
    if (!this.adding || this.error(this.newKey)) return;
    const key = this.newKey;
    const child = this.props['dictionaryField'](key) as FormlyFieldConfig;
    const type = child.type;
    const value = this.duplicateKey !== undefined ? cloneDeep(this.model[this.duplicateKey]) :
      type === 'app-config-dictionary' || type === 'object' ? {} : type === 'array' || type === 'app-config-chips' ? [] :
      type === 'app-config-checkbox' ? false : type === 'number' || type === 'integer' ? 0 : type === 'app-config-json' ? null : '';
    // Define properties instead of interpreting the user-supplied name as a path.
    const model = this.model || {};
    Object.defineProperty(model, key, { value, enumerable: true, configurable: true, writable: true });
    if (!this.model) this.assign(model);
    child.props = { ...child.props, entryExpanded: true };
    if (this.duplicateKey !== undefined) this.props['dictionaryChange']?.(this.duplicateKey, key, true);
    this.field.fieldGroup!.push(child);
    this.cancelAdd(); this.rebuild();
  }
  rename(child: FormlyFieldConfig, name: string): void {
    child.props!['keyDraft'] = name;
    if (this.error(name, this.entryKey(child))) { this.draftChanged(); return; }
    const previous = this.entryKey(child);
    if (name === previous) { delete child.props!['keyDraft']; this.draftChanged(); return; }
    const entries = Object.entries(this.model).map(([key, value]) => [key === previous ? name : key, value]);
    const model = Object.fromEntries(entries);
    (this.formControl as UntypedFormGroup).removeControl(previous);
    this.assign(model);
    this.props['dictionaryChange']?.(previous, name);
    const replacement = this.props['dictionaryField'](name);
    replacement.props = { ...replacement.props, entryExpanded: true };
    this.field.fieldGroup!.splice(this.field.fieldGroup!.indexOf(child), 1, replacement);
    this.rebuild();
  }
  requestRemove(child: FormlyFieldConfig, event: Event): void { this.pendingRemove = child; this.removeTrigger = event.currentTarget as HTMLElement; this.options.detectChanges?.(this.field); }
  cancelRemove(): void { this.pendingRemove = undefined; this.removeTrigger?.focus(); }
  remove(): void {
    if (!this.pendingRemove) return;
    const child = this.pendingRemove, key = this.entryKey(child);
    delete this.model[key];
    this.props['dictionaryChange']?.(key);
    (this.formControl as UntypedFormGroup).removeControl(key);
    this.field.fieldGroup!.splice(this.field.fieldGroup!.indexOf(child), 1);
    this.pendingRemove = undefined; this.rebuild();
    queueMicrotask(() => document.getElementById(this.id + '-add-entry')?.focus());
  }
  summary(child: FormlyFieldConfig): string {
    return dictionarySummary(child, this.model?.[this.entryKey(child)], value =>
      this.translationService.t(value ? 'admin-config-enabled' : 'admin-config-disabled'));
  }
  private assign(value: object): void {
    if (this.field.key == null) {
      // Root dictionaries share the form model; retain that reference while replacing its entries.
      Object.keys(this.model).forEach(key => delete this.model[key]);
      Object.defineProperties(this.model, Object.getOwnPropertyDescriptors(value));
      return;
    }
    // field.model has a getter; write through its parent using literal key segments.
    const keys = Array.isArray(this.field.key) ? this.field.key : [String(this.field.key)];
    let parent = this.field.parent!.model;
    keys.slice(0, -1).forEach(key => parent = parent[key]);
    parent[keys[keys.length - 1]] = value;
  }
  private rebuild(): void {
    this.formControl.markAsDirty();
    this.options.build!(this.field);
    this.options.fieldChanges!.next({ field: this.field, value: this.model, type: 'valueChanges' });
  }
}
