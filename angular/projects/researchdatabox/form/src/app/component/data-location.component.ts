import { AfterViewInit, Component, Input, OnDestroy, Injector, inject } from "@angular/core";
import { ConfigService, FormFieldBaseComponent, FormFieldCompMapEntry, FormFieldModel } from "@researchdatabox/portal-ng-common";
import {
    DataLocationAttachmentValue,
    DataLocationComponentName,
    DataLocationFieldComponentConfig,
    DataLocationFieldComponentConfigOutline,
    DataLocationModelName,
    DataLocationModelValueType,
    DataLocationOption,
    DataLocationValueType,
    FileUploadSourceType
} from "@researchdatabox/sails-ng-common";
import Uppy, { UppyFile } from "@uppy/core";
import Dashboard from "@uppy/dashboard";
import Tus from "@uppy/tus";
import Dropbox from "@uppy/dropbox";
import GoogleDrive from "@uppy/google-drive";
import OneDrive from "@uppy/onedrive";
import { Subscription } from "rxjs";
import { FormComponent } from "../form.component";
import { FormComponentEventBus, FormSaveSuccessEvent } from "../form-state/events";
import {FormService} from "../form.service";

const pendingOid = "pending-oid";

type UppyMeta = Record<string, unknown>;
type UppyBody = Record<string, unknown>;

interface UppySuccessResponse {
    uploadURL?: string;
    body?: {
        uploadURL?: string;
    };
}

interface CsrfConfigShape {
    csrfToken?: unknown;
}

interface CompanionAuthProvider {
    login: (args: unknown) => Promise<unknown>;
    setAuthToken: (token: string) => Promise<unknown> | unknown;
    __redboxAuthFallbackInstalled?: boolean;
}

interface UppyProviderPlugin {
    provider?: CompanionAuthProvider;
}

interface TusPlugin extends Tus<UppyMeta, UppyBody> {
    setOptions(options: unknown): void;
}

interface UppyDependencies {
    UppyCtor: typeof Uppy;
    DashboardPlugin: typeof Dashboard;
    TusPlugin: typeof Tus;
    DropboxPlugin: typeof Dropbox;
    GoogleDrivePlugin: typeof GoogleDrive;
    OneDrivePlugin: typeof OneDrive;
}

interface DraftLocation {
    type: string;
    location: string;
    notes: string;
    isc?: string;
}

export class DataLocationModel extends FormFieldModel<DataLocationModelValueType> {
    protected override logName = DataLocationModelName;
}

@Component({
    selector: "redbox-data-location",
    templateUrl: "./data-location.component.html",
    standalone: false
})
export class DataLocationComponent extends FormFieldBaseComponent<DataLocationModelValueType> implements AfterViewInit, OnDestroy {
    protected override logName = DataLocationComponentName;

    @Input() public override model?: DataLocationModel;

    public uppyDashboardNote = "Maximum upload size: 1 Gb per file";
    public allowUploadWithoutSave = false;
    public restrictions?: Record<string, unknown>;
    public enabledSources: FileUploadSourceType[] = [];
    public companionUrl?: string;
    public tusHeaders: Record<string, string> = {};
    public notesEnabled = true;
    public iscEnabled = false;
    public iscHeader = "Information Security Classification";
    public defaultSelect = "confidential";
    public securityClassificationOptions: DataLocationOption[] = [];
    public locationAddText = "";
    public typeHeader = "Type";
    public locationHeader = "Location";
    public notesHeader = "Notes";
    public editNotesButtonText = "Edit";
    public editNotesTitle = "Edit Notes";
    public cancelEditNotesButtonText = "Cancel";
    public applyEditNotesButtonText = "Apply";
    public editNotesCssClasses = "form-control";
    public dataTypes: DataLocationOption[] = [
        { label: "URL", value: "url" },
        { label: "Physical location", value: "physical" },
        { label: "File path", value: "file" },
        { label: "Attachment", value: "attachment" }
    ];
    public dataTypeLookup: Record<string, string> = {
        url: "URL",
        physical: "Physical location",
        file: "File path",
        attachment: "Attachment"
    };
    public hideNotesForLocationTypes: string[] = [];
    public attachmentText = "Add attachment(s)";
    public attachmentTextDisabled = "Save your record to attach files";
    public draftLocation: DraftLocation = this.createDraftLocation();
    public editingNotesIndex = -1;
    public editingNotesValue = "";

