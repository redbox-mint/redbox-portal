import { CommonModule } from '@angular/common';
import { A11yModule } from '@angular/cdk/a11y';
import {
  Component,
  ChangeDetectorRef,
  ElementRef,
  EventEmitter,
  HostListener,
  Inject,
  Input,
  OnDestroy,
  OnInit,
  Output,
  ViewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import {
  AdminModalDirective,
  AdminSidePanelComponent,
  I18NextPipe,
  TranslationService,
  NamedQueryBasicsSectionComponent,
  NamedQueryParametersSectionComponent,
  NamedQueryLookupSectionComponent,
  NamedQueryPreviewSectionComponent,
  type NamedQueryParameterRow,
  type NamedQueryResultField,
  type NamedQueryBindingChange,
} from '@researchdatabox/portal-ng-common';
import type {
  GraphqlNamedQueryDefinition,
  GraphqlNamedQueryDescription,
  NamedQueryPromotionDraft,
  NamedQueryUpdateReview,
} from '@researchdatabox/sails-ng-common';
import { NamedQueryApiService } from '../../../named-query-editor/src/app/named-query-api.service';
import { SavedQuery } from './data-grid.model';
import { initializePublish, publishPreviewVariables, type PublishVariable } from './publish-query';
import { cursorBinding } from './graphql-query';
import { DATA_GRID_SOURCE, DataGridSource } from './data-grid-source';

/** Lazy, detached publishing workspace. All execution and update review stay on the existing caller-scoped API. */
@Component({
  selector: 'rb-explorer-named-query',
  imports: [
    CommonModule,
    FormsModule,
    A11yModule,
    AdminModalDirective,
    AdminSidePanelComponent,
    I18NextPipe,
    NamedQueryBasicsSectionComponent,
    NamedQueryParametersSectionComponent,
    NamedQueryLookupSectionComponent,
    NamedQueryPreviewSectionComponent,
  ],
  templateUrl: './explorer-named-query.component.html',
})
export class ExplorerNamedQueryComponent implements OnInit, OnDestroy {
  @Input({ required: true }) prepared!: NamedQueryPromotionDraft;
  @Input() exploration: SavedQuery | null = null;
  @Input() fieldLabels: Record<string, string> = {};
  @Input() resultFields: NamedQueryResultField[] = [];
  @Input() updateName = '';
  @Output() closed = new EventEmitter<void>();
  @Output() saved = new EventEmitter<string>();
  @ViewChild('saveButton') saveButton?: ElementRef<HTMLButtonElement>;
  @ViewChild('cancelButton') cancelButton?: ElementRef<HTMLButtonElement>;
  draft!: GraphqlNamedQueryDefinition;
  variableValues: NamedQueryPromotionDraft['variableValues'] = {};
  description: GraphqlNamedQueryDescription | null = null;
  variables: PublishVariable[] = [];
  error = '';
  pendingInput = false;
  initializing = true;
  saving = false;
  validating = false;
  confirmCancel = false;
  pendingUpdate: { definition: GraphqlNamedQueryDefinition; snapshot: string; review: NamedQueryUpdateReview } | null =
    null;
  previewResult: unknown = null;
  previewBusy = false;
  previewError = '';
  previewValues: Record<string, string> = {};
  private baseline = '';
  private sequence = 0;
  private previewSequence = 0;
  private destroyed = false;
  private initialized = false;
  private timer?: ReturnType<typeof setTimeout>;
  constructor(
    @Inject(NamedQueryApiService) private api: NamedQueryApiService,
    @Inject(DATA_GRID_SOURCE) private source: DataGridSource,
    @Inject(TranslationService) private i18n: TranslationService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    const initialized = initializePublish(this.prepared, this.exploration, this.fieldLabels, key =>
      this.text('data-grids-' + key)
    );
    this.draft = initialized.draft;
    this.variables = initialized.variables;
    if (!this.draft.name)
      this.draft.name = (this.exploration?.name ?? '').replace(/[^A-Za-z0-9_-]+/g, '_').replace(/^_+|_+$/g, '');
    this.variableValues = structuredClone(this.prepared.variableValues);
    const title = this.resultFields.find(
      f =>
        f.label.toLocaleLowerCase() === this.text('data-grids-title-column').toLocaleLowerCase() ||
        f.path.at(-1) === 'title'
    );
    if (!this.draft.graphql.mappings?.title && title)
      this.draft.graphql.mappings = { ...this.draft.graphql.mappings, title: title.path };
    void this.initialize();
  }
  text(key: string): string {
    return this.i18n.t(key) as string;
  }
  private async initialize(): Promise<void> {
    try {
      await this.api.waitForInit();
      if (this.destroyed) return;
      if (this.updateName) {
        const existing = await this.api.get(this.updateName);
        if (existing.source !== 'graphql') throw Error();
        this.draft.name = this.updateName;
        this.draft.description = existing.description;
        this.draft.graphql.mappings = structuredClone(existing.graphql.mappings ?? this.draft.graphql.mappings);
        for (const variable of this.variables) {
          const previous = existing.graphql.variables[variable.name];
          if (previous) this.draft.graphql.variables[variable.name] = structuredClone(previous);
        }
        if (existing.graphql.lookup) {
          this.draft.graphql.lookup = structuredClone(existing.graphql.lookup);
          delete this.draft.graphql.variables[existing.graphql.lookup.firstVariable];
          delete this.draft.graphql.variables[existing.graphql.lookup.afterVariable];
        }
      }
      if (this.destroyed) return;
      this.initialized = true;
      this.baseline = JSON.stringify(this.draft);
      await this.validate();
    } catch {
      if (!this.destroyed) this.error = 'data-grids-promotion-init-failed';
    } finally {
      if (!this.destroyed) this.initializing = false;
    }
  }
  get dirty(): boolean {
    return JSON.stringify(this.draft) !== this.baseline;
  }
  get canSave(): boolean {
    const name = this.draft?.name?.trim();
    return (
      this.initialized &&
      !!name &&
      /^[A-Za-z0-9_-]+$/.test(name) &&
      name !== 'collections' &&
      !this.pendingInput &&
      !this.saving &&
      !this.validating &&
      this.description?.valid === true &&
      (this.use !== 'lookup' || this.description.capabilities?.lookup === true)
    );
  }
  get use(): 'general' | 'lookup' {
    return this.draft?.graphql.lookup ? 'lookup' : 'general';
  }
  get parameterRows(): NamedQueryParameterRow[] {
    return this.variables.map(v => ({
      variable: v.name,
      label: v.label,
      inputType: v.inputType,
      value: v.value,
      binding: this.draft.graphql.variables[v.name],
      consumerAllowed: v.consumerAllowed,
      paging:
        v.name === this.draft.graphql.lookup?.firstVariable ||
        v.name === this.draft.graphql.lookup?.afterVariable ||
        ['first', 'after'].includes(v.name),
    }));
  }
  get consumers(): { name: string; label: string }[] {
    return this.parameterRows.flatMap(row =>
      row.binding?.ownership === 'consumer' ? [{ name: row.binding.parameter, label: row.label }] : []
    );
  }
  setBinding(event: NamedQueryBindingChange): void {
    this.draft.graphql.variables[event.variable] = event.binding;
    this.changed();
  }
  setUse(use: 'general' | 'lookup'): void {
    const op = this.draft.graphql;
    if (use === 'general') {
      delete op.lookup;
      for (const v of this.variables.filter(v => ['first', 'after'].includes(v.name)))
        op.variables[v.name] =
          v.value === undefined ? { ownership: 'omitted' } : { ownership: 'fixed', value: v.value };
    } else {
      const candidate = Object.fromEntries(this.variables.map(v => [v.name, v.value]));
      const paging = cursorBinding(op.document, candidate, op.resultPath);
      if (!paging) {
        this.error = 'nq-section-lookup-paging-required';
        return;
      }
      const first = this.variables.find(
        v => v.name === 'first' || (v.inputType.replace('!', '') === 'Int' && v.value === paging.size)
      );
      if (!first) {
        this.error = 'nq-section-lookup-paging-required';
        return;
      }
      op.lookup = {
        mode: 'firstPage',
        collectionPath: [paging.root],
        hasNextPagePath: [paging.root, 'hasNextPage'],
        endCursorPath: [paging.root, 'endCursor'],
        firstVariable: first.name,
        afterVariable: paging.after,
        searchParameter: this.consumers[0]?.name ?? '',
      };
      delete op.variables[first.name];
      delete op.variables[paging.after];
    }
    this.changed();
  }
  changed(): void {
    this.sequence++;
    this.previewSequence++;
    this.description = null;
    this.previewResult = null;
    this.previewBusy = false;
    if (this.initialized) this.error = '';
    this.validating = false;
    this.pendingUpdate = null;
    clearTimeout(this.timer);
    if (this.initialized) this.timer = setTimeout(() => void this.validate(), 250);
  }
  async validate(): Promise<boolean> {
    clearTimeout(this.timer);
    if (!this.initialized || this.destroyed) return false;
    const seq = ++this.sequence,
      snapshot = JSON.stringify(this.draft);
    this.validating = true;
    try {
      const result = await this.api.describe({ definition: JSON.parse(snapshot) });
      if (this.destroyed || seq !== this.sequence || snapshot !== JSON.stringify(this.draft)) return false;
      this.description = result.source === 'graphql' ? result : null;
      return this.description?.valid === true;
    } catch {
      if (!this.destroyed && seq === this.sequence) this.error = 'data-grids-promotion-validation-failed';
      return false;
    } finally {
      if (!this.destroyed && seq === this.sequence) this.validating = false;
    }
  }
  async preview(): Promise<void> {
    if (!this.description?.valid || this.pendingInput || this.previewBusy) return;
    const seq = ++this.previewSequence;
    this.previewBusy = true;
    this.previewError = '';
    try {
      const definition = structuredClone(this.draft);
      if (definition.graphql.lookup) {
        const result = await this.api.preview({ definition, parameters: { ...this.previewValues } });
        if (!this.destroyed && seq === this.previewSequence) {
          if (!result.valid) this.previewError = this.text('nq-section-preview-failed');
          else this.previewResult = result.records;
        }
      } else {
        if (!this.source.raw) throw Error();
        // The named-query preview endpoint supports lookup adapters only. General
        // queries use the explorer's existing authenticated, bounded read endpoint.
        const variables = publishPreviewVariables(definition, this.previewValues);
        const page = cursorBinding(definition.graphql.document, variables, definition.graphql.resultPath);
        if (page) variables[page.after] = null;
        const data = await this.source.raw(definition.graphql.document, variables);
        let rows: unknown = data;
        for (const key of definition.graphql.resultPath)
          rows =
            rows && typeof rows === 'object' && Object.hasOwn(rows, key)
              ? (rows as Record<string, unknown>)[key]
              : undefined;
        if (!this.destroyed && seq === this.previewSequence) {
          this.previewResult = Array.isArray(rows)
            ? rows.slice(0, 25).map(row => {
                if (!this.resultFields.length) return row;
                const entries = this.resultFields
                  .filter(field => !['object', 'structured'].includes(field.type ?? ''))
                  .flatMap(field => {
                    let value: unknown = row;
                    for (const key of field.path)
                      value =
                        value && typeof value === 'object' && Object.hasOwn(value, key)
                          ? (value as Record<string, unknown>)[key]
                          : undefined;
                    return value === undefined ? [] : [[field.label, value] as const];
                  });
                return Object.fromEntries(entries);
              })
            : data;
        }
      }
    } catch {
      if (!this.destroyed && seq === this.previewSequence) this.previewError = this.text('nq-section-preview-failed');
    } finally {
      if (!this.destroyed && seq === this.previewSequence) this.previewBusy = false;
    }
  }
  async save(): Promise<void> {
    if (!this.canSave) return;
    const snapshot = JSON.stringify(this.draft),
      candidate = JSON.parse(snapshot) as GraphqlNamedQueryDefinition;
    candidate.name = candidate.name?.trim();
    this.saving = true;
    this.error = '';
    try {
      if (!(await this.validate())) return;
      if (snapshot !== JSON.stringify(this.draft) || this.pendingInput) {
        this.error = 'named-query-review-changed';
        return;
      }
      if (this.updateName) {
        const review = await this.api.reviewUpdate(this.updateName, candidate);
        if (snapshot !== JSON.stringify(this.draft)) {
          this.error = 'named-query-review-changed';
          return;
        }
        if (review.required) {
          this.pendingUpdate = { definition: candidate, snapshot, review };
          return;
        }
      }
      await this.persist(candidate);
    } catch (error) {
      this.handleSaveError(error);
    } finally {
      if (!this.destroyed) {
        this.saving = false;
        this.cdr.detectChanges();
      }
    }
  }
  private async persist(candidate: GraphqlNamedQueryDefinition, confirmation?: string): Promise<void> {
    const result = this.updateName
      ? await this.api.update(this.updateName, candidate, confirmation)
      : await this.api.create(candidate);
    if (!this.destroyed) {
      this.baseline = JSON.stringify(this.draft);
      this.saved.emit(result.name);
    }
  }
  async confirmUpdate(): Promise<void> {
    const pending = this.pendingUpdate;
    if (!pending || this.saving) return;
    if (pending.snapshot !== JSON.stringify(this.draft) || this.pendingInput) {
      this.pendingUpdate = null;
      this.error = 'named-query-review-changed';
      return;
    }
    this.saving = true;
    try {
      await this.persist(pending.definition, pending.review.confirmation);
      this.pendingUpdate = null;
    } catch (error) {
      this.pendingUpdate = null;
      this.handleSaveError(error);
    } finally {
      if (!this.destroyed) this.saving = false;
    }
  }
  cancelUpdate(): void {
    this.pendingUpdate = null;
    setTimeout(() => this.saveButton?.nativeElement.focus());
  }
  private handleSaveError(error: unknown): void {
    if (!this.destroyed)
      this.error =
        error instanceof HttpErrorResponse && [401, 403].includes(error.status)
          ? 'data-grids-promotion-denied'
          : error instanceof HttpErrorResponse && error.status === 409
            ? this.updateName
              ? 'named-query-review-changed'
              : 'data-grids-promotion-name-exists'
            : 'data-grids-promotion-save-failed';
  }
  cancel(): void {
    if (this.saving) return;
    if (this.dirty) this.confirmCancel = true;
    else this.closed.emit();
  }
  keepEditing(): void {
    this.confirmCancel = false;
    setTimeout(() => this.cancelButton?.nativeElement.focus());
  }
  discard(): void {
    if (!this.saving) this.closed.emit();
  }
  @HostListener('window:beforeunload', ['$event']) beforeUnload(event: BeforeUnloadEvent): void {
    if (this.dirty) {
      event.preventDefault();
      event.returnValue = '';
    }
  }
  ngOnDestroy(): void {
    this.destroyed = true;
    this.sequence++;
    this.previewSequence++;
    clearTimeout(this.timer);
  }
}
