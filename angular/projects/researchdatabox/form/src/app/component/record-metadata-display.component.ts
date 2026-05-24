import { Component, DestroyRef, Input, inject } from "@angular/core";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { get as _get } from "lodash-es";
import { FormFieldBaseComponent, FormFieldCompMapEntry, FormFieldModel, HandlebarsTemplateService } from "@researchdatabox/portal-ng-common";
import {
  DynamicScriptResponse,
  FormPrehydrateRecordMetadataItem,
  RecordMetadataDisplayComponentName,
  RecordMetadataDisplayFieldComponentConfig,
  RecordMetadataDisplayFieldComponentConfigOutline,
  RecordMetadataDisplayModelName,
  RecordMetadataDisplayModelValueType,
  RecordMetadataDisplayRenderMode,
  RecordMetadataDisplayTableColumn,
} from "@researchdatabox/sails-ng-common";
import { FormComponent } from "../form.component";
import { FormService } from "../form.service";
import { RecordMetadataDisplayDataService } from "../service/record-metadata-display-data.service";

type DisplayRowState = "success" | "failed";

type DisplayRow = {
  oid: string;
  metadata: Record<string, unknown> | null;
  item: FormPrehydrateRecordMetadataItem;
  state: DisplayRowState;
};

type DisplayContext = {
  oid: string;
  metadata: Record<string, unknown>;
  record: Record<string, unknown>;
  content: Record<string, unknown>;
  branding: string;
  portal: string;
  workflow: Record<string, unknown>;
  formData: Record<string, unknown>;
};

type FullTemplateContext = {
  oids: string[];
  records: Array<Record<string, unknown> | null>;
  loadedRecords: Record<string, unknown>[];
  failedRecords: Array<{ oid: string }>;
  branding: string;
  portal: string;
  workflow: Record<string, unknown>;
  formData: Record<string, unknown>;
};

export class RecordMetadataDisplayModel extends FormFieldModel<RecordMetadataDisplayModelValueType> {
  protected override logName = RecordMetadataDisplayModelName;
}

@Component({
  selector: "redbox-record-metadata-display",
  template: `
    @if (isVisible) {
      <ng-container *ngTemplateOutlet="getTemplateRef('before')" />

      @if (showEmptyContent) {
        <div class="rb-record-metadata-display-empty">{{ translatedEmptyContent }}</div>
      } @else if (loading) {
        <div class="rb-record-metadata-display-loading">{{ translatedLoadingContent }}</div>
      } @else if (hasFatalError) {
        <div class="rb-record-metadata-display-error">{{ translatedErrorContent }}</div>
      } @else if (useTopLevelTemplate) {
        <div class="rb-record-metadata-display-template" [innerHTML]="renderedTemplate"></div>
      } @else if (renderMode === 'joined') {
        <span class="rb-record-metadata-display-joined">{{ joinedContent }}</span>
      } @else if (renderMode === 'list' || useItemTemplate) {
        <div class="rb-record-metadata-display-list">
          @for (row of displayRows; track $index) {
            @if (useItemTemplate) {
              <div class="rb-record-metadata-display-item" [innerHTML]="renderedItemTemplates[$index] ?? ''"></div>
            } @else {
              <div class="rb-record-metadata-display-item">{{ getDefaultRowText(row) }}</div>
            }
          }
        </div>
      } @else {
        <table class="table table-sm rb-record-metadata-display-table">
          <thead>
            <tr>
              @for (column of tableColumns; track $index) {
                <th scope="col">{{ translate(column.label) }}</th>
              }
            </tr>
          </thead>
          <tbody>
            @for (row of displayRows; track $index) {
              <tr>
                @if (row.state === 'failed') {
                  <td [attr.colspan]="tableColumns.length">{{ translate(failedItemContent) }}</td>
                } @else {
                  @for (column of tableColumns; track $index) {
                    <td [innerHTML]="getColumnContent(row, column, $index)"></td>
                  }
                }
              </tr>
            }
          </tbody>
        </table>
      }

      <ng-container *ngTemplateOutlet="getTemplateRef('after')" />
    }
  `,
  styles: [`
    .rb-record-metadata-display-loading,
    .rb-record-metadata-display-empty {
      color: #5f6b78;
    }

    .rb-record-metadata-display-error {
      color: #ab2c2c;
    }

    .rb-record-metadata-display-list {
      display: grid;
      gap: 0.35rem;
    }
  `],
  standalone: false,
})
export class RecordMetadataDisplayComponent extends FormFieldBaseComponent<RecordMetadataDisplayModelValueType> {
  protected override logName = RecordMetadataDisplayComponentName;