    private uppy?: Uppy<UppyMeta, UppyBody>;
    private saveSuccessSub?: Subscription;

    private readonly injector = inject(Injector);
    private readonly eventBus = inject(FormComponentEventBus);
    private readonly configService = inject(ConfigService);
    private readonly formService = inject(FormService);

    protected get getFormComponent(): FormComponent {
        return this.injector.get(FormComponent);
    }

    protected override setPropertiesFromComponentMapEntry(formFieldCompMapEntry: FormFieldCompMapEntry): void {
        super.setPropertiesFromComponentMapEntry(formFieldCompMapEntry);
        const cfg = (this.componentDefinition?.config as DataLocationFieldComponentConfigOutline) ?? new DataLocationFieldComponentConfig();
        const cfgRecord = cfg as DataLocationFieldComponentConfigOutline & Record<string, unknown>;
        this.uppyDashboardNote = String(cfg.uppyDashboardNote ?? "Maximum upload size: 1 Gb per file");
        this.allowUploadWithoutSave = cfg.allowUploadWithoutSave ?? false;
        this.restrictions = cfg.restrictions;
        this.enabledSources = this.normalizedEnabledSources(cfg.enabledSources);
        this.companionUrl = this.resolveCompanionUrl(cfg.companionUrl);
        this.tusHeaders = (cfg.tusHeaders ?? {}) as Record<string, string>;
        this.notesEnabled = cfg.notesEnabled !== false;
        this.iscEnabled = cfg.iscEnabled === true;
        this.iscHeader = String(cfg.iscHeader ?? "Information Security Classification");
        this.defaultSelect = String(cfg.defaultSelect ?? "confidential");
        this.securityClassificationOptions = Array.isArray(cfg.securityClassificationOptions) ? cfg.securityClassificationOptions : [];
        this.locationAddText = String(cfg.locationAddText ?? "");
        this.typeHeader = String(cfg.typeHeader ?? "Type");
        this.locationHeader = String(cfg.locationHeader ?? "Location");
        this.notesHeader = String(cfg.notesHeader ?? "Notes");
        this.editNotesButtonText = String(cfg.editNotesButtonText ?? "Edit");
        this.editNotesTitle = String(cfg.editNotesTitle ?? "Edit Notes");
        this.cancelEditNotesButtonText = String(cfg.cancelEditNotesButtonText ?? "Cancel");
        this.applyEditNotesButtonText = String(cfg.applyEditNotesButtonText ?? "Apply");
        this.editNotesCssClasses = String(cfg.editNotesCssClasses ?? "form-control");
        this.dataTypes = Array.isArray(cfg.dataTypes) && cfg.dataTypes.length > 0 ? cfg.dataTypes : this.dataTypes;
        this.dataTypeLookup = cfgRecord["dataTypeLookup"] && typeof cfgRecord["dataTypeLookup"] === "object"
            ? { ...this.dataTypeLookup, ...(cfgRecord["dataTypeLookup"] as Record<string, string>) }
            : this.dataTypeLookup;
        this.hideNotesForLocationTypes = Array.isArray(cfg.hideNotesForLocationTypes) ? cfg.hideNotesForLocationTypes.map(String) : [];
        this.attachmentText = String(cfgRecord["attachmentText"] ?? "Add attachment(s)");
        this.attachmentTextDisabled = String(cfgRecord["attachmentTextDisabled"] ?? "Save your record to attach files");
        this.draftLocation = this.createDraftLocation();
    }

    override ngAfterViewInit(): void {
        super.ngAfterViewInit();
        this.initialiseUppy();
        this.saveSuccessSub = this.eventBus.select$("form.save.success").subscribe((event) => this.onSaveSuccess(event));
    }

    ngOnDestroy(): void {
        this.saveSuccessSub?.unsubscribe();
        this.saveSuccessSub = undefined;
        this.destroyUppy();
    }

    public get dataLocations(): DataLocationValueType[] {
        return this.normalizeDataLocations(this.formControl.value ?? this.model?.getValue());
    }

