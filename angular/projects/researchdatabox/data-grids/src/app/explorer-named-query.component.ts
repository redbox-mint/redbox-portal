import { CommonModule } from '@angular/common';
import { A11yModule } from '@angular/cdk/a11y';
import {
  AfterViewInit,
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
import { HttpErrorResponse } from '@angular/common/http';
import { I18NextPipe } from '@researchdatabox/portal-ng-common';
import type {
  GraphqlNamedQueryDefinition,
  GraphqlNamedQueryDescription,
  NamedQueryPromotionDraft,
} from '@researchdatabox/sails-ng-common';
import { GraphqlDraftEditorComponent } from '../../../named-query-editor/src/app/graphql-draft-editor.component';
import { GraphqlSchemaComponent } from '../../../named-query-editor/src/app/graphql-schema.component';
import { NamedQueryApiService } from '../../../named-query-editor/src/app/named-query-api.service';
import { QueryAssistanceModule } from '../../../named-query-editor/src/app/query-assistance.module';

/** Owns only the detached new definition. The explorer stays mounted alongside it. */
@Component({
  selector: 'rb-explorer-named-query',
  imports: [
    CommonModule,
    A11yModule,
    I18NextPipe,
    GraphqlDraftEditorComponent,
    GraphqlSchemaComponent,
    QueryAssistanceModule,
  ],
  templateUrl: './explorer-named-query.component.html',
  styles: [
    `
      :host {
        display: block;
      }
      fieldset {
        min-width: 0;
        padding: 0;
        margin: 0;
        border: 0;
      }
      .promotion-body {
        display: grid;
        grid-template-columns: minmax(0, 1fr) minmax(240px, 320px);
        gap: 24px;
      }
      .promotion-confirm {
        position: fixed;
        inset: 0;
        z-index: 1060;
        display: grid;
        place-items: center;
        background: rgb(0 0 0 / 25%);
      }
      .promotion-confirm > div {
        max-width: 560px;
        margin: 16px;
        padding: 24px;
        background: var(--admin-bg);
        border: 1px solid var(--admin-line);
        border-radius: var(--admin-radius);
      }
      @media (max-width: 800px) {
        .promotion-body {
          grid-template-columns: minmax(0, 1fr);
        }
      }
    `,
  ],
})
export class ExplorerNamedQueryComponent implements OnInit, AfterViewInit, OnDestroy {
  @Input({ required: true }) prepared!: NamedQueryPromotionDraft;
  @Output() closed = new EventEmitter<void>();
  @Output() saved = new EventEmitter<string>();
  @ViewChild('heading') heading?: ElementRef<HTMLElement>;
  @ViewChild('saveButton') saveButton?: ElementRef<HTMLButtonElement>;
  @ViewChild('cancelButton') cancelButton?: ElementRef<HTMLButtonElement>;
  draft!: GraphqlNamedQueryDefinition;
  variableValues: NamedQueryPromotionDraft['variableValues'] = {};
  description: GraphqlNamedQueryDescription | null = null;
  sdl = '';
  error = '';
  schemaError = false;
  pendingInput = false;
  initializing = true;
  saving = false;
  validating = false;
  confirmCancel = false;
  private baseline = '';
  private changedInput = false;
  private sequence = 0;
  private destroyed = false;
  private initialized = false;
  private timer?: ReturnType<typeof setTimeout>;
  constructor(
    @Inject(NamedQueryApiService) private api: NamedQueryApiService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.draft = structuredClone(this.prepared.definition);
    this.variableValues = structuredClone(this.prepared.variableValues);
    this.baseline = JSON.stringify(this.draft);
    void this.initialize();
  }
  ngAfterViewInit(): void {
    this.heading?.nativeElement.focus();
  }
  private async initialize(): Promise<void> {
    try {
      await this.api.waitForInit();
      if (this.destroyed) return;
      this.initialized = true;
      void this.loadSchema();
      void this.validate();
    } catch {
      if (!this.destroyed) this.error = 'data-grids-promotion-init-failed';
    } finally {
      if (!this.destroyed) this.initializing = false;
    }
  }
  private async loadSchema(): Promise<void> {
    try {
      const result = await this.api.graphqlSchema();
      if (!this.destroyed) this.sdl = result.sdl;
    } catch {
      if (!this.destroyed) this.schemaError = true;
    }
  }
  get dirty(): boolean {
    return this.changedInput || JSON.stringify(this.draft) !== this.baseline;
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
      this.description?.valid === true
    );
  }
  changed(): void {
    this.changedInput = true;
    this.sequence++;
    this.description = null;
    if (this.initialized) this.error = '';
    this.validating = false;
    clearTimeout(this.timer);
    if (this.initialized) this.timer = setTimeout(() => void this.validate(), 250);
  }
  async validate(): Promise<boolean> {
    clearTimeout(this.timer);
    if (!this.initialized || this.destroyed) return false;
    const seq = ++this.sequence;
    const snapshot = JSON.stringify(this.draft);
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
  async save(): Promise<void> {
    if (!this.canSave) return;
    const active = this.heading?.nativeElement.ownerDocument.activeElement;
    const trigger = active instanceof HTMLElement ? active : this.saveButton?.nativeElement;
    let saved = false;
    const snapshot = JSON.stringify(this.draft);
    const candidate: GraphqlNamedQueryDefinition = JSON.parse(snapshot);
    candidate.name = candidate.name?.trim();
    this.saving = true;
    this.error = '';
    try {
      const valid = await this.validate();
      if (this.destroyed) return;
      if (this.pendingInput || snapshot !== JSON.stringify(this.draft)) {
        this.error = 'named-query-review-changed';
        return;
      }
      if (!valid) return;
      const result = await this.api.create(candidate);
      saved = true;
      if (!this.destroyed) this.saved.emit(result.name);
    } catch (error) {
      if (!this.destroyed)
        this.error =
          error instanceof HttpErrorResponse && [401, 403].includes(error.status)
            ? 'data-grids-promotion-denied'
            : error instanceof HttpErrorResponse && error.status === 409
              ? 'data-grids-promotion-name-exists'
              : 'data-grids-promotion-save-failed';
    } finally {
      if (!this.destroyed) {
        this.saving = false;
        this.cdr.detectChanges();
        if (!saved)
          setTimeout(() => {
            if (this.destroyed || this.saving) return;
            const target = trigger?.isConnected && trigger !== document.body ? trigger : this.saveButton?.nativeElement;
            (target && !target.matches(':disabled') ? target : this.heading?.nativeElement)?.focus();
          });
      }
    }
  }
  cancel(): void {
    if (this.saving) return;
    if (this.dirty) this.confirmCancel = true;
    else this.closed.emit();
  }
  keepEditing(): void {
    this.confirmCancel = false;
    setTimeout(() => {
      if (!this.destroyed) this.cancelButton?.nativeElement.focus();
    });
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
    clearTimeout(this.timer);
  }
}
