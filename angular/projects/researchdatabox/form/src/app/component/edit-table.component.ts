import { Component, Input, ViewChild, ViewContainerRef, ComponentRef, OnDestroy, inject, signal } from "@angular/core";
import { AbstractControl, FormControl, FormGroup } from "@angular/forms";
import { Subscription } from "rxjs";
import { FormFieldBaseComponent, FormFieldCompMapEntry, FormFieldModel, HandlebarsTemplateService } from "@researchdatabox/portal-ng-common";
import {
  AvailableFormComponentDefinitionFrames,
  DynamicScriptResponse,
  EditTableColumnConfig,
  EditTableComponentName,
  EditTableFieldComponentConfig,
  EditTableFieldComponentDefinitionFrame,
  EditTableModelName,
  EditTableModelValueType,
  FormConfigFrame,
  isTypeFieldDefinitionName,
} from "@researchdatabox/sails-ng-common";
import {
  cloneDeep as _cloneDeep,
  get as _get,
  isEmpty as _isEmpty,
  isUndefined as _isUndefined,
} from "lodash-es";
import { FormComponentsMap, FormService } from "../form.service";
import { FormComponent } from "../form.component";
import { FormBaseWrapperComponent } from "./base-wrapper.component";
import { RepeatableComponent } from "./repeatable.component";
import { ConfirmationDialogService } from "../confirmation-dialog.service";
import { createFormStatusDirtyRequestEvent, FormComponentEventBus } from "../form-state";

export interface EditTableDialogState {
  mode: 'add' | 'edit';
  rowIndex?: number;
}

/**
 * The model for the EditTable Component.
 *
 * The value is an array of row objects. Rows are only ever mutated atomically via
 * confirmed dialog edits, so a plain FormControl holds the array: field-level
 * validators (e.g. required, minLength) apply directly to the array value and
 * `form.getRawValue()` works without any custom control plumbing.
 */
export class EditTableModel extends FormFieldModel<EditTableModelValueType> {
  protected override logName = EditTableModelName;

  protected override postCreateGetInitValue(): EditTableModelValueType {
    return this.fieldConfig.config?.value ?? [];
  }

  protected override postCreateGetFormControl(): FormControl<EditTableModelValueType> {
    return new FormControl<EditTableModelValueType>(this.initValue ?? [], { nonNullable: true });
  }
}

/**
 * The EditTable Component.
 *
 * Renders an array of row objects as a table with explicitly configured columns.
 * Rows are added and edited through a modal dialog containing a sub-form built
 * from the inline `componentDefinitions` config. The dialog edits a detached
 * copy: sub-form validators must pass before Add/Update applies, and Cancel
 * discards all changes, so the table only ever contains valid rows.
 */
