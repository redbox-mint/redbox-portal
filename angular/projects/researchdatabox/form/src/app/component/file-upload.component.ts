import { AfterViewInit, Component, Injector, Input, OnDestroy, inject } from "@angular/core";
import { ConfigService, FormFieldBaseComponent, FormFieldCompMapEntry, FormFieldModel } from "@researchdatabox/portal-ng-common";
import {
    FileUploadAttachmentValue,
    FileUploadComponentName,
    FileUploadFieldComponentConfig,
    FileUploadFieldComponentConfigOutline,
    FileUploadModelName,
    FileUploadModelValueType,
    FileUploadSourceType
} from "@researchdatabox/sails-ng-common";
import Uppy, { UppyFile } from "@uppy/core";
import Dashboard from "@uppy/dashboard";
import Tus from "@uppy/tus";
import Dropbox from "@uppy/dropbox";
import GoogleDrive from "@uppy/google-drive";
import OneDrive from "@uppy/onedrive";

type UppyMeta = Record<string, unknown>;
type UppyBody = Record<string, unknown>;

interface UppySuccessResponse {
    uploadURL?: string;
    body?: {
        uploadURL?: string;
    };
    [key: string]: unknown;
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
import { Subscription } from "rxjs";
import { FormComponent } from "../form.component";
import { FormComponentEventBus, FormSaveSuccessEvent } from "../form-state/events";

const pendingOid = "pending-oid";

export class FileUploadModel extends FormFieldModel<FileUploadModelValueType> {
    protected override logName = FileUploadModelName;
}

interface UppyDependencies {
    UppyCtor: typeof Uppy;
    DashboardPlugin: typeof Dashboard;
    TusPlugin: typeof Tus;
    DropboxPlugin: typeof Dropbox;
    GoogleDrivePlugin: typeof GoogleDrive;
    OneDrivePlugin: typeof OneDrive;
}

interface TusPlugin extends Tus<UppyMeta, UppyBody> {
    setOptions(options: unknown): void;
}

@Component({
    selector: "redbox-file-upload",
    templateUrl: "./file-upload.component.html",
    styleUrls: ["./file-upload.component.scss"],
    standalone: false
})
export class FileUploadComponent extends FormFieldBaseComponent<FileUploadModelValueType> implements AfterViewInit, OnDestroy {
    protected override logName = FileUploadComponentName;

    @Input() public override model?: FileUploadModel;

    public uppyDashboardNote = "Maximum upload size: 1 Gb per file";
    public allowUploadWithoutSave = false;
    public restrictions?: Record<string, unknown>;
    public enabledSources: FileUploadSourceType[] = [];
    public companionUrl?: string;
    public tusHeaders: Record<string, string> = {};
    public attachmentText = "Add attachment(s)";
    public attachmentTextDisabled = "Save your record to attach files";
    public locationHeader = "Location";
    public notesHeader = "Notes";
    public notesEnabled = true;

    private uppy?: Uppy<UppyMeta, UppyBody>;
    private saveSuccessSub?: Subscription;

    private readonly injector = inject(Injector);
    private readonly eventBus = inject(FormComponentEventBus);
    private readonly configService = inject(ConfigService);

    protected get getFormComponent(): FormComponent {
        return this.injector.get(FormComponent);
    }