    public isEditMode(): boolean {
        return this.getFormComponent.editMode() && !this.isReadonly;
    }

    public isUploadEnabled(): boolean {
        return this.isEditMode() && !this.isDisabled && !this.isReadonly && !this.isUploadBlockedByMissingOid();
    }

    public isNotesHiddenForLocationType(type: string): boolean {
        return this.hideNotesForLocationTypes.includes(String(type ?? ""));
    }

    public onDraftTypeChange(nextType: string): void {
        this.draftLocation = {
            ...this.draftLocation,
            type: String(nextType ?? "url"),
            location: nextType === "attachment" ? "" : this.draftLocation.location,
            notes: this.isNotesHiddenForLocationType(nextType) ? "" : this.draftLocation.notes
        };
    }

    public updateDraftLocation(value: string): void {
        this.draftLocation = { ...this.draftLocation, location: value };
    }

    public updateDraftNotes(value: string): void {
        this.draftLocation = { ...this.draftLocation, notes: value };
    }

    public updateDraftIsc(value: string): void {
        this.draftLocation = { ...this.draftLocation, isc: value };
    }

    public addLocation(): void {
        if (!this.isEditMode() || this.isDisabled || this.isReadonly || this.draftLocation.type === "attachment") {
            return;
        }
        const location = this.draftLocation.location.trim();
        if (!location) {
            return;
        }
        const newValue: DataLocationValueType = {
            type: this.isSupportedDraftType(this.draftLocation.type) ? this.draftLocation.type : "url",
            location,
            notes: this.notesEnabled && !this.isNotesHiddenForLocationType(this.draftLocation.type)
                ? this.optionalString(this.draftLocation.notes)
                : undefined,
            isc: this.iscEnabled ? this.optionalString(this.draftLocation.isc) : undefined
        };
        this.updateValue([...this.dataLocations, newValue]);
        this.draftLocation = this.createDraftLocation();
    }

    public removeLocation(index: number): void {
        if (!this.isEditMode() || this.isDisabled || this.isReadonly) {
            return;
        }
        const updated = [...this.dataLocations];
        if (index < 0 || index >= updated.length) {
            return;
        }
        updated.splice(index, 1);
        this.updateValue(updated);
        if (this.editingNotesIndex === index) {
            this.cancelEditNotes();
        }
    }

    public openModal(): void {
        if (!this.isUploadEnabled()) {
            return;
        }
        if (!this.uppy) {
            this.initialiseUppy();
        }
        const dashboardPlugin = this.uppy?.getPlugin("Dashboard") as Dashboard<UppyMeta, UppyBody>;
        dashboardPlugin?.openModal();
    }

    public get attachmentButtonText(): string {
        return this.isUploadBlockedByMissingOid() ? this.attachmentTextDisabled : this.attachmentText;
    }

    public isAttachmentButtonDisabled(): boolean {
        return !this.isUploadEnabled();
    }

    public startEditNotes(index: number): void {
        const item = this.dataLocations[index];
        if (!item || !this.isEditMode()) {
            return;
        }
        this.editingNotesIndex = index;
        this.editingNotesValue = String(item.notes ?? "");
    }

    public cancelEditNotes(): void {
        this.editingNotesIndex = -1;
        this.editingNotesValue = "";
    }

    public applyEditNotes(): void {
        if (this.editingNotesIndex < 0) {
            return;
        }
        const updated = [...this.dataLocations];
        const current = updated[this.editingNotesIndex];
        if (!current) {
            this.cancelEditNotes();
            return;
        }
        updated[this.editingNotesIndex] = {
            ...current,
            notes: this.optionalString(this.editingNotesValue)
        };
        this.updateValue(updated);
        this.cancelEditNotes();
    }

    public getLocationTypeLabel(item: DataLocationValueType): string {
        return this.dataTypeLookup[String(item?.type ?? "")] ?? String(item?.type ?? "");
    }

    public getLocationDisplayText(item: DataLocationValueType): string {
        if (item.type === "attachment") {
            return String(item.name ?? item.fileId ?? item.location ?? "");
        }
        return String(item.location ?? "");
    }