  @Input() public override model?: RecordMetadataDisplayModel;

  public loading = false;
  public hasFatalError = false;
  public displayRows: DisplayRow[] = [];
  public renderedTemplate = "";
  public renderedItemTemplates: string[] = [];

  public renderMode: RecordMetadataDisplayRenderMode = "table";
  public separator = ", ";
  public metadataAlias = "metadata";
  public emptyContent = "";
  public loadingContent = "Loading...";
  public errorContent = "Unable to load related record";
  public failedItemContent = "Unable to load record";
  public tableColumns: RecordMetadataDisplayTableColumn[] = [];

  private readonly destroyRef = inject(DestroyRef);
  private readonly formService = inject(FormService);
  private readonly handlebarsTemplateService = inject(HandlebarsTemplateService);
  private readonly dataService = inject(RecordMetadataDisplayDataService);

  private compiledItems?: DynamicScriptResponse;
  private templatePath: Array<string | number> = [];
  private itemTemplatePath: Array<string | number> = [];
  private tableColumnTemplatePaths: Array<Array<string | number>> = [];
  private oidSignature = "";
  private refreshPromise?: Promise<void>;
  private refreshQueued = false;
  private modelSubscriptionInitialised = false;

  protected get getFormComponent(): FormComponent {
    return this.formComponent;
  }

  protected override setPropertiesFromComponentMapEntry(formFieldCompMapEntry: FormFieldCompMapEntry): void {
    super.setPropertiesFromComponentMapEntry(formFieldCompMapEntry);
    const config = (this.componentDefinition?.config as RecordMetadataDisplayFieldComponentConfigOutline) ?? new RecordMetadataDisplayFieldComponentConfig();
    const baseFormConfigPath = [...(formFieldCompMapEntry?.lineagePaths?.formConfig ?? [])];
    this.renderMode = this.normalizeRenderMode(config.renderMode);
    this.separator = String(config.separator ?? ", ");
    this.metadataAlias = String(config.metadataAlias ?? "metadata").trim() || "metadata";
    this.emptyContent = String(config.emptyContent ?? "");
    this.loadingContent = String(config.loadingContent ?? "Loading...");
    this.errorContent = String(config.errorContent ?? "Unable to load related record");
    this.failedItemContent = String(config.failedItemContent ?? "Unable to load record");
    this.tableColumns = Array.isArray(config.tableColumns) && config.tableColumns.length > 0
      ? config.tableColumns.map((column) => ({ ...column }))
      : new RecordMetadataDisplayFieldComponentConfig().tableColumns.map((column) => ({ ...column }));
    this.templatePath = [...baseFormConfigPath, "component", "config", "template"];
    this.itemTemplatePath = [...baseFormConfigPath, "component", "config", "itemTemplate"];
    this.tableColumnTemplatePaths = this.tableColumns.map((_column, index) => [
      ...baseFormConfigPath,
      "component",
      "config",
      "tableColumns",
      index,
      "template",
    ]);
  }

  protected override async initData(): Promise<void> {
    await this.prepareCompiledItems();
    await this.refreshDisplay();
    this.bindModelValueSync();
  }

  public get showEmptyContent(): boolean {
    return !this.loading && !this.hasFatalError && this.displayRows.length === 0;
  }

  public get translatedEmptyContent(): string {
    return this.translate(this.emptyContent);
  }

  public get translatedLoadingContent(): string {
    return this.translate(this.loadingContent);
  }

  public get translatedErrorContent(): string {
    return this.translate(this.errorContent);
  }

  public get useTopLevelTemplate(): boolean {
    return !!this.renderedTemplate && (this.renderMode === "template" || this.displayRows.length === 1);
  }

