import { TestBed } from "@angular/core/testing";
import { By } from "@angular/platform-browser";
import { FormConfigFrame } from "@researchdatabox/sails-ng-common";
import { createFormAndWaitForReady, createTestbedModule } from "../helpers.spec";
import { DataLocationComponent } from "./data-location.component";
import { FormComponentEventBus, createFormSaveSuccessEvent } from "../form-state/events";

class FakeUppy {
    public plugins: Record<string, any> = {};
    public handlers: Record<string, Function[]> = {};
    public destroy = jasmine.createSpy("destroy");

    use(plugin: any, options: any): this {
        const pluginName = String(plugin?.name ?? "");
        if (pluginName.includes("Tus")) {
            this.plugins["Tus"] = {
                opts: options,
                setOptions: jasmine.createSpy("setOptions").and.callFake((nextOptions: any) => {
                    this.plugins["Tus"].opts = {
                        ...(this.plugins["Tus"].opts ?? {}),
                        ...(nextOptions ?? {})
                    };
                })
            };
        }
        if (pluginName.includes("Dashboard")) {
            this.plugins["Dashboard"] = {
                openModal: jasmine.createSpy("openModal")
            };
        }
        return this;
    }

    on(eventName: string, handler: Function): this {
        this.handlers[eventName] = this.handlers[eventName] ?? [];
        this.handlers[eventName].push(handler);
        return this;
    }

    getPlugin(name: string): any {
        return this.plugins[name];
    }

    emit(eventName: string, ...args: unknown[]): void {
        (this.handlers[eventName] ?? []).forEach((handler) => handler(...args));
    }
}

const deferredEditModeProps = {
    oid: 'record-1', editMode: true, recordType: 'rdmp',
    formName: 'default-1.0-draft', downloadAndCreateOnInit: false,
};

