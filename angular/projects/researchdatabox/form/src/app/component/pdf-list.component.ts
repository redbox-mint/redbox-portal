import { Component, HostListener, Injector, Input, inject } from "@angular/core";
import { FormFieldBaseComponent, FormFieldCompMapEntry, FormFieldModel } from "@researchdatabox/portal-ng-common";
import {
    PDFListComponentName,
    PDFListFieldComponentConfig,
    PDFListFieldComponentConfigOutline,
    PDFListModelName,
    PDFListModelValueType,
    RecordAttachment
} from "@researchdatabox/sails-ng-common";
import { FormComponent } from "../form.component";
import { FormService } from "../form.service";
import { escapeRegExp as _escapeRegExp, isArray as _isArray, isEmpty as _isEmpty, template as _template, toNumber as _toNumber } from "lodash-es";
import moment from "moment";
import * as numeral from "numeral";

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

    protected get getFormComponent(): FormComponent {
        return this.injector.get(FormComponent);
    }

    protected override setPropertiesFromComponentMapEntry(formFieldCompMapEntry: FormFieldCompMapEntry): void {
        super.setPropertiesFromComponentMapEntry(formFieldCompMapEntry);
        const cfg = (this.componentDefinition?.config as PDFListFieldComponentConfigOutline) ?? new PDFListFieldComponentConfig();

        this.startsWith = String(cfg.startsWith ?? "rdmp-pdf");
        this.showVersionColumn = cfg.showVersionColumn === true;
        this.versionColumnValueField = String(cfg.versionColumnValueField ?? "");
        this.versionColumnLabelKey = String(cfg.versionColumnLabelKey ?? "");
        this.useVersionLabelForFileName = cfg.useVersionLabelForFileName ?? this.showVersionColumn;
        this.downloadBtnLabel = String(cfg.downloadBtnLabel ?? "Download a PDF of this plan");
        this.downloadPreviousBtnLabel = String(cfg.downloadPreviousBtnLabel ?? "Download a previous version");
        this.downloadPrefix = this.translate(String(cfg.downloadPrefix ?? "rdmp"));
        this.fileNameTemplate = String(cfg.fileNameTemplate ?? "");
    }

    protected override async initData(): Promise<void> {
        await this.loadAttachments();
    }

    public get previousPdfAttachments(): PDFListAttachmentView[] {
        return this.pdfAttachments.slice(1);
    }

    public get hasHistory(): boolean {
        return this.previousPdfAttachments.length > 0;
    }

    public async loadAttachments(): Promise<void> {
        const oid = String(this.getFormComponent.trimmedParams.oid() ?? "").trim();
        if (!oid) {
            this.applyAttachments([]);
            return;
        }

        const matchingExpression = new RegExp(`${_escapeRegExp(this.startsWith)}-[0-9a-fA-F]{32}-[0-9]+\\.pdf`);
        const allAttachments = await this.getFormComponent.recordService.getAttachments(oid);
        const pdfAttachments = (allAttachments ?? [])
            .filter((attachment: RecordAttachment) => matchingExpression.test(String(attachment?.label ?? "")))
            .map((attachment: RecordAttachment) => this.toAttachmentView(attachment))
            .sort((a: PDFListAttachmentView, b: PDFListAttachmentView) => b.timestampMs - a.timestampMs);

        this.applyAttachments(pdfAttachments);
    }

    public getDownloadUrl(attachment: RecordAttachment, generateFileName = false, index = 0): string {
        const oid = String(this.getFormComponent.trimmedParams.oid() ?? "").trim();
        const base = String(this.getFormComponent.recordService.brandingAndPortalUrl ?? "").trim();
        const url = `${base}/record/${oid}/datastream?datastreamId=${encodeURIComponent(String(attachment?.label ?? ""))}`;

        if (!generateFileName) {
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
        } else if (!_isEmpty(versionValue)) {
            version = _toNumber(versionValue) - index;
        }

        if (version === null || version === undefined || version === "") {
            return "";
        }

        return `${this.translate(this.versionColumnLabelKey)}${version}`;
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
        this.formControl.setValue(attachments, { emitEvent: false });
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

        if (_isEmpty(this.fileNameTemplate)) {
            return _isEmpty(versionLabel) ? `${this.downloadPrefix}.pdf` : `${this.downloadPrefix}-${versionLabel}.pdf`;
        }

        const compiled = _template(this.fileNameTemplate, {
            imports: {
                versionLabel,
                moment,
                numeral,
                ...this
            }
        });
        return String(compiled());
    }

    private translate(value?: string): string {
        return this.formService.translate(value);
    }
}