@Component({
  selector: "redbox-edit-table",
  template: `
    @if (isVisible) {
      <ng-container *ngTemplateOutlet="getTemplateRef('before')" />
      <div class="rb-edit-table">
        <table class="table rb-edit-table__table" [attr.aria-label]="label | i18next">
          <thead>
            <tr>
              @for (col of columns; track $index) {
                <th scope="col" [class]="col.cssClasses ?? ''">{{ col.label | i18next }}</th>
              }
              @if (showActions) {
                <th scope="col" class="rb-edit-table__actions-header">{{ 'edit-table-actions-header' | i18next }}</th>
              }
            </tr>
          </thead>
          <tbody>
            @for (row of rows; track $index; let rowIndex = $index) {
              <tr>
                @for (col of columns; track $index; let colIndex = $index) {
                  <td [class]="col.cssClasses ?? ''">{{ cellText(row, col, rowIndex, colIndex) }}</td>
                }
                @if (showActions) {
                  <td class="rb-edit-table__actions">
                    <button type="button" class="btn btn-secondary btn-sm rb-edit-table__edit"
                            [attr.aria-label]="(editButtonLabel | i18next) + ' ' + (rowIndex + 1)"
                            (click)="openDialog($event, rowIndex)">
                      {{ editButtonLabel | i18next }}
                    </button>
                    <button type="button" class="btn btn-danger btn-sm rb-edit-table__delete"
                            [attr.aria-label]="(deleteButtonLabel | i18next) + ' ' + (rowIndex + 1)"
                            (click)="deleteRow(rowIndex)">
                      {{ deleteButtonLabel | i18next }}
                    </button>
                  </td>
                }
              </tr>
            } @empty {
              <tr>
                <td class="rb-edit-table__empty" [attr.colspan]="columns.length + (showActions ? 1 : 0)">
                  {{ emptyMessage | i18next }}
                </td>
              </tr>
            }
          </tbody>
        </table>
        @if (showActions && canAdd) {
          <button type="button" class="btn btn-primary rb-edit-table__add" (click)="openDialog($event)">
            {{ addButtonLabel | i18next }}
          </button>
        }
      </div>
      @if (dialogState(); as state) {
        <div
          class="modal fade show d-block"
          tabindex="-1"
          role="dialog"
          aria-modal="true"
          aria-labelledby="editTableDialogTitle"
          style="background-color: rgba(0,0,0,0.5)"
          (keydown.escape)="cancelDialog()"
        >
          <div class="modal-dialog modal-lg" role="document">
            <div class="modal-content" cdkTrapFocus [cdkTrapFocusAutoCapture]="true">
              <div class="modal-header">
                <h5 id="editTableDialogTitle" class="modal-title">
                  {{ (state.mode === 'edit' ? dialogEditTitle : dialogAddTitle) | i18next }}
                </h5>
                <button type="button" class="btn-close" (click)="cancelDialog()" aria-label="Close"></button>
              </div>
              <div class="modal-body">
                <ng-container #dialogContainer />
              </div>
              <div class="modal-footer">
                <button type="button" class="btn btn-secondary rb-edit-table__dialog-cancel" (click)="cancelDialog()">
                  {{ dialogCancelLabel | i18next }}
                </button>
                <button type="button" class="btn btn-primary rb-edit-table__dialog-save"
                        [disabled]="!dialogValid()" (click)="confirmDialog()">
                  {{ dialogSaveLabel | i18next }}
                </button>
              </div>
            </div>
          </div>
        </div>
      }
      <ng-container *ngTemplateOutlet="getTemplateRef('after')" />
    }
  `,
  standalone: false
})
export class EditTableComponent extends FormFieldBaseComponent<EditTableModelValueType> implements OnDestroy {
  protected override logName = EditTableComponentName;

  @Input() public override model?: EditTableModel;

  private readonly formService = inject(FormService);
  private readonly confirmationDialogService = inject(ConfirmationDialogService);
  private readonly eventBus = inject(FormComponentEventBus);
  private readonly handlebarsTemplateService = inject(HandlebarsTemplateService);

  public columns: EditTableColumnConfig[] = [];
  public addButtonLabel = 'edit-table-add-button-label';
  public editButtonLabel = 'edit-table-edit-button-label';
  public deleteButtonLabel = 'edit-table-delete-button-label';
  public dialogAddTitle = 'edit-table-dialog-add-title';
  public dialogEditTitle = 'edit-table-dialog-edit-title';
  public dialogSaveLabel = 'edit-table-dialog-save-label';
  public dialogCancelLabel = 'edit-table-dialog-cancel-label';
  public emptyMessage = 'edit-table-empty-message';
  public confirmDelete = false;
  public maxRows?: number;

  protected readonly dialogState = signal<EditTableDialogState | null>(null);
  protected readonly dialogValid = signal<boolean>(false);

  protected dialogForm?: FormGroup<Record<string, AbstractControl<unknown>>>;
  protected dialogComponentsMap?: FormComponentsMap;
  private dialogWrapperRefs: ComponentRef<FormBaseWrapperComponent<unknown>>[] = [];
  private dialogStatusSubscription?: Subscription;
  private dialogTriggerElement: HTMLElement | null = null;

  private subFormComponentDefinitions: AvailableFormComponentDefinitionFrames[] = [];
  private compiledItems?: DynamicScriptResponse;
  private hasColumnFormats = false;