    public getLocationHref(item: DataLocationValueType): string {
        if (item.type === "url") {
            return String(item.location ?? "");
        }
        if (item.type === "attachment") {
            const location = String(item.location ?? "").trim();
            if (!location) {
                return "";
            }
            if (/^https?:\/\//i.test(location)) {
                return location;
            }
            const base = String(this.getFormComponent.recordService.brandingAndPortalUrl ?? "").trim();
            if (base) {
                return `${base}${location.startsWith("/") ? "" : "/"}${location}`;
            }
            return `${window.location.origin}${location.startsWith("/") ? "" : "/"}${location}`;
        }
        return "";
    }

    public isLinkLocation(item: DataLocationValueType): boolean {
        if (item.type === "attachment") {
            return !item.pending;
        }
        return item.type === "url";
    }

    private initialiseUppy(): void {
        if (this.uppy || !this.isEditMode()) {
            return;
        }
        if (this.isUploadBlockedByMissingOid()) {
            return;
        }

        const currentOid = this.resolveOidForUpload();
        const endpoint = this.buildTusEndpoint(currentOid);
        const deps = this.getUppyDependencies();

        this.uppy = new deps.UppyCtor({
            autoProceed: false,
            restrictions: this.restrictions
        });

        this.uppy.use(deps.DashboardPlugin, {
            inline: false,
            hideProgressAfterFinish: true,
            proudlyDisplayPoweredByUppy: false,
            note: this.translateText(this.uppyDashboardNote),
            metaFields: this.notesEnabled
                ? [{ id: "notes", name: "Notes", placeholder: "Notes about this file." }]
                : []
        });

        this.uppy.use(deps.TusPlugin, {
            endpoint,
            headers: this.buildTusHeaders()
        });

        // Kick off an async attempt to populate CSRF headers if available.
        // Also ensure headers are set before uploads by awaiting during file-added.
        void this.ensureTusHeadersContainCsrf();

        this.uppy.on("file-added", async () => {
            await this.ensureTusHeadersContainCsrf();
        });

        this.uppy.on("upload", (_uploadID: string, files: UppyFile<UppyMeta, UppyBody>[]) => {
            this.configureTusEndpointForUpload(files);
        });

        if (this.companionUrl) {
            if (this.enabledSources.includes("dropbox")) {
                this.uppy.use(deps.DropboxPlugin, { companionUrl: this.companionUrl });
            }
            if (this.enabledSources.includes("googleDrive")) {
                this.uppy.use(deps.GoogleDrivePlugin, { companionUrl: this.companionUrl });
                this.installProviderAuthFallback("GoogleDrive", ["companion-GoogleDrive-auth-token"], ["uppyAuthToken--googledrive", "uppyAuthToken--drive"]);
            }
            if (this.enabledSources.includes("onedrive")) {
                this.uppy.use(deps.OneDrivePlugin, { companionUrl: this.companionUrl });
                this.installProviderAuthFallback("OneDrive", ["companion-OneDrive-auth-token"], ["uppyAuthToken--onedrive"]);
            }
        }

        this.uppy.on("upload-success", (file: UppyFile<UppyMeta, UppyBody> | undefined, response: UppySuccessResponse) => {
            const uploadUrl = this.resolveUploadUrl(response);
            const fileId = this.extractFileId(uploadUrl);
            const oidForUpload = this.resolveOidForUpload();
            const attachment: DataLocationAttachmentValue = {
                type: "attachment",
                pending: oidForUpload === pendingOid,
                location: this.toRelativeAttachmentLocation(uploadUrl, oidForUpload, fileId),
                uploadUrl,
                fileId,
                name: String(file?.meta?.name ?? file?.name ?? ""),
                mimeType: String(file?.type ?? "") || undefined,
                notes: this.notesEnabled ? this.optionalString(String(file?.meta?.["notes"] ?? this.draftLocation.notes ?? "")) : undefined,
                size: file?.size && Number.isFinite(file.size) ? Number(file.size) : undefined,
                isc: this.iscEnabled ? this.optionalString(this.draftLocation.isc) : undefined
            };
            this.updateValue([...this.dataLocations, attachment]);
            this.draftLocation = this.createDraftLocation();
        });
    }

