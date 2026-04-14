import { Component, HostListener, Injector, Input, inject } from "@angular/core";
import { FormFieldBaseComponent, FormFieldCompMapEntry, FormFieldModel, HandlebarsTemplateService } from "@researchdatabox/portal-ng-common";
import {
  DynamicScriptResponse,
  PDFListComponentName,
  PDFListFieldComponentConfig,
  PDFListFieldComponentConfigOutline,
  PDFListModelName,
  PDFListModelValueType,
  RecordAttachment
} from "@researchdatabox/sails-ng-common";
import { FormComponent } from "../form.component";
import { FormService } from "../form.service";
import { escapeRegExp as _escapeRegExp, isArray as _isArray, isEmpty as _isEmpty, toNumber as _toNumber } from "lodash-es";
import moment from "moment";

interface PDFListAttachmentView extends RecordAttachment {
    formattedDateUpdated: string;
    timestampMs: number;
}

export class PDFListModel extends FormFieldModel<PDFListModelValueType> {
    protected override logName = PDFListModelName;
}

@Component({
    selector: "redbox-pdf-list",
    templateUrl: "./pdf-list.component.html",
    standalone: false
})
export class PDFListComponent extends FormFieldBaseComponent<PDFListModelValueType> {
    protected override logName = PDFListComponentName;

    @Input() public override model?: PDFListModel;

    public startsWith = "rdmp-pdf";
    public recentPdfLimit = 5;
    public showVersionCounter = false;
    public showVersionColumn = false;
    public versionColumnValueField = "";
    public versionColumnLabelKey = "";
    public useVersionLabelForFileName = false;
    public downloadBtnLabel = "Download a PDF of this plan";
    public downloadPreviousBtnLabel = "Download a previous version";
    public downloadPrefix = "rdmp";
    public fileNameTemplate = "";
    public pdfAttachments: PDFListAttachmentView[] = [];
    public latestPdf: PDFListAttachmentView | null = null;
    public showHistoryModal = false;
    public showHistoryMenu = false;

    private readonly injector = inject(Injector);
    private readonly formService = inject(FormService);
    private readonly handlebarsTemplateService = inject(HandlebarsTemplateService);
    private compiledItems?: DynamicScriptResponse;
    private fileNameTemplatePath: Array<string | number> = [];

    protected get getFormComponent(): FormComponent {
        return this.injector.get(FormComponent);
    }

    protected override setPropertiesFromComponentMapEntry(formFieldCompMapEntry: FormFieldCompMapEntry): void {
        super.setPropertiesFromComponentMapEntry(formFieldCompMapEntry);
        const cfg = (this.componentDefinition?.config as PDFListFieldComponentConfigOutline) ?? new PDFListFieldComponentConfig();

        this.startsWith = String(cfg.startsWith ?? "rdmp-pdf");
        this.recentPdfLimit = Number.isFinite(cfg.recentPdfLimit) ? Math.max(1, Number(cfg.recentPdfLimit)) : 5;
        this.showVersionCounter = cfg.showVersionCounter === true;
        this.showVersionColumn = cfg.showVersionColumn === true;
        this.versionColumnValueField = String(cfg.versionColumnValueField ?? "");
        this.versionColumnLabelKey = String(cfg.versionColumnLabelKey ?? "");
        this.useVersionLabelForFileName = cfg.useVersionLabelForFileName ?? this.showVersionColumn;
        this.downloadBtnLabel = String(cfg.downloadBtnLabel ?? "@pdf-download");
        this.downloadPreviousBtnLabel = String(cfg.downloadPreviousBtnLabel ?? "@pdf-download-previous");
        this.downloadPrefix = this.translate(String(cfg.downloadPrefix ?? "rdmp"));
        this.fileNameTemplate = String(cfg.fileNameTemplate ?? "");
        this.fileNameTemplatePath = [...(formFieldCompMapEntry?.lineagePaths?.formConfig ?? []), "component", "config", "fileNameTemplate"];
    }

    protected override async initData(): Promise<void> {
        await Promise.all([this.prepareFileNameTemplate(), this.loadAttachments()]);
    }

    public get previousPdfAttachments(): PDFListAttachmentView[] {
        return this.pdfAttachments.slice(1);
    }

    public get recentPdfAttachments(): PDFListAttachmentView[] {
        return this.pdfAttachments.slice(0, this.recentPdfLimit);
    }

    public get hasHistory(): boolean {
        return this.previousPdfAttachments.length > 0;
    }

    public get hasMoreThanRecent(): boolean {
        return this.pdfAttachments.length > this.recentPdfLimit;
    }

    public async loadAttachments(): Promise<void> {
        const oid = String(this.getFormComponent.trimmedParams.oid() ?? "").trim();
        if (!oid) {
            this.applyAttachments([]);
            return;
        }

        const matchingExpression = new RegExp(`${_escapeRegExp(this.startsWith)}-[0-9a-fA-F]{32}-[0-9]+\\.pdf`);
        try {
            const allAttachments = await this.getFormComponent.recordService.getAttachments(oid);
            const pdfAttachments = (allAttachments ?? [])
                .filter((attachment: RecordAttachment) => matchingExpression.test(String(attachment?.label ?? "")))
                .map((attachment: RecordAttachment) => this.toAttachmentView(attachment))
                .sort((a: PDFListAttachmentView, b: PDFListAttachmentView) => b.timestampMs - a.timestampMs);

            this.applyAttachments(pdfAttachments);
        } catch (error) {
            this.loggerService.error(`${this.logName}: failed to load PDF attachments for oid '${oid}'.`, error);
            this.applyAttachments([]);
        }
    }

