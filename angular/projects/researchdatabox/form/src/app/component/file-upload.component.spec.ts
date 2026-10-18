import { TestBed } from "@angular/core/testing";
import { provideZonelessChangeDetection } from "@angular/core";
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
        if (pluginName.includes("Dashboard")) {
            this.plugins["Dashboard"] = { openModal: jasmine.createSpy("openModal") };
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
            DashboardPlugin: function DashboardPlugin() { return {}; },
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
        TestBed.configureTestingModule({providers: [provideZonelessChangeDetection()]});
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

        await fixture.debugElement.query(By.directive(FileUploadComponent)).componentInstance.openModal();
        expect(fakeUppy.handlers["upload-success"]?.length).toBe(1);
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
        expect(fixture.nativeElement.querySelector('redbox-file-upload').textContent).toContain('test.csv');
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

        const { fixture } = await createFormAndWaitForReady(formConfig, { oid: "", editMode: true } as any);

        await fixture.debugElement.query(By.directive(FileUploadComponent)).componentInstance.openModal();
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

        const { fixture } = await createFormAndWaitForReady(formConfig, { oid: "", editMode: true } as any);
        await fixture.debugElement.query(By.directive(FileUploadComponent)).componentInstance.openModal();
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

        const { fixture } = await createFormAndWaitForReady(formConfig, { oid: "", editMode: true } as any);
        await fixture.debugElement.query(By.directive(FileUploadComponent)).componentInstance.openModal();
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
        await fixture.debugElement.query(By.directive(FileUploadComponent)).componentInstance.openModal();
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
    const uploadConfig: FormConfigFrame = {
        name: "lazy-upload",
        componentDefinitions: [{
            name: "attachments",
            component: { class: "FileUploadComponent", config: { allowUploadWithoutSave: true } },
            model: { class: "FileUploadModel", config: { value: [] } },
        }],
    };

    it("keeps the uploader unloaded through mounting and first save", async () => {
        const loader = spyOn<any>(FileUploadComponent.prototype, "getUppyDependencies").and.callThrough();
        const { fixture } = await createFormAndWaitForReady(uploadConfig, { oid: "", editMode: true } as any);
        TestBed.inject(FormComponentEventBus).publish(createFormSaveSuccessEvent({ oid: "saved-oid" }));
        await fixture.whenStable();
        expect(loader).not.toHaveBeenCalled();
        expect(fakeUppy.handlers["upload-success"]).toBeUndefined();
    });

    it("shares a delayed load, then opens with the current record and CSRF headers", async () => {
        const deps = (globalThis as any).__redboxFileUploadUppyDeps;
        let release!: (value: any) => void;
        const loader = spyOn<any>(FileUploadComponent.prototype, "getUppyDependencies")
            .and.returnValue(new Promise(resolve => release = resolve));
        const { fixture, formComponent } = await createFormAndWaitForReady(uploadConfig, { oid: "", editMode: true } as any);
        const component = fixture.debugElement.query(By.directive(FileUploadComponent)).componentInstance as FileUploadComponent;
        const first = component.openModal();
        const second = component.openModal();
        expect(component.isAttachmentButtonDisabled()).toBeTrue();
        formComponent.oid.set("saved-while-loading");
        release(deps);
        await Promise.all([first, second]);
        expect(loader).toHaveBeenCalledTimes(1);
        expect(fakeUppy.plugins["Tus"].opts.endpoint).toContain("/record/saved-while-loading/attach");
        expect(fakeUppy.plugins["Tus"].opts.headers["X-CSRF-Token"]).toBe("testCsrfValue");
        expect(component.loadingUploader).toBeFalse();
    });

    it("handles a transient loader failure without changing attachments", async () => {
        const loader = spyOn<any>(FileUploadComponent.prototype, "getUppyDependencies").and.rejectWith(new Error("offline"));
        const { fixture } = await createFormAndWaitForReady(uploadConfig, { oid: "record-1", editMode: true } as any);
        const component = fixture.debugElement.query(By.directive(FileUploadComponent)).componentInstance as FileUploadComponent;
        await component.openModal();
        await fixture.whenStable();
        expect(fixture.nativeElement.querySelector('[role="alert"]').textContent).toContain("Unable to load attachments");
        expect(component.attachments).toEqual([]);
        expect(component.isAttachmentButtonDisabled()).toBeFalse();
        loader.and.callThrough();
        await component.openModal();
        expect(fakeUppy.plugins["Dashboard"].openModal).toHaveBeenCalled();
        expect(component.uploadLoadFailed).toBeFalse();
    });

    it("does not create an uploader after destruction during loading", async () => {
        const deps = (globalThis as any).__redboxFileUploadUppyDeps;
        let release!: (value: any) => void;
        spyOn<any>(FileUploadComponent.prototype, "getUppyDependencies")
            .and.returnValue(new Promise(resolve => release = resolve));
        const { fixture } = await createFormAndWaitForReady(uploadConfig, { oid: "record-1", editMode: true } as any);
        const component = fixture.debugElement.query(By.directive(FileUploadComponent)).componentInstance as FileUploadComponent;
        const pending = component.openModal();
        fixture.destroy();
        release(deps);
        await pending;
        expect(fakeUppy.handlers["upload-success"]).toBeUndefined();
    });

    for (const state of ['visible', 'disabled', 'readonly', 'editMode'] as const) {
        it(`does not initialise or open an uploader after ${state} changes during loading`, async () => {
            const deps = (globalThis as Record<string, unknown>)['__redboxFileUploadUppyDeps'];
            let release!: (value: unknown) => void;
            const loader = spyOn<any>(FileUploadComponent.prototype, 'getUppyDependencies')
                .and.returnValue(new Promise(resolve => release = resolve));
            const { fixture, formComponent } = await createFormAndWaitForReady(uploadConfig, deferredEditModeProps);
            const component = fixture.debugElement.query(By.directive(FileUploadComponent)).componentInstance as FileUploadComponent;
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
        const { fixture } = await createFormAndWaitForReady(uploadConfig, deferredEditModeProps);
        const component = fixture.debugElement.query(By.directive(FileUploadComponent)).componentInstance as FileUploadComponent;
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
        const config = structuredClone(uploadConfig);
        config.componentDefinitions![0].component!.config = {
            restrictions: { maxNumberOfFiles: 2, allowedFileTypes: ['.txt'] },
            enabledSources: ['googleDrive'], companionUrl: 'https://uploads.example.test/companion',
        };
        const { fixture } = await createFormAndWaitForReady(config, deferredEditModeProps);
        const component = fixture.debugElement.query(By.directive(FileUploadComponent)).componentInstance as FileUploadComponent;
        await component.openModal();
        expect(construct).toHaveBeenCalledWith({ autoProceed: false, restrictions: { maxNumberOfFiles: 2, allowedFileTypes: ['.txt'] } });
        expect(use).toHaveBeenCalledWith(providers.GoogleDrivePlugin, { companionUrl: 'https://uploads.example.test/companion' });
        expect(use.calls.allArgs().some(([plugin]) => plugin === providers.DropboxPlugin || plugin === providers.OneDrivePlugin)).toBeFalse();
    });

    it('ignores upload completion queued before the field was destroyed', async () => {
        const { fixture } = await createFormAndWaitForReady(uploadConfig, deferredEditModeProps);
        const component = fixture.debugElement.query(By.directive(FileUploadComponent)).componentInstance as FileUploadComponent;
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
        spyOn<any>(FileUploadComponent.prototype, 'getUppyDependencies')
            .and.returnValue(new Promise((_, rejectLoad) => reject = rejectLoad));
        const { fixture } = await createFormAndWaitForReady(uploadConfig, deferredEditModeProps);
        const component = fixture.debugElement.query(By.directive(FileUploadComponent)).componentInstance as FileUploadComponent;
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
