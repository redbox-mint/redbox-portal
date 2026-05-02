import { TestBed } from "@angular/core/testing";
import { By } from "@angular/platform-browser";
import { FormConfigFrame } from "@researchdatabox/sails-ng-common";
import { createFormAndWaitForReady, createTestbedModule } from "../helpers.spec";
import { DataLocationComponent } from "./data-location.component";

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
});