    protected override setPropertiesFromComponentMapEntry(formFieldCompMapEntry: FormFieldCompMapEntry): void {
        super.setPropertiesFromComponentMapEntry(formFieldCompMapEntry);
        const cfg = (this.componentDefinition?.config as FileUploadFieldComponentConfigOutline) ?? new FileUploadFieldComponentConfig();
        const cfgRecord = cfg as FileUploadFieldComponentConfigOutline & Record<string, unknown>;
        this.uppyDashboardNote = String(cfg.uppyDashboardNote ?? "Maximum upload size: 1 Gb per file");
        this.allowUploadWithoutSave = cfg.allowUploadWithoutSave ?? false;
        this.restrictions = cfg.restrictions;
        this.enabledSources = this.normalizedEnabledSources(cfg.enabledSources);
        this.companionUrl = this.resolveCompanionUrl(cfg.companionUrl);
        this.tusHeaders = (cfg.tusHeaders ?? {}) as Record<string, string>;
        this.attachmentText = String(cfgRecord["attachmentText"] ?? "Add attachment(s)");
        this.attachmentTextDisabled = String(cfgRecord["attachmentTextDisabled"] ?? "Save your record to attach files");
        this.locationHeader = String(cfgRecord["locationHeader"] ?? "Location");
        this.notesHeader = String(cfgRecord["notesHeader"] ?? "Notes");
        this.notesEnabled = cfgRecord["notesEnabled"] !== false;
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

    public get attachments(): FileUploadAttachmentValue[] {
        return this.normalizeAttachments(this.formControl.value ?? this.model?.getValue());
    }

    public isUploadEnabled(): boolean {
        return this.isEditMode() && !this.isDisabled && !this.isReadonly && !this.isUploadBlockedByMissingOid();
    }

    public removeAttachment(index: number): void {
        if (!this.isEditMode() || this.isDisabled || this.isReadonly) {
            return;
        }
        const current = this.attachments;
        if (index < 0 || index >= current.length) {
            return;
        }
        const updated = [...current];
        updated.splice(index, 1);
        this.formControl.setValue(updated);
        this.formControl.markAsDirty();
        this.formControl.markAsTouched();
    }

    public updateAttachmentNotes(index: number, notes: string): void {
        if (!this.isEditMode() || this.isDisabled || this.isReadonly) {
            return;
        }
        const current = this.attachments;
        if (index < 0 || index >= current.length) {
            return;
        }
        const updated = [...current];
        updated[index] = {
            ...updated[index],
            notes: String(notes ?? "") || undefined
        };
        this.formControl.setValue(updated);
        this.formControl.markAsDirty();
        this.formControl.markAsTouched();
    }

    public getLocationLink(attachment: FileUploadAttachmentValue): string {
        const location = String(attachment?.location ?? "").trim();
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

    public isEditMode(): boolean {
        return this.getFormComponent.editMode() && !this.isReadonly;
    }

    public get attachmentButtonText(): string {
        return this.isUploadBlockedByMissingOid() ? this.attachmentTextDisabled : this.attachmentText;
    }

    public isAttachmentButtonDisabled(): boolean {
        return !this.isUploadEnabled();
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

    private onSaveSuccess(event: FormSaveSuccessEvent): void {
        const finalOid = String(event?.oid ?? this.getFormComponent.trimmedParams.oid() ?? "").trim();
        if (!finalOid || finalOid === pendingOid) {
            return;
        }

        const currentFromControl = this.normalizeAttachments(this.formControl.value);
        const current = currentFromControl.length > 0
            ? currentFromControl
            : this.normalizeAttachments(this.model?.getValue());
        const oidPathSegment = `/record/${pendingOid}/`;
        const finalOidPathSegment = `/record/${finalOid}/`;
        const rewritten = current.map((item) => {
            const nextLocation = String(item.location ?? "").split(oidPathSegment).join(finalOidPathSegment);
            const nextUploadUrl = String(item.uploadUrl ?? "").split(oidPathSegment).join(finalOidPathSegment);
            return {
                ...item,
                location: nextLocation,
                uploadUrl: nextUploadUrl,
                pending: false
            };
        });

        this.formControl.setValue(rewritten);
        this.formControl.markAsPristine();

        if (this.uppy) {
            const endpoint = this.buildTusEndpoint(finalOid);
            const tusPlugin = this.uppy.getPlugin("Tus") as unknown as TusPlugin;
            tusPlugin?.setOptions?.({ endpoint });
            if (tusPlugin?.opts) {
                tusPlugin.opts["endpoint"] = endpoint;
            }
        } else {
            this.initialiseUppy();
        }
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
            note: this.uppyDashboardNote,
            metaFields: [
                { id: "notes", name: "Notes", placeholder: "Notes about this file." }
            ]
        });

        this.uppy.use(deps.TusPlugin, {
            endpoint,
            headers: this.buildTusHeaders()
        });
        this.ensureTusHeadersContainCsrf();

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
            const attachment: FileUploadAttachmentValue = {
                type: "attachment",
                pending: oidForUpload === pendingOid,
                location: this.toRelativeAttachmentLocation(uploadUrl, oidForUpload, fileId),
                uploadUrl,
                fileId,
                name: String(file?.meta?.name ?? file?.name ?? ""),
                mimeType: String(file?.type ?? "") || undefined,
                notes: String(file?.meta?.["notes"] ?? "") || undefined,
                size: file?.size && Number.isFinite(file.size) ? Number(file.size) : undefined
            };
            const updated = [...this.attachments, attachment];
            this.formControl.setValue(updated);
            this.formControl.markAsDirty();
            this.formControl.markAsTouched();
        });
    }