    private destroyUppy(): void {
        this.uppy?.destroy?.();
        this.uppy = undefined;
    }

    private onSaveSuccess(event: FormSaveSuccessEvent): void {
        const finalOid = String(event?.oid ?? this.getFormComponent.trimmedParams.oid() ?? "").trim();
        if (!finalOid || finalOid === pendingOid) {
            return;
        }

        const current = this.dataLocations;
        const pendingMarker = `/record/${pendingOid}/`;
        const finalMarker = `/record/${finalOid}/`;
        const rewritten = current.map((item) => {
            if (item.type !== "attachment") {
                return item;
            }
            return {
                ...item,
                location: String(item.location ?? "").split(pendingMarker).join(finalMarker),
                uploadUrl: String(item.uploadUrl ?? "").split(pendingMarker).join(finalMarker),
                pending: false
            };
        });
        this.updateValue(rewritten, false);

        if (this.uppy) {
            const endpoint = this.buildTusEndpoint(finalOid);
            const tusPlugin = this.uppy.getPlugin("Tus") as unknown as TusPlugin;
            tusPlugin?.setOptions?.({ endpoint });
            if (tusPlugin?.opts) {
                tusPlugin.opts["endpoint"] = endpoint;
            }
        }
    }

    private updateValue(nextValue: DataLocationValueType[], markDirty = true): void {
        this.formControl.setValue(nextValue);
        if (markDirty) {
            this.formControl.markAsDirty();
        }
        this.formControl.markAsTouched();
    }

    private createDraftLocation(): DraftLocation {
        return {
            type: "url",
            location: "",
            notes: "",
            isc: this.iscEnabled ? this.defaultSelect : undefined
        };
    }

    private translateText(value: string): string {
        return this.formService.translate(value);
    }

    private isUploadBlockedByMissingOid(): boolean {
        const oid = this.getFormComponent.trimmedParams.oid();
        return !oid && !this.allowUploadWithoutSave;
    }

    private resolveOidForUpload(): string {
        return this.getFormComponent.trimmedParams.oid() || (this.allowUploadWithoutSave ? pendingOid : "");
    }

    private buildTusEndpoint(oid: string, useCompanionRoute = false): string {
        const base = String(this.getFormComponent.recordService.brandingAndPortalUrl ?? "").trim();
        if (useCompanionRoute) {
            return `${base}/companion/record/${oid}/attach`;
        }
        return `${base}/record/${oid}/attach`;
    }

    private configureTusEndpointForUpload(files?: UppyFile<UppyMeta, UppyBody>[]): void {
        if (!this.uppy) {
            return;
        }
        const hasRemoteSource = (files ?? []).some((file) => file?.isRemote === true);
        const endpoint = this.buildTusEndpoint(this.resolveOidForUpload(), hasRemoteSource);
        const tusPlugin = this.uppy.getPlugin("Tus") as unknown as TusPlugin;
        tusPlugin?.setOptions?.({ endpoint });
        const tusOpts = (tusPlugin as unknown as { opts?: Record<string, unknown> })?.opts;
        if (tusOpts) {
            tusOpts["endpoint"] = endpoint;
        }
    }

    private resolveUploadUrl(response: UppySuccessResponse): string {
        return String(response?.uploadURL ?? response?.body?.uploadURL ?? "").trim();
    }

    private extractFileId(uploadUrl: string): string {
        const raw = uploadUrl.split("?")[0];
        const parts = raw.split("/").filter(Boolean);
        return parts[parts.length - 1] ?? "";
    }

    private toRelativeAttachmentLocation(uploadUrl: string, oid: string, fileId: string): string {
        if (!uploadUrl) {
            return `/record/${oid}/attach/${fileId}`;
        }
        const noQuery = uploadUrl.split("?")[0];
        try {
            return this.extractRelativePath(new URL(noQuery).pathname, oid, fileId);
        } catch {
            return this.extractRelativePath(noQuery, oid, fileId);
        }
    }

    private extractRelativePath(path: string, oid: string, fileId: string): string {
        const marker = "/record/";
        const markerIndex = String(path ?? "").indexOf(marker);
        if (markerIndex >= 0) {
            return String(path).slice(markerIndex);
        }
        return `/record/${oid}/attach/${fileId}`;
    }