    public getDownloadUrl(attachment: RecordAttachment, generateFileName = false, index = 0): string {
        const oid = String(this.getFormComponent.trimmedParams.oid() ?? "").trim();
        const base = String(this.getFormComponent.recordService.brandingAndPortalUrl ?? "").trim();
        const url = `${base}/record/${oid}/datastream?datastreamId=${encodeURIComponent(String(attachment?.label ?? ""))}`;

        if (!this.shouldGenerateFileName(generateFileName)) {
            return url;
        }

        return `${url}&fileName=${encodeURIComponent(this.buildFileName(attachment, index))}`;
    }

    public getVersionLabel(_attachment: RecordAttachment, index: number): string {
        if (!this.versionColumnValueField) {
            return "";
        }

        const versionValue = this.getFormComponent.form?.get(this.versionColumnValueField)?.value;
        let version: unknown = null;
        if (_isArray(versionValue)) {
            version = versionValue[versionValue.length - (index + 1)];
        } else if (versionValue !== null && versionValue !== undefined && versionValue !== "") {
            const numericCandidate = _toNumber(versionValue);
            if (!Number.isFinite(numericCandidate)) {
                return "";
            }
            version = numericCandidate - index;
        }

        if (version === null || version === undefined || version === "") {
            return "";
        }

        return `${this.translate(this.versionColumnLabelKey)}${version}`;
    }

    public getAttachmentSummary(attachment: RecordAttachment, index: number): string {
        const versionLabel = this.getVersionLabel(attachment, index);
        const displayDate = String((attachment as PDFListAttachmentView).formattedDateUpdated ?? attachment.dateUpdated ?? "");
        return _isEmpty(versionLabel)
            ? displayDate
            : `${versionLabel} -- ${displayDate}`;
    }

    public getDropdownAttachmentLabel(attachment: RecordAttachment, index: number): string {
        const versionLabel = this.getVersionLabel(attachment, index);
        const displayDate = String((attachment as PDFListAttachmentView).formattedDateUpdated ?? attachment.dateUpdated ?? "");
        return _isEmpty(versionLabel)
            ? displayDate
            : `${displayDate} -- ${versionLabel}`;
    }

    public getDownloadAriaLabel(attachment: PDFListAttachmentView, index: number): string {
        const actionLabel = this.getDownloadActionLabel(index);
        const summary = this.getAttachmentSummary(attachment, index);
        if (_isEmpty(summary)) {
            return actionLabel;
        }
        return `${actionLabel}: ${summary}`;
    }

    public getDownloadActionLabel(index: number): string {
        const label = index === 0 ? this.downloadBtnLabel : this.downloadPreviousBtnLabel;
        return this.translate(label);
    }

    public openHistoryModal(): void {
        this.showHistoryMenu = false;
        this.showHistoryModal = true;
    }

    public hideHistoryModal(): void {
        this.showHistoryModal = false;
    }

    public toggleHistoryMenu(event?: Event): void {
        event?.stopPropagation();
        this.showHistoryMenu = !this.showHistoryMenu;
    }

    public hideHistoryMenu(): void {
        this.showHistoryMenu = false;
    }

    @HostListener("document:click")
    public onDocumentClick(): void {
        this.hideHistoryMenu();
    }

    @HostListener("document:keydown.escape")
    public onEscape(): void {
        this.hideHistoryMenu();
        this.hideHistoryModal();
    }

    private applyAttachments(attachments: PDFListAttachmentView[]): void {
        this.pdfAttachments = attachments;
        this.latestPdf = attachments[0] ?? null;
        this.formControl.setValue(attachments, { emitEvent: true });
        this.formControl.markAsPristine();
        this.formControl.markAsUntouched();
    }

    private toAttachmentView(attachment: RecordAttachment): PDFListAttachmentView {
        const rawDate = String(attachment?.dateUpdated ?? "");
        const parsed = moment(rawDate);
        return {
            ...attachment,
            formattedDateUpdated: parsed.isValid() ? parsed.format("LLL") : rawDate,
            timestampMs: parsed.isValid() ? parsed.valueOf() : 0,
        };
    }

    private buildFileName(attachment: RecordAttachment, index: number): string {
        const versionLabel = this.useVersionLabelForFileName ? this.getVersionLabel(attachment, index) : "";
        const fallbackFileName = _isEmpty(versionLabel) ? `${this.downloadPrefix}.pdf` : `${this.downloadPrefix}-${versionLabel}.pdf`;

        if (_isEmpty(this.fileNameTemplate)) {
            return fallbackFileName;
        }

        try {
            const rendered = this.compiledItems?.evaluate(
                this.fileNameTemplatePath,
                {
                    attachment,
                    downloadPrefix: this.downloadPrefix,
                    index,
                    versionLabel,
                },
                { libraries: this.handlebarsTemplateService.getLibraries() }
            );
            const output = String(rendered ?? "").trim();
            return output || fallbackFileName;
        } catch (error) {
            this.loggerService.warn(`${this.logName}: Failed to evaluate fileNameTemplate. Falling back to the default PDF filename.`, error);
            return fallbackFileName;
        }
    }

    private shouldGenerateFileName(generateFileName: boolean): boolean {
        return generateFileName || !_isEmpty(this.fileNameTemplate);
    }

    private async prepareFileNameTemplate(): Promise<void> {
        if (_isEmpty(this.fileNameTemplate) || this.fileNameTemplatePath.length === 0) {
            this.compiledItems = undefined;
            return;
        }

        try {
            this.compiledItems = await this.getFormComponent.getRecordCompiledItems();
        } catch (error) {
            this.loggerService.warn(`${this.logName}: Unable to load compiled PDF filename template. Falling back to the default PDF filename.`, error);
            this.compiledItems = undefined;
        }
    }

    private translate(value?: string): string {
        return this.formService.translate(value);
    }
}
