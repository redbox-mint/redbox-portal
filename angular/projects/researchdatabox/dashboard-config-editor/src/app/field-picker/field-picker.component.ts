import { Component, EventEmitter, HostListener, Input, Output } from '@angular/core';
import { DashboardFieldCatalogue, isKnownFieldPath } from '../dashboard-config-api.service';

let nextPickerId = 0;

/**
 * Text input for a record field path with suggestions from the stage's record
 * JSON schema. Any path can still be typed; unknown paths get a gentle hint
 * because records may legitimately contain fields the schema does not list.
 */
@Component({
  selector: 'dashboard-field-picker',
  template: `
    <div class="dc-field-input"><input
      type="text"
      class="form-control dc-mono"
      [id]="inputId"
      role="combobox"
      aria-autocomplete="list"
      [attr.aria-expanded]="open"
      [attr.aria-controls]="listId"
      [attr.aria-activedescendant]="open && activeIndex >= 0 ? listId + '-' + activeIndex : null"
      [attr.aria-label]="ariaLabel || null"
      [attr.aria-describedby]="unknown ? hintId : null"
      [placeholder]="placeholder"
      [ngModel]="value"
      (ngModelChange)="onChange($event)"
      (focus)="open = true"
      (blur)="open = false"
      (keydown)="onKeydown($event)"
      autocomplete="off"
    /><button class="btn btn-outline-secondary" type="button" [attr.aria-label]="'admin-dashboard-browse-fields' | i18next" [attr.aria-expanded]="open" (mousedown)="$event.preventDefault()" (click)="open = !open; browseAll = true">…</button></div>
    <div *ngIf="open" class="dc-field-options" [id]="listId" role="listbox" [attr.aria-label]="'admin-dashboard-record-field' | i18next">
      <button type="button" role="option" *ngFor="let field of visibleSuggestions; let i = index" [id]="listId + '-' + i" [attr.aria-selected]="i === activeIndex" (mousedown)="$event.preventDefault()" (click)="choose(field.path)"><span>{{ field.label }}</span><code>{{ field.path }}</code></button>
      <p *ngIf="!visibleSuggestions.length" class="rb-admin-hint">{{ 'admin-dashboard-no-fields' | i18next }}</p>
    </div>
    <small class="dc-field-hint" [id]="hintId" *ngIf="unknown">
      <i class="fa fa-exclamation-triangle" aria-hidden="true"></i>
      Not a field of {{ catalogue?.recordType }}{{ catalogue?.workflowStage ? ' (' + catalogue?.workflowStage + ')' : '' }} in its record schema. Check the spelling.
    </small>
    <small class="dc-field-hint dc-field-hint-info" *ngIf="selected?.description">{{ selected?.description }}</small>
  `,
  standalone: false
})
export class FieldPickerComponent {
  @Input() value = '';
  @Input() catalogue: DashboardFieldCatalogue | null = null;
  @Input() placeholder = 'metadata.title';
  @Input() ariaLabel = '';
  @Input() inputId = `dc-field-picker-${++nextPickerId}`;
  /** Restrict suggestions, e.g. to scalar fields for sorting. */
  @Input() filter: 'all' | 'scalar' = 'all';
  @Output() valueChange = new EventEmitter<string>();

  readonly listId = `${this.inputId}-list`;
  readonly hintId = `${this.inputId}-hint`;
  open = false;
  browseAll = false;
  activeIndex = -1;

  get visibleSuggestions() {
    const term = this.browseAll ? '' : (this.value ?? '').toLowerCase();
    return this.suggestions.filter((field) => !term || `${field.path} ${field.label}`.toLowerCase().includes(term)).slice(0, 60);
  }

  choose(path: string): void {
    this.value = path;
    this.valueChange.emit(path);
    this.open = false;
    this.activeIndex = -1;
  }

  onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') { this.open = false; event.stopPropagation(); return; }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      this.open = true;
      this.activeIndex = Math.max(0, Math.min(this.visibleSuggestions.length - 1, this.activeIndex + (event.key === 'ArrowDown' ? 1 : -1)));
    }
    if (event.key === 'Enter' && this.open && this.visibleSuggestions[this.activeIndex]) {
      event.preventDefault();
      this.choose(this.visibleSuggestions[this.activeIndex].path);
    }
  }

  @HostListener('focusout', ['$event'])
  onFocusOut(event: FocusEvent): void {
    if (!(event.currentTarget as HTMLElement)?.contains(event.relatedTarget as Node)) this.open = false;
  }

  get suggestions() {
    const fields = this.catalogue?.fields ?? [];
    return this.filter === 'scalar' ? fields.filter((f) => f.type !== 'object' && f.type !== 'array' && f.type !== 'any') : fields;
  }

  get selected() {
    return this.catalogue?.fields.find((f) => f.path === (this.value ?? '').trim());
  }

  get unknown(): boolean {
    return !!(this.value ?? '').trim() && !isKnownFieldPath(this.catalogue, this.value);
  }

  onChange(value: string): void {
    this.value = value;
    this.browseAll = false;
    this.open = true;
    this.activeIndex = -1;
    this.valueChange.emit(value);
  }
}
