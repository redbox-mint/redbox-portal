import { TestBed } from "@angular/core/testing";
import { By } from "@angular/platform-browser";
import { FormConfigFrame } from "@researchdatabox/sails-ng-common";
import { createFormAndWaitForReady, createTestbedModule } from "../helpers.spec";
import { FileUploadComponent } from "./file-upload.component";
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

describe("FileUploadComponent", () => {
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
            DashboardPlugin: FakePlugin,
            TusPlugin: function TusPlugin() {
                return {};
            },
            DropboxPlugin: FakePlugin,
            GoogleDrivePlugin: FakePlugin,
            OneDrivePlugin: FakePlugin
        };

        await createTestbedModule({
            declarations: {
                "FileUploadComponent": FileUploadComponent
            }
        });
    });

    afterEach(() => {
        delete (globalThis as any).__redboxFileUploadUppyDeps;
    });

    it("should create component", () => {
        const fixture = TestBed.createComponent(FileUploadComponent);
        const component = fixture.componentInstance;
        expect(component).toBeDefined();
    });

    it("disables upload before first save when not allowed", async () => {
        const formConfig: FormConfigFrame = {
            name: "testing",
            componentDefinitions: [
                {
                    name: "attachments",
                    component: {
                        class: "FileUploadComponent",
                        config: {
                            allowUploadWithoutSave: false
                        }
                    },
                    model: {
                        class: "FileUploadModel",
                        config: {
                            defaultValue: []
                        }
                    }
                }
            ]
        };

        const { fixture } = await createFormAndWaitForReady(formConfig, { oid: "", editMode: true } as any);
        const component = fixture.debugElement.query(By.directive(FileUploadComponent)).componentInstance as FileUploadComponent;
        expect(component.isUploadEnabled()).toBeFalse();
    });

    it("appends attachment on upload success", async () => {
        const formConfig: FormConfigFrame = {
            name: "testing",
            componentDefinitions: [
                {
                    name: "attachments",
                    component: {
                        class: "FileUploadComponent",
                        config: {
                            allowUploadWithoutSave: true
                        }
                    },
                    model: {
                        class: "FileUploadModel",
                        config: {
                            defaultValue: []
                        }
                    }
                }
            ]
        };

        const { fixture, formComponent } = await createFormAndWaitForReady(formConfig, { oid: "", editMode: true } as any);

        fakeUppy.emit("upload-success", {
            name: "test.csv",
            type: "text/csv",
            size: 1024,
            meta: {
                name: "test.csv",
                notes: "uploaded in test"
            }
        }, {
            uploadURL: "http://localhost/default/rdmp/record/pending-oid/attach/file-123"
        });

        await fixture.whenStable();

        const values = (formComponent as any).form.value.attachments;
        expect(Array.isArray(values)).toBeTrue();
        expect(values.length).toBe(1);
        expect(values[0].fileId).toBe("file-123");
        expect(values[0].pending).toBeTrue();
    });

    it("adds CSRF token into tus headers", async () => {
        const formConfig: FormConfigFrame = {
            name: "testing",
            componentDefinitions: [
                {
                    name: "attachments",
                    component: {
                        class: "FileUploadComponent",
                        config: {
                            allowUploadWithoutSave: true,
                            tusHeaders: {
                                Authorization: "Bearer abc"
                            }
                        }
                    },
                    model: {
                        class: "FileUploadModel",
                        config: {
                            defaultValue: []
                        }
                    }
                }
            ]
        };

        await createFormAndWaitForReady(formConfig, { oid: "", editMode: true } as any);

        const headers = (fakeUppy.plugins["Tus"]?.opts?.headers ?? {}) as Record<string, string>;
        expect(headers["Authorization"]).toBe("Bearer abc");
        expect(headers["X-CSRF-Token"]).toBe("testCsrfValue");
    });

    it("uses non-companion endpoint for local uploads", async () => {
        const formConfig: FormConfigFrame = {
            name: "testing",
            componentDefinitions: [
                {
                    name: "attachments",
                    component: {
                        class: "FileUploadComponent",
                        config: {
                            allowUploadWithoutSave: true
                        }
                    },
                    model: {
                        class: "FileUploadModel",
                        config: {
                            defaultValue: []
                        }
                    }
                }
            ]
        };

        await createFormAndWaitForReady(formConfig, { oid: "", editMode: true } as any);
        fakeUppy.emit("upload", "upload-local-1", [{ id: "local-1", isRemote: false }]);

        const endpoint = String(fakeUppy.plugins["Tus"]?.opts?.endpoint ?? "");
        expect(endpoint).toContain("/record/pending-oid/attach");
        expect(endpoint).not.toContain("/companion/record/");
    });

    it("uses companion endpoint for remote provider uploads", async () => {
        const formConfig: FormConfigFrame = {
            name: "testing",
            componentDefinitions: [
                {
                    name: "attachments",
                    component: {
                        class: "FileUploadComponent",
                        config: {
                            allowUploadWithoutSave: true
                        }
                    },
                    model: {
                        class: "FileUploadModel",
                        config: {
                            defaultValue: []
                        }
                    }
                }
            ]
        };

        await createFormAndWaitForReady(formConfig, { oid: "", editMode: true } as any);
        fakeUppy.emit("upload", "upload-remote-1", [{ id: "remote-1", isRemote: true }]);

        const endpoint = String(fakeUppy.plugins["Tus"]?.opts?.endpoint ?? "");
        expect(endpoint).toContain("/companion/record/pending-oid/attach");
    });

    it("rebinds pending attachment urls when save succeeds with final oid", async () => {
        const formConfig: FormConfigFrame = {
            name: "testing",
            componentDefinitions: [
                {
                    name: "attachments",
                    component: {
                        class: "FileUploadComponent",
                        config: {
                            allowUploadWithoutSave: true
                        }
                    },
                    model: {
                        class: "FileUploadModel",
                        config: {
                            defaultValue: [
                                {
                                    type: "attachment",
                                    pending: true,
                                    location: "/default/rdmp/record/pending-oid/attach/file-123",
                                    uploadUrl: "http://localhost/default/rdmp/record/pending-oid/attach/file-123",
                                    fileId: "file-123",
                                    name: "test.csv"
                                }
                            ]
                        }
                    }
                }
            ]
        };

        const { fixture } = await createFormAndWaitForReady(formConfig, { oid: "", editMode: true } as any);
        const component = fixture.debugElement.query(By.directive(FileUploadComponent)).componentInstance as FileUploadComponent;
        const eventBus = TestBed.inject(FormComponentEventBus);

        (component as any).formControl.setValue([
            {
                type: "attachment",
                pending: true,
                location: "/default/rdmp/record/pending-oid/attach/file-123",
                uploadUrl: "http://localhost/default/rdmp/record/pending-oid/attach/file-123",
                fileId: "file-123",
                name: "test.csv"
            }
        ]);

        eventBus.publish(createFormSaveSuccessEvent({ oid: "oid-100" }));
        await fixture.whenStable();

        const values = component.attachments;
        expect(values[0].pending).toBeFalse();
        expect(String(values[0].location)).toContain("/record/oid-100/");
    });

    it("closes uppy on destroy", async () => {
        const formConfig: FormConfigFrame = {
            name: "testing",
            componentDefinitions: [
                {
                    name: "attachments",
                    component: {
                        class: "FileUploadComponent",
                        config: {
                            allowUploadWithoutSave: true
                        }
                    },
                    model: {
                        class: "FileUploadModel",
                        config: {
                            defaultValue: []
                        }
                    }
                }
            ]
        };

        const { fixture } = await createFormAndWaitForReady(formConfig, { oid: "", editMode: true } as any);
        fixture.destroy();
        expect(fakeUppy.destroy).toHaveBeenCalled();
    });

    it("getLocationLink includes branding and portal paths", async () => {
        const formConfig: FormConfigFrame = {
            name: "testing",
            componentDefinitions: [
                {
                    name: "attachments",
                    component: {
                        class: "FileUploadComponent",
                        config: {}
                    },
                    model: {
                        class: "FileUploadModel",
                        config: {
                            defaultValue: []
                        }
                    }
                }
            ]
        };

        const { fixture, formComponent } = await createFormAndWaitForReady(formConfig, { oid: "oid-123", editMode: true } as any);
        const component = fixture.debugElement.query(By.directive(FileUploadComponent)).componentInstance as FileUploadComponent;

        // Mock brandingAndPortalUrl on the recordService of the FormComponent
        (formComponent.recordService as any).brandingAndPortalUrl = "http://mock.com/branding/portal";

        const attachment = {
            location: "/record/oid-123/attach/file-abc",
            name: "test.txt"
        };

        const link = component.getLocationLink(attachment as any);
        expect(link).toBe("http://mock.com/branding/portal/record/oid-123/attach/file-abc");
    });
});