    private destroyUppy(): void {
        if (!this.uppy) {
            return;
        }
        this.uppy.destroy?.();
        this.uppy = undefined;
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
        const responseUrl = response?.uploadURL ?? response?.body?.uploadURL ?? "";
        return String(responseUrl ?? "").trim();
    }

    private extractFileId(uploadUrl: string): string {
        if (!uploadUrl) {
            return "";
        }
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
            const parsed = new URL(noQuery);
            return this.extractRelativePath(parsed.pathname, oid, fileId);
        } catch {
            return this.extractRelativePath(noQuery, oid, fileId);
        }
    }

    private extractRelativePath(path: string, oid: string, fileId: string): string {
        const cleanPath = String(path ?? "");
        const marker = "/record/";
        const markerIndex = cleanPath.indexOf(marker);
        if (markerIndex >= 0) {
            return cleanPath.slice(markerIndex);
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

    private normalizeAttachments(value: unknown): FileUploadAttachmentValue[] {
        if (!Array.isArray(value)) {
            return [];
        }
        return value
            .map((item) => item as Partial<FileUploadAttachmentValue>)
            .filter((item) => {
                if (!item || typeof item !== "object") {
                    return false;
                }
                const type = item.type == null ? "attachment" : String(item.type);
                return type === "attachment";
            })
            .map((item) => ({
                type: "attachment",
                location: String(item.location ?? ""),
                uploadUrl: String(item.uploadUrl ?? ""),
                fileId: String(item.fileId ?? ""),
                name: String(item.name ?? ""),
                mimeType: item.mimeType ? String(item.mimeType) : undefined,
                notes: item.notes ? String(item.notes) : undefined,
                size: Number.isFinite(item.size) ? Number(item.size) : undefined,
                pending: item.pending === true
            }));
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

    private ensureTusHeadersContainCsrf(): void {
        if (this.tusHeaders["X-CSRF-Token"]) {
            return;
        }
        const cfgPromise = this.configService.getConfig();
        if (!cfgPromise || typeof cfgPromise.then !== "function") {
            return;
        }
        cfgPromise.then((cfg: unknown) => {
            const token = String(this.readCsrfToken(cfg) ?? this.configService.csrfToken ?? "").trim();
            if (!token || !this.uppy) {
                return;
            }
            const headers = this.buildTusHeaders(token);
            const tusPlugin = this.uppy.getPlugin("Tus") as unknown as TusPlugin;
            tusPlugin?.setOptions?.({ headers });
            if (tusPlugin?.opts) {
                tusPlugin.opts["headers"] = headers;
            }
        }).catch((err: unknown) => {
            console.error('ensureTusHeadersContainCsrf: failed to load config for CSRF token', err);
        });
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

    private readCsrfToken(config: unknown): string | undefined {
        if (!config || typeof config !== "object") {
            return undefined;
        }
        return String((config as CsrfConfigShape).csrfToken ?? "").trim() || undefined;
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

    private resolveCompanionUrl(rawCompanionUrl: unknown): string | undefined {
        const raw = String(rawCompanionUrl ?? "").trim();
        if (!raw) {
            return undefined;
        }
        if (/^https?:\/\//i.test(raw)) {
            return raw.replace(/\/+$/, "");
        }
        if (raw.startsWith("//")) {
            return `${window.location.protocol}${raw}`.replace(/\/+$/, "");
        }
        if (raw.startsWith("/")) {
            return `${window.location.origin}${raw}`.replace(/\/+$/, "");
        }
        return `${window.location.origin}/${raw}`.replace(/\/+$/, "");
    }

    private getUppyDependencies(): UppyDependencies {
        const testDeps = (globalThis as Record<string, unknown>)["__redboxFileUploadUppyDeps"];
        if (testDeps && typeof testDeps === "object") {
            const deps = testDeps as Partial<UppyDependencies>;
            return {
                UppyCtor: deps.UppyCtor ?? Uppy,
                DashboardPlugin: deps.DashboardPlugin ?? Dashboard,
                TusPlugin: deps.TusPlugin ?? Tus,
                DropboxPlugin: deps.DropboxPlugin ?? Dropbox,
                GoogleDrivePlugin: deps.GoogleDrivePlugin ?? GoogleDrive,
                OneDrivePlugin: deps.OneDrivePlugin ?? OneDrive
            };
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
}