    private normalizedEnabledSources(enabledSources?: FileUploadSourceType[]): FileUploadSourceType[] {
        const valid: FileUploadSourceType[] = ["dropbox", "googleDrive", "onedrive"];
        const sourceSet = new Set<FileUploadSourceType>();
        for (const source of enabledSources ?? []) {
            if (valid.includes(source)) {
                sourceSet.add(source);
            }
        }
        return Array.from(sourceSet);
    }

    private normalizeDataLocations(value: unknown): DataLocationValueType[] {
        if (!Array.isArray(value)) {
            return [];
        }
        return value
            .filter((item) => item && typeof item === "object")
            .map((item) => item as Partial<DataLocationValueType & DataLocationAttachmentValue>)
            .map((item) => {
                const type = String(item.type ?? "url");
                if (type === "attachment") {
                    return {
                        type: "attachment",
                        location: String(item.location ?? ""),
                        uploadUrl: String(item.uploadUrl ?? ""),
                        fileId: String(item.fileId ?? ""),
                        name: String(item.name ?? ""),
                        mimeType: item.mimeType ? String(item.mimeType) : undefined,
                        notes: this.optionalString(item.notes),
                        isc: this.optionalString(item.isc),
                        size: Number.isFinite(item.size) ? Number(item.size) : undefined,
                        pending: item.pending === true
                    } satisfies DataLocationAttachmentValue;
                }

                return {
                    type: this.isSupportedDraftType(type) ? type : "url",
                    location: String(item.location ?? ""),
                    notes: this.optionalString(item.notes),
                    isc: this.optionalString(item.isc)
                } as DataLocationValueType;
            });
    }

    private buildTusHeaders(csrfToken?: string): Record<string, string> {
        const headers = { ...this.tusHeaders };
        const resolvedCsrfToken = String(csrfToken ?? this.resolveImmediateCsrfToken() ?? "").trim();
        if (resolvedCsrfToken && !headers["X-CSRF-Token"]) {
            headers["X-CSRF-Token"] = resolvedCsrfToken;
        }
        return headers;
    }

    private resolveImmediateCsrfToken(): string {
        const directToken = String(this.configService.csrfToken ?? "").trim();
        if (directToken) {
            return directToken;
        }
        const cfg = this.configService.getConfig();
        if (cfg && typeof cfg.then !== "function") {
            return String(this.readCsrfToken(cfg) ?? "").trim();
        }
        return "";
    }

    private async ensureTusHeadersContainCsrf(): Promise<void> {
        if (this.tusHeaders["X-CSRF-Token"]) {
            return;
        }
        const cfgPromise = this.configService.getConfig();
        if (!cfgPromise || typeof cfgPromise.then !== "function") {
            return;
        }
        try {
            const cfg = await cfgPromise;
            const token = String(this.readCsrfToken(cfg) ?? this.configService.csrfToken ?? "").trim();
            if (!token || !this.uppy) {
                return;
            }
            const headers = this.buildTusHeaders(token);
            this.tusHeaders = headers;
            const tusPlugin = this.uppy.getPlugin("Tus") as unknown as TusPlugin;
            tusPlugin?.setOptions?.({ headers });
            if (tusPlugin?.opts) {
                tusPlugin.opts["headers"] = headers;
            }
        } catch (err) {
            this.loggerService.error("ensureTusHeadersContainCsrf: failed to load config for CSRF token", err);
        }
    }

    private readCsrfToken(config: unknown): string | undefined {
        if (!config || typeof config !== "object") {
            return undefined;
        }
        return String((config as CsrfConfigShape).csrfToken ?? "").trim() || undefined;
    }