  private dialogContainer?: ViewContainerRef;
  private dialogContainerWaiters: Array<(ref: ViewContainerRef) => void> = [];

  @ViewChild('dialogContainer', { read: ViewContainerRef })
  protected set dialogContainerSetter(ref: ViewContainerRef | undefined) {
    this.dialogContainer = ref ?? undefined;
    if (ref) {
      for (const waiter of this.dialogContainerWaiters.splice(0)) {
        waiter(ref);
      }
    }
  }

  protected get getFormComponent(): FormComponent {
    return this.formComponent;
  }

  protected get rows(): EditTableModelValueType {
    return this.model?.formControl?.value ?? [];
  }

  protected get showActions(): boolean {
    return this.getFormComponent.isEditMode && !this.isReadonly && !this.isDisabled;
  }

  protected get canAdd(): boolean {
    return this.maxRows === undefined || this.rows.length < this.maxRows;
  }

  protected override setPropertiesFromComponentMapEntry(formFieldCompMapEntry: FormFieldCompMapEntry): void {
    super.setPropertiesFromComponentMapEntry(formFieldCompMapEntry);

    const componentFormConfig = this.formFieldCompMapEntry?.compConfigJson?.component;
    if (!isTypeFieldDefinitionName<EditTableFieldComponentDefinitionFrame>(componentFormConfig, EditTableComponentName)) {
      throw new Error(`Expected an edit table component, but got ${JSON.stringify(componentFormConfig)}`);
    }
    const cfg = (componentFormConfig.config as EditTableFieldComponentConfig) ?? new EditTableFieldComponentConfig();
    this.columns = cfg.columns ?? [];
    this.addButtonLabel = cfg.addButtonLabel || this.addButtonLabel;
    this.editButtonLabel = cfg.editButtonLabel || this.editButtonLabel;
    this.deleteButtonLabel = cfg.deleteButtonLabel || this.deleteButtonLabel;
    this.dialogAddTitle = cfg.dialogAddTitle || this.dialogAddTitle;
    this.dialogEditTitle = cfg.dialogEditTitle || this.dialogEditTitle;
    this.dialogSaveLabel = cfg.dialogSaveLabel || this.dialogSaveLabel;
    this.dialogCancelLabel = cfg.dialogCancelLabel || this.dialogCancelLabel;
    this.emptyMessage = cfg.emptyMessage || this.emptyMessage;
    this.confirmDelete = cfg.confirmDelete ?? false;
    this.maxRows = typeof cfg.maxRows === 'number' ? cfg.maxRows : undefined;
    this.subFormComponentDefinitions = cfg.componentDefinitions ?? [];
    this.hasColumnFormats = this.columns.some(col => !_isEmpty((col.format ?? '').trim()));
  }

  protected override async initData(): Promise<void> {
    if (this.subFormComponentDefinitions.length < 1) {
      throw new Error(`${this.logName}: Expected an edit table component config with at least one componentDefinition.`);
    }
    if (this.hasColumnFormats) {
      try {
        this.compiledItems = await this.getFormComponent.getRecordCompiledItems();
      } catch (error) {
        this.loggerService.warn(`${this.logName}: Unable to load compiled column format templates, using raw values.`, error);
        this.compiledItems = undefined;
      }
    }
  }

  /**
   * Get the display text for a table cell, applying the column format template when configured.
   */
  protected cellText(row: unknown, col: EditTableColumnConfig, rowIndex: number, colIndex: number): string {
    const value = _get(row, col.path);
    const format = (col.format ?? '').trim();
    if (format && this.compiledItems) {
      const templatePath = [
        ...(this.formFieldCompMapEntry?.lineagePaths?.formConfig ?? []),
        'component', 'config', 'columns', colIndex.toString(), 'format',
      ];
      try {
        const context = { value, row, index: rowIndex };
        const extra = { libraries: this.handlebarsTemplateService.getLibraries() };
        const rendered = this.compiledItems.evaluate(templatePath, context, extra);
        return String(rendered ?? '').trim();
      } catch (error) {
        this.loggerService.warn(`${this.logName}: Failed to evaluate column format template for column '${col.path}'.`, error);
      }
    }
    if (value === undefined || value === null) {
      return '';
    }
    return typeof value === 'string' ? value : String(value);
  }