describe("DataLocationComponent", () => {
    let fakeUppy: FakeUppy;

    beforeEach(async () => {
        fakeUppy = new FakeUppy();

        function FakePlugin(this: unknown) {
            return {};
        }

        (globalThis as any).__redboxFileUploadUppyDeps = {
            UppyCtor: function () {
                return fakeUppy;
            },
            DashboardPlugin: function DashboardPlugin() {
                return {};
            },
            TusPlugin: function TusPlugin() {
                return {};
            },
            DropboxPlugin: FakePlugin,
            GoogleDrivePlugin: FakePlugin,
            OneDrivePlugin: FakePlugin
        };

        await createTestbedModule({
            declarations: {
                "DataLocationComponent": DataLocationComponent
            }
        });
    });

    afterEach(() => {
        delete (globalThis as any).__redboxFileUploadUppyDeps;
    });

    it("should create component", () => {
        const fixture = TestBed.createComponent(DataLocationComponent);
        expect(fixture.componentInstance).toBeDefined();
    });

    for (const action of ["edit notes", "save success"]) {
        it(`preserves persisted attachment identity after ${action}`, async () => {
            const formConfig: FormConfigFrame = {
                name: "attachment_identity",
                componentDefinitions: [{
                    name: "dataLocations",
                    component: { class: "DataLocationComponent" },
                    model: {
                        class: "DataLocationModel",
                        config: { defaultValue: [] }
                    }
                }]
            };
            const { fixture } = await createFormAndWaitForReady(formConfig, {
                oid: "oid-1", editMode: true, recordType: "testing",
                formName: "attachment_identity", downloadAndCreateOnInit: false
            });
            const component: DataLocationComponent = fixture.debugElement.query(By.directive(DataLocationComponent)).componentInstance;
            component.formControl.setValue([
                { type: "attachment", attachmentId: "stable-id", fileId: "file-1",
                  name: "existing.txt", location: "/record/oid-1/attach/file-1",
                  uploadUrl: "http://localhost/record/oid-1/attach/file-1", pending: false },
                { type: "url", attachmentId: "url-id", location: "https://example.org/data", notes: "Original" }
            ]);
            if (action === "edit notes") {
                component.startEditNotes(1);
                component.editingNotesValue = "Changed URL notes";
                component.applyEditNotes();
            } else {
                TestBed.inject(FormComponentEventBus).publish(createFormSaveSuccessEvent({ oid: "oid-1" }));
            }
            await fixture.whenStable();
            expect(component.formControl.value[0]).toEqual(jasmine.objectContaining({
                attachmentId: "stable-id", fileId: "file-1", location: "/record/oid-1/attach/file-1"
            }));
            expect(component.formControl.value[1].attachmentId).toBe("url-id");
        });
    }

    it("defaults to URL when no data type placeholder is configured", async () => {
        const formConfig: FormConfigFrame = {
            name: "testing_default_type",
            componentDefinitions: [
                {
                    name: "dataLocations",
                    component: {
                        class: "DataLocationComponent"
                    },
                    model: {
                        class: "DataLocationModel",
                        config: {
                            defaultValue: []
                        }
                    }
                }
            ]
        };

        const { fixture, formComponent } = await createFormAndWaitForReady(formConfig, { oid: "oid-1", editMode: true } as any);
        const component = fixture.debugElement.query(By.directive(DataLocationComponent)).componentInstance as DataLocationComponent;
        const selectEl = (fixture.nativeElement as HTMLElement).querySelector("select.form-control") as HTMLSelectElement;

        expect(component.draftLocation.type).toBe("url");
        expect(selectEl.options[0].text).toBe("URL");
        expect(selectEl.options[0].value).toBe("url");

        component.updateDraftLocation("https://example.com/data.csv");
        component.addLocation();

        await fixture.whenStable();

        const values = (formComponent as any).form.value.dataLocations;
        expect(values[0]).toEqual(jasmine.objectContaining({
            type: "url",
            location: "https://example.com/data.csv"
        }));
    });

    it("renders an opt-in disabled data type placeholder", async () => {
        const formConfig: FormConfigFrame = {
            name: "testing_placeholder",
            componentDefinitions: [
                {
                    name: "dataLocations",
                    component: {
                        class: "DataLocationComponent",
                        config: {
                            dataTypePlaceholder: "Please select"
                        }
                    },
                    model: {
                        class: "DataLocationModel",
                        config: {
                            defaultValue: []
                        }
                    }
                }
            ]
        };

        const { fixture } = await createFormAndWaitForReady(formConfig, { oid: "oid-1", editMode: true } as any);
        const component = fixture.debugElement.query(By.directive(DataLocationComponent)).componentInstance as DataLocationComponent;
        const selectEl = (fixture.nativeElement as HTMLElement).querySelector("select.form-control") as HTMLSelectElement;

        expect(component.draftLocation.type).toBe("");
        expect(selectEl.value).toBe("");
        expect(selectEl.options[0].text).toBe("Please select");
        expect(selectEl.options[0].value).toBe("");
        expect(selectEl.options[0].disabled).toBeTrue();
    });

    it("does not add a location while the placeholder data type is selected", async () => {
        const formConfig: FormConfigFrame = {
            name: "testing_placeholder_no_add",
            componentDefinitions: [
                {
                    name: "dataLocations",
                    component: {
                        class: "DataLocationComponent",
                        config: {
                            dataTypePlaceholder: "Please select"
                        }
                    },
                    model: {
                        class: "DataLocationModel",
                        config: {
                            defaultValue: []
                        }
                    }
                }
            ]
        };

        const { fixture, formComponent } = await createFormAndWaitForReady(formConfig, { oid: "oid-1", editMode: true } as any);
        const component = fixture.debugElement.query(By.directive(DataLocationComponent)).componentInstance as DataLocationComponent;

        component.updateDraftLocation("https://example.com/data.csv");
        component.addLocation();

        await fixture.whenStable();

        expect(component.dataLocations).toEqual([]);
        expect((formComponent as any).form.value.dataLocations).toBeNull();
    });

    it("adds a location after a valid placeholder-backed data type selection", async () => {
        const formConfig: FormConfigFrame = {
            name: "testing_placeholder_file",
            componentDefinitions: [
                {
                    name: "dataLocations",
                    component: {
                        class: "DataLocationComponent",
                        config: {
                            dataTypePlaceholder: "Please select"
                        }
                    },
                    model: {
                        class: "DataLocationModel",
                        config: {
                            defaultValue: []
                        }
                    }
                }
            ]
        };

        const { fixture, formComponent } = await createFormAndWaitForReady(formConfig, { oid: "oid-1", editMode: true } as any);
        const component = fixture.debugElement.query(By.directive(DataLocationComponent)).componentInstance as DataLocationComponent;

        component.onDraftTypeChange("file");
        component.updateDraftLocation("/data/file.csv");
        component.addLocation();

        await fixture.whenStable();

        expect((formComponent as any).form.value.dataLocations[0]).toEqual(jasmine.objectContaining({
            type: "file",
            location: "/data/file.csv"
        }));
    });

    it("resets to the placeholder after adding a placeholder-backed data location", async () => {
        const formConfig: FormConfigFrame = {
            name: "testing_placeholder_reset",
            componentDefinitions: [
                {
                    name: "dataLocations",
                    component: {
                        class: "DataLocationComponent",
                        config: {
                            dataTypePlaceholder: "Please select"
                        }
                    },
                    model: {
                        class: "DataLocationModel",
                        config: {
                            defaultValue: []
                        }
                    }
                }
            ]
        };

        const { fixture } = await createFormAndWaitForReady(formConfig, { oid: "oid-1", editMode: true } as any);
        const component = fixture.debugElement.query(By.directive(DataLocationComponent)).componentInstance as DataLocationComponent;

        component.onDraftTypeChange("physical");
        component.updateDraftLocation("Building 1");
        component.updateDraftNotes("Ask archivist");
        component.addLocation();

        await fixture.whenStable();

        expect(component.draftLocation.type).toBe("");
        expect(component.draftLocation.location).toBe("");
        expect(component.draftLocation.notes).toBe("");
    });

    it("disables location input and add button when placeholder data type is selected", async () => {
        const formConfig: FormConfigFrame = {
            name: "testing_placeholder_ui_disabled",
            componentDefinitions: [
                {
                    name: "dataLocations",
                    component: {
                        class: "DataLocationComponent",
                        config: {
                            dataTypePlaceholder: "Please select"
                        }
                    },
                    model: {
                        class: "DataLocationModel",
                        config: {
                            defaultValue: []
                        }
                    }
                }
            ]
        };

        const { fixture } = await createFormAndWaitForReady(formConfig, { oid: "oid-1", editMode: true } as any);
        fixture.detectChanges();

        const nativeEl = fixture.nativeElement as HTMLElement;
        const locationInput = nativeEl.querySelector("input.form-control") as HTMLInputElement;
        const addButton = nativeEl.querySelector("button.btn-success") as HTMLButtonElement;

        expect(locationInput.disabled).toBeTrue();
        expect(addButton.disabled).toBeTrue();
    });

    it("enables location input and add button after selecting a valid data type", async () => {
        const formConfig: FormConfigFrame = {
            name: "testing_placeholder_ui_enabled",
            componentDefinitions: [
                {
                    name: "dataLocations",
                    component: {
                        class: "DataLocationComponent",
                        config: {
                            dataTypePlaceholder: "Please select"
                        }
                    },
                    model: {
                        class: "DataLocationModel",
                        config: {
                            defaultValue: []
                        }
                    }
                }
            ]
        };

        const { fixture } = await createFormAndWaitForReady(formConfig, { oid: "oid-1", editMode: true } as any);
        const component = fixture.debugElement.query(By.directive(DataLocationComponent)).componentInstance as DataLocationComponent;

        component.onDraftTypeChange("url");
        component.updateDraftLocation("https://example.com");
        fixture.detectChanges();

        const nativeEl = fixture.nativeElement as HTMLElement;
        const locationInput = nativeEl.querySelector("input.form-control") as HTMLInputElement;
        const addButton = nativeEl.querySelector("button.btn-success") as HTMLButtonElement;

        expect(locationInput.disabled).toBeFalse();
        expect(addButton.disabled).toBeFalse();
    });

    it("clears draft fields for unsupported draft types and reports no selected draft type", async () => {
        const formConfig: FormConfigFrame = {
            name: "testing_invalid_draft_type",
            componentDefinitions: [
                {
                    name: "dataLocations",
                    component: {
                        class: "DataLocationComponent"
                    },
                    model: {
                        class: "DataLocationModel",
                        config: {
                            defaultValue: []
                        }
                    }
                }
            ]
        };

        const { fixture } = await createFormAndWaitForReady(formConfig, { oid: "oid-1", editMode: true } as any);
        const component = fixture.debugElement.query(By.directive(DataLocationComponent)).componentInstance as DataLocationComponent;

        component.updateDraftLocation("keep me");
        component.updateDraftNotes("keep me too");
        component.onDraftTypeChange("unsupported");

        expect(component.hasSelectedDraftType()).toBeFalse();
        expect(component.draftLocation.type).toBe("unsupported");
        expect(component.draftLocation.location).toBe("");
        expect(component.draftLocation.notes).toBe("");
    });

    it("updates draft isc and blocks manual adds for attachment draft types", async () => {
        const formConfig: FormConfigFrame = {
            name: "testing_attachment_add_guard",
            componentDefinitions: [
                {
                    name: "dataLocations",
                    component: {
                        class: "DataLocationComponent"
                    },
                    model: {
                        class: "DataLocationModel",
                        config: {
                            defaultValue: []
                        }
                    }
                }
            ]
        };

        const { fixture, formComponent } = await createFormAndWaitForReady(formConfig, { oid: "oid-1", editMode: true } as any);
        const component = fixture.debugElement.query(By.directive(DataLocationComponent)).componentInstance as DataLocationComponent;

        component.updateDraftIsc("protected");
        component.onDraftTypeChange("attachment");
        component.updateDraftLocation("should-not-save");
        component.addLocation();

        await fixture.whenStable();

        expect(component.hasSelectedDraftType()).toBeTrue();
        expect(component.draftLocation.isc).toBe("protected");
        expect(component.dataLocations).toEqual([]);
        expect((formComponent as any).form.value.dataLocations).toBeNull();
    });

    it("hides location editing controls when component is disabled", async () => {
        const formConfig: FormConfigFrame = {
            name: "testing_ui_disabled_state",
            componentDefinitions: [
                {
                    name: "dataLocations",
                    component: {
                        class: "DataLocationComponent", config: {}
                    },
                    model: {
                        class: "DataLocationModel",
                        config: {
                            defaultValue: []
                        }
                    }
                }
            ]
        };

        const { fixture } = await createFormAndWaitForReady(formConfig, { oid: "oid-1", editMode: true } as any);
        const component = fixture.debugElement.query(By.directive(DataLocationComponent)).componentInstance as DataLocationComponent;

        component.updateDraftLocation("https://example.com");
        component.setDisabled(true);
        fixture.detectChanges();

        const nativeEl = fixture.nativeElement as HTMLElement;
        const locationInput = nativeEl.querySelector("input.form-control") as HTMLInputElement;
        const addButton = nativeEl.querySelector("button.btn-success") as HTMLButtonElement;

        expect(locationInput).toBeNull();
        expect(addButton).toBeNull();
    });

    it("hides location editing controls when component is readonly", async () => {
        const formConfig: FormConfigFrame = {
            name: "testing_ui_readonly_state",
            componentDefinitions: [
                {
                    name: "dataLocations",
                    component: {
                        class: "DataLocationComponent", config: {}
                    },
                    model: {
                        class: "DataLocationModel",
                        config: {
                            defaultValue: []
                        }
                    }
                }
            ]
        };

        const { fixture } = await createFormAndWaitForReady(formConfig, { oid: "oid-1", editMode: true } as any);
        const component = fixture.debugElement.query(By.directive(DataLocationComponent)).componentInstance as DataLocationComponent;

        component.updateDraftLocation("https://example.com");
        component.setProperty("readonly", true);
        fixture.detectChanges();

        const nativeEl = fixture.nativeElement as HTMLElement;
        const locationInput = nativeEl.querySelector("input.form-control") as HTMLInputElement;
        const addButton = nativeEl.querySelector("button.btn-success") as HTMLButtonElement;

        expect(locationInput).toBeNull();
        expect(addButton).toBeNull();
    });

    it("adds non-attachment locations to the form model", async () => {
        const formConfig: FormConfigFrame = {
            name: "testing",
            componentDefinitions: [
                {
                    name: "dataLocations",
                    component: {
                        class: "DataLocationComponent",
                        config: {
                            notesEnabled: true
                        }
                    },
                    model: {
                        class: "DataLocationModel",
                        config: {
                            defaultValue: []
                        }
                    }
                }
            ]
        };

        const { fixture, formComponent } = await createFormAndWaitForReady(formConfig, { oid: "oid-1", editMode: true } as any);
        const component = fixture.debugElement.query(By.directive(DataLocationComponent)).componentInstance as DataLocationComponent;

        component.updateDraftLocation("https://example.com/data.csv");
        component.updateDraftNotes("source");
        component.addLocation();

        await fixture.whenStable();

        const values = (formComponent as any).form.value.dataLocations;
        expect(values.length).toBe(1);
        expect(values[0]).toEqual(jasmine.objectContaining({
            type: "url",
            location: "https://example.com/data.csv",
            notes: "source"
        }));
    });

    it("keeps long notes and their edit action in one vertically aligned cell", async () => {
        const longNotes = "A long note that should wrap within the available notes width without moving the edit action below it";
        const formConfig: FormConfigFrame = {
            name: "testing_notes_layout",
            componentDefinitions: [
                {
                    name: "dataLocations",
                    component: {
                        class: "DataLocationComponent",
                        config: {
                            notesEnabled: true
                        }
                    },
                    model: {
                        class: "DataLocationModel",
                        config: {
                            value: [{
                                type: "attachment",
                                location: "/record/oid-1/attach/file-1",
                                uploadUrl: "/record/oid-1/attach/file-1",
                                fileId: "file-1",
                                name: "file-1",
                                notes: longNotes
                            }]
                        }
                    }
                }
            ]
        };

        const { fixture } = await createFormAndWaitForReady(formConfig, {
            oid: "oid-1",
            recordType: "rdmp",
            editMode: true,
            formName: "default-1.0-draft",
            downloadAndCreateOnInit: false
        });
        const component = fixture.debugElement.query(By.directive(DataLocationComponent)).componentInstance as DataLocationComponent;
        fixture.detectChanges();

        const nativeEl = fixture.nativeElement as HTMLElement;
        const locationHeader = nativeEl.querySelector(".data-location-location-header") as HTMLTableCellElement;
        const notesHeader = nativeEl.querySelector(".data-location-notes-header") as HTMLTableCellElement;
        const notesCell = nativeEl.querySelector(".data-location-notes-cell") as HTMLTableCellElement;
        const notesLayout = notesCell.querySelector(".data-location-notes-layout") as HTMLDivElement;
        const notesText = notesCell.querySelector(".data-location-notes-text") as HTMLSpanElement;
        const editButton = notesCell.querySelector(".data-location-edit-notes") as HTMLButtonElement;
        const removeButton = nativeEl.querySelector(".data-location-remove") as HTMLButtonElement;
        const removeCell = removeButton.closest("td") as HTMLTableCellElement;

        expect(notesText.textContent).toContain(longNotes);
        expect(locationHeader.getAttribute("width")).toBe("40%");
        expect(notesHeader.getAttribute("width")).toBe("40%");
        expect(notesCell.contains(editButton)).toBeTrue();
        expect(getComputedStyle(notesLayout).display).toBe("flex");
        expect(getComputedStyle(notesLayout).alignItems).toBe("center");
        expect(getComputedStyle(notesText).overflowWrap).toBe("anywhere");
        expect(getComputedStyle(editButton).flexShrink).toBe("0");
        expect(getComputedStyle(notesCell).verticalAlign).toBe("middle");
        expect(getComputedStyle(removeCell).verticalAlign).toBe("middle");

        component.iscEnabled = true;
        fixture.detectChanges();
        expect(nativeEl.querySelector(".data-location-notes-header")?.getAttribute("width")).toBe("20%");
    });

    it("appends attachment locations on upload success", async () => {
        const formConfig: FormConfigFrame = {
            name: "testing",
            componentDefinitions: [
                {
                    name: "dataLocations",
                    component: {
                        class: "DataLocationComponent",
                        config: {
                            allowUploadWithoutSave: true,
                            iscEnabled: true,
                            defaultSelect: "official"
                        }
                    },
                    model: {
                        class: "DataLocationModel",
                        config: {
                            defaultValue: []
                        }
                    }
                }
            ]
        };

        const { fixture, formComponent } = await createFormAndWaitForReady(formConfig, { oid: "", editMode: true } as any);
        const component = fixture.debugElement.query(By.directive(DataLocationComponent)).componentInstance as DataLocationComponent;

        component.onDraftTypeChange("attachment");
        component.updateDraftNotes("uploaded in test");

        await component.openModal();
        fakeUppy.emit("upload-success", {
            name: "test.csv",
            type: "text/csv",
            size: 100,
            meta: {
                name: "test.csv",
                notes: "uploaded in test"
            }
        }, {
            uploadURL: "http://localhost/default/rdmp/record/pending-oid/attach/file-123"
        });

        await fixture.whenStable();

        const values = (formComponent as any).form.value.dataLocations;
        expect(values.length).toBe(1);
        expect(values[0]).toEqual(jasmine.objectContaining({
            type: "attachment",
            fileId: "file-123",
            pending: true,
            notes: "uploaded in test",
            isc: "official"
        }));
    });

    it("falls back to window origin for attachment links when brandingAndPortalUrl is unset", async () => {
        const formConfig: FormConfigFrame = {
            name: "testing",
            componentDefinitions: [
                {
                    name: "dataLocations",
                    component: {
                        class: "DataLocationComponent"
                    },
                    model: {
                        class: "DataLocationModel",
                        config: {
                            defaultValue: []
                        }
                    }
                }
            ]
        };

        const { fixture, formComponent } = await createFormAndWaitForReady(formConfig, { oid: "oid-1", editMode: true } as any);
        const component = fixture.debugElement.query(By.directive(DataLocationComponent)).componentInstance as DataLocationComponent;

        (formComponent.recordService as any).brandingAndPortalUrl = "";

        expect(component.getLocationHref({
            type: "attachment",
            location: "/record/oid-1/attach/file-123"
        } as any)).toBe(`${window.location.origin}/record/oid-1/attach/file-123`);
    });

    it("caches fetched CSRF headers after the first async resolution", async () => {
        const fixture = TestBed.createComponent(DataLocationComponent);
        const component = fixture.componentInstance as any;
        const configService = component.configService;

        fakeUppy.use(function TusPlugin() {
            return {};
        }, { headers: {} });
        component.uppy = fakeUppy;
        component.tusHeaders = {};

        spyOn(configService, "getConfig").and.returnValue(Promise.resolve({ csrfToken: "cached-token" }));

        await component.ensureTusHeadersContainCsrf();
        await component.ensureTusHeadersContainCsrf();

        expect(configService.getConfig).toHaveBeenCalledTimes(1);
        expect(component.tusHeaders["X-CSRF-Token"]).toBe("cached-token");
        expect(fakeUppy.plugins["Tus"].setOptions).toHaveBeenCalledTimes(1);
        expect(fakeUppy.plugins["Tus"].opts.headers["X-CSRF-Token"]).toBe("cached-token");
    });

    it("logs CSRF header resolution failures without rethrowing", async () => {
        const fixture = TestBed.createComponent(DataLocationComponent);
        const component = fixture.componentInstance as any;
        const configService = component.configService;
        const loggerService = component.loggerService;
        const failure = new Error("config load failed");

        fakeUppy.use(function TusPlugin() {
            return {};
        }, { headers: {} });
        component.uppy = fakeUppy;
        component.tusHeaders = {};

        spyOn(configService, "getConfig").and.returnValue(Promise.reject(failure));
        spyOn(loggerService, "error");

        await expectAsync(component.ensureTusHeadersContainCsrf()).toBeResolved();

        expect(loggerService.error).toHaveBeenCalledWith("ensureTusHeadersContainCsrf: failed to load config for CSRF token", failure);
    });
    it("does not load upload libraries for mounted manual locations", async () => {
        const loader = spyOn<any>(DataLocationComponent.prototype, 'getUppyDependencies').and.callThrough();
        const config: FormConfigFrame = {
            name: 'manual-data-locations',
            componentDefinitions: [{
                name: 'dataLocations',
                component: { class: 'DataLocationComponent' },
                model: { class: 'DataLocationModel', config: { defaultValue: [] } },
            }],
        };
        const { fixture } = await createFormAndWaitForReady(config, deferredEditModeProps as any);
        const component = fixture.debugElement.query(By.directive(DataLocationComponent)).componentInstance as DataLocationComponent;
        component.onDraftTypeChange('url');
        component.updateDraftLocation('https://example.org/data');
        component.addLocation();
        await fixture.whenStable();
        expect(loader).not.toHaveBeenCalled();
        expect(component.dataLocations.length).toBe(1);
        await component.openModal();
        expect(loader).toHaveBeenCalledTimes(1);
        expect(fakeUppy.plugins['Dashboard'].openModal).toHaveBeenCalled();
    });

    const deferredUploadConfig: FormConfigFrame = {
        name: 'deferred-locations',
        componentDefinitions: [{
            name: 'dataLocations',
            component: { class: 'DataLocationComponent', config: { allowUploadWithoutSave: true } },
            model: { class: 'DataLocationModel', config: { value: [] } },
        }],
    };

    for (const state of ['visible', 'disabled', 'readonly', 'editMode'] as const) {
        it(`does not initialise or open an uploader after ${state} changes during loading`, async () => {
            const deps = (globalThis as Record<string, unknown>)['__redboxFileUploadUppyDeps'];
            let release!: (value: unknown) => void;
            const loader = spyOn<any>(DataLocationComponent.prototype, 'getUppyDependencies')
                .and.returnValue(new Promise(resolve => release = resolve));
            const { fixture, formComponent } = await createFormAndWaitForReady(deferredUploadConfig, deferredEditModeProps);
            const component = fixture.debugElement.query(By.directive(DataLocationComponent)).componentInstance as DataLocationComponent;
            const pending = component.openModal();
            if (state === 'editMode') formComponent.editMode.set(false);
            else component.setProperty(state, state !== 'visible');
            release(deps);
            await pending;
            await fixture.whenStable();
            expect(fakeUppy.plugins['Dashboard']).toBeUndefined();
            expect(component.loadingUploader).toBeFalse();
            expect(component.uploadLoadFailed).toBeFalse();
            expect(component.model!.formControl!.value).toEqual([]);
            if (state === 'editMode') formComponent.editMode.set(true);
            else component.setProperty(state, state === 'visible');
            await component.openModal();
            expect(fakeUppy.plugins['Dashboard'].openModal).toHaveBeenCalledTimes(1);
            expect(loader).toHaveBeenCalledTimes(2);
        });
    }

    it('destroys a partially installed uploader after plugin failure and retries cleanly', async () => {
        const { fixture } = await createFormAndWaitForReady(deferredUploadConfig, deferredEditModeProps);
        const component = fixture.debugElement.query(By.directive(DataLocationComponent)).componentInstance as DataLocationComponent;
        const use = spyOn(fakeUppy, 'use').and.throwError('Plugin unavailable');
        await component.openModal();
        expect(fakeUppy.destroy).toHaveBeenCalledTimes(1);
        expect(component.uploadLoadFailed).toBeTrue();
        expect(component.model!.formControl!.value).toEqual([]);
        use.and.callThrough();
        await component.openModal();
        expect(component.uploadLoadFailed).toBeFalse();
        expect(fakeUppy.plugins['Dashboard'].openModal).toHaveBeenCalledTimes(1);
        fixture.destroy();
        expect(fakeUppy.destroy).toHaveBeenCalledTimes(2);
    });

    it('passes configured restrictions and only enabled providers to the deferred uploader', async () => {
        const { loadUppyDependencies } = await import('./file-upload.runtime');
        const providers = await loadUppyDependencies(['dropbox', 'googleDrive', 'onedrive']);
        const deps = (globalThis as Record<string, unknown>)['__redboxFileUploadUppyDeps'] as import('./file-upload.component').UppyDependencies;
        Object.assign(deps, {
            DropboxPlugin: providers.DropboxPlugin,
            GoogleDrivePlugin: providers.GoogleDrivePlugin,
            OneDrivePlugin: providers.OneDrivePlugin,
        });
        const construct = spyOn(deps, 'UppyCtor').and.callThrough();
        const use = spyOn(fakeUppy, 'use').and.callThrough();
        const config = structuredClone(deferredUploadConfig);
        config.componentDefinitions![0].component!.config = {
            restrictions: { maxNumberOfFiles: 2, allowedFileTypes: ['.txt'] },
            enabledSources: ['googleDrive'], companionUrl: 'https://uploads.example.test/companion',
        };
        const { fixture } = await createFormAndWaitForReady(config, deferredEditModeProps);
        const component = fixture.debugElement.query(By.directive(DataLocationComponent)).componentInstance as DataLocationComponent;
        await component.openModal();
        expect(construct).toHaveBeenCalledWith({ autoProceed: false, restrictions: { maxNumberOfFiles: 2, allowedFileTypes: ['.txt'] } });
        expect(use).toHaveBeenCalledWith(providers.GoogleDrivePlugin, { companionUrl: 'https://uploads.example.test/companion' });
        expect(use.calls.allArgs().some(([plugin]) => plugin === providers.DropboxPlugin || plugin === providers.OneDrivePlugin)).toBeFalse();
    });

    it('ignores upload completion queued before the field was destroyed', async () => {
        const { fixture } = await createFormAndWaitForReady(deferredUploadConfig, deferredEditModeProps);
        const component = fixture.debugElement.query(By.directive(DataLocationComponent)).componentInstance as DataLocationComponent;
        await component.openModal();
        const control = component.model!.formControl!;
        const setValue = spyOn(control, 'setValue').and.callThrough();
        fixture.destroy();
        fakeUppy.emit('upload-success', { name: 'late.txt', meta: {} }, { uploadURL: '/record/record-1/attach/late-file' });
        expect(setValue).not.toHaveBeenCalled();
        expect(control.value).toEqual([]);
    });

    it('preserves an existing attachment and a model update when the deferred loader rejects', async () => {
        let reject!: (reason: Error) => void;
        spyOn<any>(DataLocationComponent.prototype, 'getUppyDependencies')
            .and.returnValue(new Promise((_, rejectLoad) => reject = rejectLoad));
        const { fixture } = await createFormAndWaitForReady(deferredUploadConfig, deferredEditModeProps);
        const component = fixture.debugElement.query(By.directive(DataLocationComponent)).componentInstance as DataLocationComponent;
        const pending = component.openModal();
        const saved = [{ type: 'attachment' as const, name: 'saved.txt', location: '/record/record-1/attach/saved', uploadUrl: '/record/record-1/attach/saved', fileId: 'saved', notes: 'Keep notes' }];
        const control = component.model!.formControl!;
        control.setValue(saved, { emitEvent: false });
        reject(new Error('Chunk unavailable'));
        await pending;
        await fixture.whenStable();
        expect(control.value).toEqual(saved);
        expect(control.pristine).toBeTrue();
        expect(component.uploadLoadFailed).toBeTrue();
        expect(fixture.nativeElement.textContent).toContain('saved.txt');
    });

});