    private installProviderAuthFallback(pluginId: string, tokenStorageKeys: string[], cookieNames: string[]): void {
        if (!this.uppy) {
            return;
        }
        const plugin = this.uppy.getPlugin(pluginId);
        if (!this.isProviderPlugin(plugin)) {
            return;
        }
        const provider = plugin.provider;
        if (!provider || typeof provider.login !== "function" || typeof provider.setAuthToken !== "function") {
            return;
        }
        if (provider.__redboxAuthFallbackInstalled) {
            return;
        }

        const originalLogin = provider.login.bind(provider);
        provider.login = async (args: unknown) => {
            try {
                return await originalLogin(args);
            } catch (err: unknown) {
                const message = String((err as { message?: unknown })?.message ?? "");
                if (message.includes("Auth window was closed by the user")) {
                    const token = this.findCompanionToken(tokenStorageKeys, cookieNames);
                    if (token) {
                        await provider.setAuthToken(token);
                        return;
                    }
                }
                throw err;
            }
        };
        provider.__redboxAuthFallbackInstalled = true;
    }

    private isProviderPlugin(plugin: unknown): plugin is UppyProviderPlugin {
        return !!plugin && typeof plugin === "object" && "provider" in plugin;
    }

    private findCompanionToken(tokenStorageKeys: string[], cookieNames: string[]): string | undefined {
        for (const key of tokenStorageKeys) {
            const token = String(localStorage.getItem(key) ?? "").trim();
            if (token) {
                return token;
            }
        }
        const rawCookie = String(document.cookie ?? "");
        if (!rawCookie) {
            return undefined;
        }
        const segments = rawCookie.split(";");
        for (const name of cookieNames) {
            for (const rawSegment of segments) {
                const segment = rawSegment.trim();
                if (!segment.startsWith(`${name}=`)) {
                    continue;
                }
                const value = segment.substring(name.length + 1).trim();
                if (!value) {
                    continue;
                }
                try {
                    return decodeURIComponent(value);
                } catch {
                    return value;
                }
            }
        }
        return undefined;
    }

    private resolveCompanionUrl(companionUrl?: string): string | undefined {
        const raw = this.optionalString(companionUrl);
        const base = this.optionalString(this.getFormComponent.recordService.brandingAndPortalUrl);

        let resolved: string | undefined;

        if (raw) {
            // Absolute HTTP(S) URL or protocol-relative URL: use as-is (later trim trailing slash).
            if (/^https?:\/\//i.test(raw) || raw.startsWith("//")) {
                resolved = raw;
            } else if (raw.startsWith("/")) {
                // Path relative to branding/portal base.
                if (base) {
                    const normalizedBase = base.replace(/\/+$/, "");
                    resolved = normalizedBase + raw;
                } else {
                    resolved = raw;
                }
            } else {
                // Relative segment: append to base if available, otherwise return as-is.
                if (base) {
                    const normalizedBase = base.replace(/\/+$/, "");
                    const normalizedSegment = raw.replace(/^\/+/, "");
                    resolved = `${normalizedBase}/${normalizedSegment}`;
                } else {
                    resolved = raw;
                }
            }
        } else if (base) {
            // No explicit companionUrl: default to `${base}/companion`.
            const normalizedBase = base.replace(/\/+$/, "");
            resolved = `${normalizedBase}/companion`;
        }

        if (!resolved) {
            return undefined;
        }

        // Strip trailing slashes for consistency (but preserve protocol-relative `//` prefix).
        const matchProtocolRelative = resolved.match(/^(\/\/[^/]+)(\/.*)?$/);
        if (matchProtocolRelative) {
            const hostPart = matchProtocolRelative[1];
            const pathPart = matchProtocolRelative[2] ?? "";
            const normalizedPath = pathPart.replace(/\/+$/, "");
            return hostPart + normalizedPath;
        }

        return resolved.replace(/\/+$/, "");
    }

    private getUppyDependencies(): UppyDependencies {
        const external = (globalThis as Record<string, unknown>)["__redboxFileUploadUppyDeps"];
        if (external && typeof external === "object") {
            return external as UppyDependencies;
        }
        return {
            UppyCtor: Uppy,
            DashboardPlugin: Dashboard,
            TusPlugin: Tus,
            DropboxPlugin: Dropbox,
            GoogleDrivePlugin: GoogleDrive,
            OneDrivePlugin: OneDrive
        };
    }

    private optionalString(value: unknown): string | undefined {
        const trimmed = String(value ?? "").trim();
        return trimmed || undefined;
    }

    private isSupportedDraftType(type: string): type is "url" | "physical" | "file" {
        return type === "url" || type === "physical" || type === "file";
    }
}