  /**
   * Open the add/edit dialog. The dialog sub-form is built fresh from a deep copy of the
   * configured componentDefinitions, and edits a detached copy of the row value.
   */
  public async openDialog(event?: Event, rowIndex?: number): Promise<void> {
    if (this.dialogState()) {
      return;
    }
    this.dialogTriggerElement = (event?.currentTarget instanceof HTMLElement) ? event.currentTarget : null;

    const isEdit = rowIndex !== undefined;
    const rowValue = isEdit ? _cloneDeep(this.rows[rowIndex] ?? {}) : {};
    this.dialogValid.set(false);
    this.dialogState.set(isEdit ? { mode: 'edit', rowIndex } : { mode: 'add' });

    try {
      const container = await this.waitForDialogContainer();
      await this.buildDialogSubForm(container, rowValue as Record<string, unknown>);
    } catch (error) {
      this.loggerService.error(`${this.logName}: Failed to build the dialog sub-form.`, error);
      this.closeDialog();
    }
  }

  /**
   * Apply the dialog sub-form value to the table: append for add, replace for edit.
   * Only allowed when the sub-form is valid.
   */
  protected confirmDialog(): void {
    const state = this.dialogState();
    if (!state || !this.dialogForm || this.dialogForm.invalid || !this.model?.formControl) {
      return;
    }
    const rowValue = _cloneDeep(this.dialogForm.getRawValue()) as Record<string, unknown>;
    const next = [...this.rows];
    if (state.mode === 'edit' && state.rowIndex !== undefined) {
      next[state.rowIndex] = rowValue;
    } else {
      next.push(rowValue);
    }
    this.model.formControl.setValue(next);
    this.model.formControl.markAsDirty();
    this.requestFormDirty(state.mode === 'edit' ? 'edit-table-row-updated' : 'edit-table-row-added');
    this.closeDialog();
  }

  /**
   * Discard the dialog edits.
   */
  protected cancelDialog(): void {
    this.closeDialog();
  }

  /**
   * Delete a row, optionally after confirmation.
   */
  public async deleteRow(rowIndex: number): Promise<void> {
    if (!this.model?.formControl) {
      return;
    }
    if (this.confirmDelete) {
      const confirmed = await this.confirmationDialogService.confirm({
        title: 'edit-table-delete-confirm-title',
        message: 'edit-table-delete-confirm-message',
      });
      if (!confirmed) {
        return;
      }
    }
    const next = [...this.rows];
    next.splice(rowIndex, 1);
    this.model.formControl.setValue(next);
    this.model.formControl.markAsDirty();
    this.requestFormDirty('edit-table-row-deleted');
  }

  ngOnDestroy(): void {
    this.teardownDialog();
  }

  protected requestFormDirty(reason: string): void {
    this.eventBus.publish(
      createFormStatusDirtyRequestEvent({
        fieldId: this.formFieldConfigName() || undefined,
        sourceId: this.formFieldConfigName() || undefined,
        reason,
      })
    );
  }

  private waitForDialogContainer(): Promise<ViewContainerRef> {
    if (this.dialogContainer) {
      return Promise.resolve(this.dialogContainer);
    }
    return new Promise<ViewContainerRef>((resolve, reject) => {
      const timeout = setTimeout(() => {
        const index = this.dialogContainerWaiters.indexOf(waiter);
        if (index >= 0) {
          this.dialogContainerWaiters.splice(index, 1);
        }
        reject(new Error(`${this.logName}: Timeout waiting for the dialog container.`));
      }, 2000);
      const waiter = (ref: ViewContainerRef) => {
        clearTimeout(timeout);
        resolve(ref);
      };
      this.dialogContainerWaiters.push(waiter);
    });
  }