  public get useItemTemplate(): boolean {
    return this.renderMode !== "template" && this.renderedItemTemplates.length > 0;
  }

  public get joinedContent(): string {
    return this.displayRows.map((row) => this.getDefaultRowText(row)).join(this.separator);
  }

  public getColumnContent(row: DisplayRow, column: RecordMetadataDisplayTableColumn, columnIndex: number): string {
    if (column.hasTemplate) {
      return this.evaluateTemplate(this.tableColumnTemplatePaths[columnIndex], this.getItemTemplateContext(row), String(column.fallback ?? ""));
    }

    const rawValue = column.path ? _get(this.getItemTemplateContext(row), column.path) : undefined;
    const output = rawValue === undefined || rawValue === null || rawValue === ""
      ? this.translate(String(column.fallback ?? ""))
      : String(rawValue);
    return this.escapeHtml(output);
  }

  public getDefaultRowText(row: DisplayRow): string {
    if (row.state === "failed") {
      return this.translate(this.failedItemContent);
    }
    const title = String(row.metadata?.["title"] ?? "").trim();
    return title || row.oid;
  }

  public translate(value?: string): string {
    return this.formService.translate(value);
  }

  private async prepareCompiledItems(): Promise<void> {
    const config = this.componentDefinition?.config as RecordMetadataDisplayFieldComponentConfigOutline | undefined;
    const hasCompiledTemplates = config?.hasTemplate === true
      || config?.hasItemTemplate === true
      || (config?.tableColumns ?? []).some((column) => column?.hasTemplate === true);
    if (!hasCompiledTemplates) {
      this.compiledItems = undefined;
      return;
    }

    try {
      this.compiledItems = await this.getFormComponent.getRecordCompiledItems();
    } catch (error) {
      this.loggerService.warn(`${this.logName}: Unable to load compiled record metadata display templates. Falling back to plain output.`, error);
      this.compiledItems = undefined;
    }
  }