  /**
   * Build the dialog sub-form components and the detached FormGroup that buffers the edits.
   * The FormGroup is never attached to the parent form, so changes and validation state
   * remain local to the dialog until confirmed.
   */
  private async buildDialogSubForm(container: ViewContainerRef, rowValue: Record<string, unknown>): Promise<void> {
    const formConfig = this.getFormComponent.formDefMap?.formConfig;
    const formComponentName = this.formFieldCompMapEntry?.compConfigJson?.name ?? "";

    // Deep copy so repeated dialog opens never share or mutate the configured definitions.
    const componentDefinitions = _cloneDeep(this.subFormComponentDefinitions);
    const elementFormConfig: FormConfigFrame = {
      name: `form-config-generated-edit-table-${formComponentName}`,
      componentDefinitions: componentDefinitions,
      defaultComponentConfig: formConfig?.defaultComponentConfig,
      enabledValidationGroups: this.getFormComponent.enabledValidationGroups,
      validationGroups: this.getFormComponent.validationGroups,
    };

    const parentLineagePaths = this.formService.buildLineagePaths(
      this.formFieldCompMapEntry?.lineagePaths,
      {
        angularComponents: [],
        layout: [],
        dataModel: [],
        formConfig: ['component', 'config', 'componentDefinitions'],
      });
    this.dialogComponentsMap = await this.formService.createFormComponentsMap(elementFormConfig, parentLineagePaths);
    if (_isEmpty(this.dialogComponentsMap)) {
      throw new Error(`${this.logName}: No components found in the dialog formComponentsMap.`);
    }

    const dialogForm = new FormGroup<Record<string, AbstractControl<unknown>>>({});
    const formGroupMap = this.formService.groupComponentsByName(this.dialogComponentsMap);
    for (const key of Object.keys(formGroupMap.completeGroupMap ?? {})) {
      // Create the wrapper component in the dialog body.
      const wrapperRef = container.createComponent(FormBaseWrapperComponent<unknown>);
      wrapperRef.instance.defaultComponentConfig = elementFormConfig?.defaultComponentConfig;
      const elemFieldEntry = formGroupMap.completeGroupMap?.[key];
      const compInstance = await wrapperRef.instance.initWrapperComponent(elemFieldEntry);
      this.dialogWrapperRefs.push(wrapperRef);

      const includeInFormControlMap = this.formService.shouldIncludeInFormControlMap(elemFieldEntry);
      if (compInstance?.model && includeInFormControlMap) {
        const elemVal = rowValue?.[key];
        if (!_isUndefined(elemVal)) {
          if (compInstance instanceof RepeatableComponent && Array.isArray(elemVal) && compInstance.formFieldCompMapEntries.length === 0) {
            for (const repeatableValue of elemVal) {
              await compInstance.appendNewElement(repeatableValue, false);
            }
          } else {
            compInstance.model.setValue(elemVal as never);
          }
        }
        const control = compInstance.model.getFormControl();
        if (control) {
          dialogForm.addControl(key, control);
        }
      }

      if (elemFieldEntry) {
        elemFieldEntry.componentRef = wrapperRef;
      }
    }

    this.dialogForm = dialogForm;
    this.dialogValid.set(dialogForm.valid);
    this.dialogStatusSubscription = dialogForm.statusChanges.subscribe(() => {
      this.dialogValid.set(dialogForm.valid);
    });
    dialogForm.updateValueAndValidity();
  }

  private closeDialog(): void {
    this.teardownDialog();
    this.dialogState.set(null);
    this.dialogValid.set(false);
    // Restore focus to the button that opened the dialog.
    const trigger = this.dialogTriggerElement;
    this.dialogTriggerElement = null;
    if (trigger && typeof trigger.focus === 'function') {
      trigger.focus();
    }
  }

  private teardownDialog(): void {
    this.dialogStatusSubscription?.unsubscribe();
    this.dialogStatusSubscription = undefined;
    for (const wrapperRef of this.dialogWrapperRefs.splice(0)) {
      wrapperRef.destroy();
    }
    this.dialogContainer?.clear();
    this.dialogForm = undefined;
    this.dialogComponentsMap = undefined;
  }
}