  private bindModelValueSync(): void {
    if (this.modelSubscriptionInitialised) {
      return;
    }
    this.modelSubscriptionInitialised = true;
    this.formControl.valueChanges.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
      void this.scheduleRefreshDisplay();
    });
  }

  private async scheduleRefreshDisplay(): Promise<void> {
    if (this.refreshPromise) {
      this.refreshQueued = true;
      await this.refreshPromise;
      return;
    }

    this.refreshPromise = this.refreshDisplay().finally(() => {
      this.refreshPromise = undefined;
    });
    await this.refreshPromise;

    if (this.refreshQueued) {
      this.refreshQueued = false;
      await this.scheduleRefreshDisplay();
    }
  }

  private async refreshDisplay(): Promise<void> {
    const oids = this.normalizeModelValue(this.model?.getValue());
    const nextSignature = oids.join("\u0000");
    if (nextSignature === this.oidSignature) {
      return;
    }
    this.oidSignature = nextSignature;

    if (oids.length === 0) {
      this.loading = false;
      this.hasFatalError = false;
      this.displayRows = [];
      this.renderedTemplate = "";
      this.renderedItemTemplates = [];
      return;
    }

    this.loading = true;
    this.hasFatalError = false;

    try {
      const uniqueOids = Array.from(new Set(oids));
      const itemByOid = new Map<string, FormPrehydrateRecordMetadataItem>();
      await Promise.all(uniqueOids.map(async (oid) => {
        try {
          const item = await this.dataService.getRecordMetadata(oid);
          itemByOid.set(oid, item);
        } catch {
          itemByOid.set(oid, { oid, error: true });
        }
      }));

      this.displayRows = oids.map((oid) => {
        const item = itemByOid.get(oid) ?? { oid, error: true };
        const metadata = item.error === true ? null : (item.data ?? {});
        return {
          oid,
          metadata,
          item,
          state: item.error === true ? "failed" : "success",
        } satisfies DisplayRow;
      });

      this.renderedTemplate = this.buildRenderedTemplate();
      this.renderedItemTemplates = this.buildRenderedItemTemplates();
    } catch (error) {
      this.loggerService.warn(`${this.logName}: Failed to hydrate record metadata display content.`, error);
      this.displayRows = [];
      this.renderedTemplate = "";
      this.renderedItemTemplates = [];
      this.hasFatalError = true;
    } finally {
      this.loading = false;
    }
  }

  private buildRenderedTemplate(): string {
    const config = this.componentDefinition?.config as RecordMetadataDisplayFieldComponentConfigOutline | undefined;
    if (config?.hasTemplate !== true) {
      return "";
    }
    const context = this.displayRows.length === 1
      ? this.getItemTemplateContext(this.displayRows[0])
      : this.getFullTemplateContext();
    return this.evaluateTemplate(this.templatePath, context, "");
  }

  private buildRenderedItemTemplates(): string[] {
    const config = this.componentDefinition?.config as RecordMetadataDisplayFieldComponentConfigOutline | undefined;
    if (config?.hasItemTemplate !== true) {
      return [];
    }
    return this.displayRows.map((row) => this.evaluateTemplate(this.itemTemplatePath, this.getItemTemplateContext(row), this.getDefaultRowText(row)));
  }

  private evaluateTemplate(path: Array<string | number>, context: Record<string, unknown>, fallback: string): string {
    if (!this.compiledItems || path.length === 0) {
      return this.escapeHtml(this.translate(fallback));
    }

    try {
      const rendered = this.compiledItems.evaluate(path, context, {
        libraries: this.handlebarsTemplateService.getLibraries(),
      });
      const output = String(rendered ?? "").trim();
      if (!output) {
        return this.escapeHtml(this.translate(fallback));
      }
      return output;
    } catch (error) {
      this.loggerService.warn(`${this.logName}: Failed to evaluate record metadata display template.`, error);
      return this.escapeHtml(this.translate(fallback));
    }
  }

  private getItemTemplateContext(row: DisplayRow): DisplayContext & Record<string, unknown> {
    const metadata = row.metadata ?? {};
    const runtimeContext = this.getRuntimeTemplateContext();
    return {
      oid: row.oid,
      metadata,
      [this.metadataAlias]: metadata,
      record: metadata,
      content: metadata,
      branding: runtimeContext.branding,
      portal: runtimeContext.portal,
      workflow: runtimeContext.workflow,
      formData: runtimeContext.formData,
    };
  }

  private getFullTemplateContext(): FullTemplateContext {
    const runtimeContext = this.getRuntimeTemplateContext();
    const loadedRecords = this.displayRows.filter((row) => row.state === "success").map((row) => row.metadata ?? {});
    const failedRecords = this.displayRows.filter((row) => row.state === "failed").map((row) => ({ oid: row.oid }));
    return {
      oids: this.displayRows.map((row) => row.oid),
      records: this.displayRows.map((row) => row.metadata),
      loadedRecords,
      failedRecords,
      branding: runtimeContext.branding,
      portal: runtimeContext.portal,
      workflow: runtimeContext.workflow,
      formData: runtimeContext.formData,
    };
  }

  private getRuntimeTemplateContext(): {
    branding: string;
    portal: string;
    workflow: Record<string, unknown>;
    formData: Record<string, unknown>;
  } {
    const form = this.getFormComponent.form;
    return {
      branding: String(this.getFormComponent.trimmedParams.branding() ?? "").trim(),
      portal: String(this.getFormComponent.trimmedParams.portal() ?? "").trim(),
      workflow: (this.getFormComponent.formConfigMeta["workflow"] ?? {}) as Record<string, unknown>,
      formData: (form?.getRawValue?.() ?? form?.value ?? {}) as Record<string, unknown>,
    };
  }

  private normalizeModelValue(value: RecordMetadataDisplayModelValueType | undefined): string[] {
    if (typeof value === "string") {
      const oid = value.trim();
      return oid ? [oid] : [];
    }
    if (Array.isArray(value)) {
      return value.map((item) => String(item ?? "").trim()).filter(Boolean);
    }
    return [];
  }

  private normalizeRenderMode(value: unknown): RecordMetadataDisplayRenderMode {
    return value === "list" || value === "joined" || value === "template" ? value : "table";
  }

  private escapeHtml(value: string): string {
    return value
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }
}
