import { TestBed } from "@angular/core/testing";
import { By } from "@angular/platform-browser";
import { FormControl } from "@angular/forms";
import { FormConfigFrame } from "@researchdatabox/sails-ng-common";
import { createFormAndWaitForReady, createTestbedModule } from "../helpers.spec";
import { PDFListComponent } from "./pdf-list.component";
import { RecordService } from "@researchdatabox/portal-ng-common";

describe("PDFListComponent", () => {
    let recordService: jasmine.SpyObj<RecordService>;

    beforeEach(async () => {
        recordService = jasmine.createSpyObj<RecordService>("RecordService", ["waitForInit", "getAttachments"]);
        recordService.waitForInit.and.resolveTo(recordService);
        recordService.brandingAndPortalUrl = "http://localhost/default/rdmp";

        await createTestbedModule({
            declarations: {
                PDFListComponent,
            },
            providers: {
                RecordService: { provide: RecordService, useValue: recordService },
            },
        });
    });

    it("should create component", () => {
        const fixture = TestBed.createComponent(PDFListComponent);
        expect(fixture.componentInstance).toBeDefined();
    });

    it("loads, filters, sorts attachments and updates the model value", async () => {
        recordService.getAttachments.and.resolveTo([
            { label: "rdmp-pdf-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa-1.pdf", dateUpdated: "2024-02-01T10:00:00Z" },
            { label: "ignore-me.txt", dateUpdated: "2024-02-03T10:00:00Z" },
            { label: "rdmp-pdf-bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb-2.pdf", dateUpdated: "2024-03-01T09:00:00Z" },
        ]);

        const formConfig: FormConfigFrame = {
            name: "testing",
            componentDefinitions: [
                {
                    name: "planPdf",
                    component: {
                        class: "PDFListComponent",
                        config: {
                            startsWith: "rdmp-pdf"
                        }
                    },
                    model: {
                        class: "PDFListModel",
                        config: {
                            defaultValue: []
                        }
                    }
                }
            ]
        };

        const { fixture, formComponent } = await createFormAndWaitForReady(formConfig, { oid: "oid-123", editMode: false } as any);
        await fixture.whenStable();

        const component = fixture.debugElement.query(By.directive(PDFListComponent)).componentInstance as PDFListComponent;
        expect(recordService.getAttachments).toHaveBeenCalledWith("oid-123");
        expect(component.pdfAttachments.length).toBe(2);
        expect(component.latestPdf?.label).toBe("rdmp-pdf-bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb-2.pdf");
        expect(component.recentPdfAttachments.length).toBe(2);
        expect((formComponent as any).form.value.planPdf.length).toBe(2);
    });

    it("emits form control value changes when attachments are loaded", async () => {
        recordService.getAttachments.and.resolveTo([
            { label: "rdmp-pdf-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa-1.pdf", dateUpdated: "2024-02-01T10:00:00Z" },
            { label: "rdmp-pdf-bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb-2.pdf", dateUpdated: "2024-03-01T09:00:00Z" },
        ]);

        const formConfig: FormConfigFrame = {
            name: "testing",
            componentDefinitions: [
                {
                    name: "planPdf",
                    component: {
                        class: "PDFListComponent",
                    },
                    model: {
                        class: "PDFListModel",
                        config: {
                            defaultValue: []
                        }
                    }
                }
            ]
        };

        const { fixture, formComponent } = await createFormAndWaitForReady(formConfig, { oid: "oid-events", editMode: false } as any);
        const changes: unknown[] = [];
        (formComponent as any).form.get("planPdf")?.valueChanges.subscribe((value: unknown) => changes.push(value));

        const component = fixture.debugElement.query(By.directive(PDFListComponent)).componentInstance as PDFListComponent;
        await component.loadAttachments();

        expect(changes.length).toBeGreaterThan(0);
        expect((changes[changes.length - 1] as Array<unknown>).length).toBe(2);
    });

    it("uses the sibling version field when generating download filenames", async () => {
        recordService.getAttachments.and.resolveTo([
            { label: "rdmp-pdf-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa-1.pdf", dateUpdated: "2024-03-01T09:00:00Z" },
            { label: "rdmp-pdf-bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb-2.pdf", dateUpdated: "2024-02-01T09:00:00Z" },
        ]);

        const formConfig: FormConfigFrame = {
            name: "testing",
            componentDefinitions: [
                {
                    name: "planPdf",
                    component: {
                        class: "PDFListComponent",
                        config: {
                            showVersionColumn: true,
                            versionColumnValueField: "planVersion",
                            versionColumnLabelKey: "v",
                            useVersionLabelForFileName: true,
                            downloadPrefix: "rdmp"
                        }
                    },
                    model: {
                        class: "PDFListModel",
                        config: {
                            defaultValue: []
                        }
                    }
                }
            ]
        };

        const { fixture, formComponent } = await createFormAndWaitForReady(formConfig, { oid: "oid-456", editMode: false } as any);
        (formComponent as any).form.addControl("planVersion", new FormControl("7"));
        await fixture.whenStable();

        const component = fixture.debugElement.query(By.directive(PDFListComponent)).componentInstance as PDFListComponent;
        expect(component.getVersionLabel(component.pdfAttachments[0], 0)).toBe("v7");
        expect(decodeURIComponent(component.getDownloadUrl(component.pdfAttachments[0], true, 0))).toContain("fileName=rdmp-v7.pdf");
        expect(decodeURIComponent(component.getDownloadUrl(component.pdfAttachments[1], true, 1))).toContain("fileName=rdmp-v6.pdf");
    });

    it("supports numeric version field values when generating version labels", async () => {
        recordService.getAttachments.and.resolveTo([
            { label: "rdmp-pdf-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa-1.pdf", dateUpdated: "2024-03-01T09:00:00Z" },
            { label: "rdmp-pdf-bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb-2.pdf", dateUpdated: "2024-02-01T09:00:00Z" },
        ]);

        const formConfig: FormConfigFrame = {
            name: "testing",
            componentDefinitions: [
                {
                    name: "planPdf",
                    component: {
                        class: "PDFListComponent",
                        config: {
                            showVersionColumn: true,
                            versionColumnValueField: "planVersion",
                            versionColumnLabelKey: "v",
                            useVersionLabelForFileName: true,
                            downloadPrefix: "rdmp"
                        }
                    },
                    model: {
                        class: "PDFListModel",
                        config: {
                            defaultValue: []
                        }
                    }
                }
            ]
        };

        const { fixture, formComponent } = await createFormAndWaitForReady(formConfig, { oid: "oid-456-number", editMode: false } as any);
        (formComponent as any).form.addControl("planVersion", new FormControl(7));
        await fixture.whenStable();

        const component = fixture.debugElement.query(By.directive(PDFListComponent)).componentInstance as PDFListComponent;
        expect(component.getVersionLabel(component.pdfAttachments[0], 0)).toBe("v7");
        expect(component.getVersionLabel(component.pdfAttachments[1], 1)).toBe("v6");
    });

    it("renders fileNameTemplate with the compiled Handlebars context", async () => {
        recordService.getAttachments.and.resolveTo([
            { label: "rdmp-pdf-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa-1.pdf", dateUpdated: "2024-03-01T09:00:00Z" },
        ]);

        const formConfig: FormConfigFrame = {
            name: "testing",
            componentDefinitions: [
                {
                    name: "planPdf",
                    component: {
                        class: "PDFListComponent",
                        config: {
                            showVersionColumn: true,
                            versionColumnValueField: "planVersion",
                            versionColumnLabelKey: "v",
                            useVersionLabelForFileName: true,
                            downloadPrefix: "rdmp",
                            fileNameTemplate: "{{downloadPrefix}}-{{versionLabel}}-{{index}}.pdf"
                        }
                    },
                    model: {
                        class: "PDFListModel",
                        config: {
                            defaultValue: []
                        }
                    }
                }
            ]
        };

        const { fixture, formComponent } = await createFormAndWaitForReady(formConfig, { oid: "oid-template", editMode: false } as any);
        (formComponent as any).form.addControl("planVersion", new FormControl("3"));
        await fixture.whenStable();

        const component = fixture.debugElement.query(By.directive(PDFListComponent)).componentInstance as PDFListComponent;
        const evaluateSpy = jasmine.createSpy("evaluate").and.returnValue("rdmp-v3-0.pdf");
        (component as any).compiledItems = { evaluate: evaluateSpy };
        (component as any).fileNameTemplatePath = ["componentDefinitions", 0, "component", "config", "fileNameTemplate"];

        expect(decodeURIComponent(component.getDownloadUrl(component.pdfAttachments[0], true, 0))).toContain("fileName=rdmp-v3-0.pdf");
        expect(evaluateSpy).toHaveBeenCalledWith(
            ["componentDefinitions", 0, "component", "config", "fileNameTemplate"],
            jasmine.objectContaining({
                attachment: component.pdfAttachments[0],
                downloadPrefix: "rdmp",
                index: 0,
                versionLabel: "v3"
            }),
            jasmine.any(Object)
        );
    });

    it("applies fileNameTemplate even when version labels are not used for filenames", async () => {
        recordService.getAttachments.and.resolveTo([
            { label: "rdmp-pdf-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa-1.pdf", dateUpdated: "2024-03-01T09:00:00Z" },
        ]);

        const formConfig: FormConfigFrame = {
            name: "testing",
            componentDefinitions: [
                {
                    name: "planPdf",
                    component: {
                        class: "PDFListComponent",
                        config: {
                            useVersionLabelForFileName: false,
                            downloadPrefix: "rdmp",
                            fileNameTemplate: "{{downloadPrefix}}-custom.pdf"
                        }
                    },
                    model: {
                        class: "PDFListModel",
                        config: {
                            defaultValue: []
                        }
                    }
                }
            ]
        };

        const { fixture } = await createFormAndWaitForReady(formConfig, { oid: "oid-template-no-version", editMode: false } as any);
        await fixture.whenStable();

        const component = fixture.debugElement.query(By.directive(PDFListComponent)).componentInstance as PDFListComponent;
        const evaluateSpy = jasmine.createSpy("evaluate").and.returnValue("rdmp-custom.pdf");
        (component as any).compiledItems = { evaluate: evaluateSpy };
        (component as any).fileNameTemplatePath = ["componentDefinitions", 0, "component", "config", "fileNameTemplate"];

        expect(decodeURIComponent(component.getDownloadUrl(component.pdfAttachments[0], false, 0))).toContain("fileName=rdmp-custom.pdf");
        expect(evaluateSpy).toHaveBeenCalled();
    });

    it("shows and hides the history modal", async () => {
        recordService.getAttachments.and.resolveTo([
            { label: "rdmp-pdf-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa-1.pdf", dateUpdated: "2024-03-01T09:00:00Z" },
            { label: "rdmp-pdf-bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb-2.pdf", dateUpdated: "2024-02-01T09:00:00Z" },
        ]);

        const formConfig: FormConfigFrame = {
            name: "testing",
            componentDefinitions: [
                {
                    name: "planPdf",
                    component: {
                        class: "PDFListComponent",
                    },
                    model: {
                        class: "PDFListModel",
                        config: {
                            defaultValue: []
                        }
                    }
                }
            ]
        };

        const { fixture } = await createFormAndWaitForReady(formConfig, { oid: "oid-789", editMode: false } as any);
        await fixture.whenStable();
        const component = fixture.debugElement.query(By.directive(PDFListComponent)).componentInstance as PDFListComponent;

        expect(component.showHistoryModal).toBeFalse();
        component.openHistoryModal();
        fixture.detectChanges();
        expect(component.showHistoryModal).toBeTrue();
        expect((fixture.nativeElement as HTMLElement).querySelector(".modal")).not.toBeNull();

        component.hideHistoryModal();
        fixture.detectChanges();
        expect(component.showHistoryModal).toBeFalse();
    });

    it("renders the split button styling and history dropdown when history exists", async () => {
        recordService.getAttachments.and.resolveTo([
            { label: "rdmp-pdf-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa-1.pdf", dateUpdated: "2024-03-01T09:00:00Z" },
            { label: "rdmp-pdf-bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb-2.pdf", dateUpdated: "2024-02-01T09:00:00Z" },
        ]);

        const formConfig: FormConfigFrame = {
            name: "testing",
            componentDefinitions: [
                {
                    name: "planPdf",
                    component: {
                        class: "PDFListComponent",
                    },
                    model: {
                        class: "PDFListModel",
                        config: {
                            defaultValue: []
                        }
                    }
                }
            ]
        };

        const { fixture } = await createFormAndWaitForReady(formConfig, { oid: "oid-101", editMode: false } as any);
        await fixture.whenStable();
        fixture.detectChanges();

        const host = fixture.nativeElement as HTMLElement;
        expect(host.querySelector(".btn-group .btn.btn-danger")).not.toBeNull();
        expect(host.querySelector(".btn-group .dropdown-toggle")).not.toBeNull();
        expect(host.querySelector(".btn-group .badge.badge-light")).toBeNull();

        const component = fixture.debugElement.query(By.directive(PDFListComponent)).componentInstance as PDFListComponent;
        component.toggleHistoryMenu();
        fixture.detectChanges();
        expect(host.querySelector(".dropdown-menu.show")).not.toBeNull();
    });

    it("renders a plain button with no dropdown when there is no history", async () => {
        recordService.getAttachments.and.resolveTo([
            { label: "rdmp-pdf-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa-1.pdf", dateUpdated: "2024-03-01T09:00:00Z" },
        ]);

        const formConfig: FormConfigFrame = {
            name: "testing",
            componentDefinitions: [
                {
                    name: "planPdf",
                    component: {
                        class: "PDFListComponent",
                    },
                    model: {
                        class: "PDFListModel",
                        config: {
                            defaultValue: []
                        }
                    }
                }
            ]
        };

        const { fixture } = await createFormAndWaitForReady(formConfig, { oid: "oid-single", editMode: false } as any);
        await fixture.whenStable();
        fixture.detectChanges();

        const host = fixture.nativeElement as HTMLElement;
        expect(host.querySelector(".btn-group")).toBeNull();
        expect(host.querySelector("a.btn.btn-danger")).not.toBeNull();
    });

    it("shows recent versions in the dropdown and defers full history to the modal", async () => {
        recordService.getAttachments.and.resolveTo([
            { label: "rdmp-pdf-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa-1.pdf", dateUpdated: "2024-03-05T09:00:00Z" },
            { label: "rdmp-pdf-bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb-2.pdf", dateUpdated: "2024-03-04T09:00:00Z" },
            { label: "rdmp-pdf-cccccccccccccccccccccccccccccccc-3.pdf", dateUpdated: "2024-03-03T09:00:00Z" },
            { label: "rdmp-pdf-dddddddddddddddddddddddddddddddd-4.pdf", dateUpdated: "2024-03-02T09:00:00Z" },
        ]);

        const formConfig: FormConfigFrame = {
            name: "testing",
            componentDefinitions: [
                {
                    name: "planPdf",
                    component: {
                        class: "PDFListComponent",
                        config: {
                            recentPdfLimit: 2
                        }
                    },
                    model: {
                        class: "PDFListModel",
                        config: {
                            defaultValue: []
                        }
                    }
                }
            ]
        };

        const { fixture } = await createFormAndWaitForReady(formConfig, { oid: "oid-history", editMode: false } as any);
        await fixture.whenStable();
        fixture.detectChanges();

        const component = fixture.debugElement.query(By.directive(PDFListComponent)).componentInstance as PDFListComponent;
        const host = fixture.nativeElement as HTMLElement;

        expect(component.recentPdfAttachments.length).toBe(2);
        expect(component.hasMoreThanRecent).toBeTrue();

        component.toggleHistoryMenu();
        fixture.detectChanges();

        const dropdownItems = host.querySelectorAll(".dropdown-menu.show .dropdown-item");
        expect(dropdownItems.length).toBe(3);
        expect(host.querySelector(".dropdown-menu.show .badge.badge-primary")).not.toBeNull();
        expect(host.querySelector(".dropdown-menu.show .dropdown-divider + .dropdown-item")).not.toBeNull();
    });

    it("shows the version counter only when enabled in config", async () => {
        recordService.getAttachments.and.resolveTo([
            { label: "rdmp-pdf-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa-1.pdf", dateUpdated: "2024-03-01T09:00:00Z" },
            { label: "rdmp-pdf-bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb-2.pdf", dateUpdated: "2024-02-01T09:00:00Z" },
        ]);

        const formConfig: FormConfigFrame = {
            name: "testing",
            componentDefinitions: [
                {
                    name: "planPdf",
                    component: {
                        class: "PDFListComponent",
                        config: {
                            showVersionCounter: true
                        }
                    },
                    model: {
                        class: "PDFListModel",
                        config: {
                            defaultValue: []
                        }
                    }
                }
            ]
        };

        const { fixture } = await createFormAndWaitForReady(formConfig, { oid: "oid-counter", editMode: false } as any);
        await fixture.whenStable();
        fixture.detectChanges();

        const host = fixture.nativeElement as HTMLElement;
        expect(host.querySelector(".btn-group .badge.badge-light")?.textContent).toContain("2");
    });

    it("renders the latest badge after the date label in the dropdown row", async () => {
        recordService.getAttachments.and.resolveTo([
            { label: "rdmp-pdf-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa-1.pdf", dateUpdated: "2024-03-01T09:00:00Z" },
            { label: "rdmp-pdf-bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb-2.pdf", dateUpdated: "2024-02-01T09:00:00Z" },
        ]);

        const formConfig: FormConfigFrame = {
            name: "testing",
            componentDefinitions: [
                {
                    name: "planPdf",
                    component: {
                        class: "PDFListComponent",
                        config: {
                            showVersionColumn: true,
                            versionColumnValueField: "planVersion",
                            versionColumnLabelKey: "v"
                        }
                    },
                    model: {
                        class: "PDFListModel",
                        config: {
                            defaultValue: []
                        }
                    }
                }
            ]
        };

        const { fixture, formComponent } = await createFormAndWaitForReady(formConfig, { oid: "oid-dropdown-layout", editMode: false } as any);
        (formComponent as any).form.addControl("planVersion", new FormControl("4"));
        await fixture.whenStable();

        const component = fixture.debugElement.query(By.directive(PDFListComponent)).componentInstance as PDFListComponent;
        component.toggleHistoryMenu();
        fixture.detectChanges();

        const firstDropdownItem = (fixture.nativeElement as HTMLElement).querySelector(".dropdown-menu.show .dropdown-item");
        const firstDropdownLabelParts = firstDropdownItem?.querySelectorAll(".d-inline-flex.align-items-center.pr-4 > span");
        const labelText = firstDropdownLabelParts?.[0]?.textContent?.replace(/\s+/g, " ").trim() ?? "";
        expect(labelText).toContain("March 1, 2024");
        expect(labelText).toContain("v4");
        expect(firstDropdownLabelParts?.[1]?.classList.contains("badge-primary")).toBeTrue();
        expect(firstDropdownItem?.querySelector(".d-inline-flex.align-items-center.pl-4 .fa-download")).not.toBeNull();
    });

    it("uses the previous-download label for non-latest attachment accessibility text", async () => {
        recordService.getAttachments.and.resolveTo([
            { label: "rdmp-pdf-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa-1.pdf", dateUpdated: "2024-03-01T09:00:00Z" },
            { label: "rdmp-pdf-bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb-2.pdf", dateUpdated: "2024-02-01T09:00:00Z" },
        ]);

        const formConfig: FormConfigFrame = {
            name: "testing",
            componentDefinitions: [
                {
                    name: "planPdf",
                    component: {
                        class: "PDFListComponent",
                        config: {
                            downloadBtnLabel: "@download-current-custom",
                            downloadPreviousBtnLabel: "@download-previous-custom"
                        }
                    },
                    model: {
                        class: "PDFListModel",
                        config: {
                            defaultValue: []
                        }
                    }
                }
            ]
        };

        const { fixture } = await createFormAndWaitForReady(formConfig, { oid: "oid-prev-label", editMode: false } as any);
        await fixture.whenStable();

        const component = fixture.debugElement.query(By.directive(PDFListComponent)).componentInstance as PDFListComponent;
        expect(component.getDownloadAriaLabel(component.pdfAttachments[0], 0)).toContain("@download-current-custom");
        expect(component.getDownloadAriaLabel(component.pdfAttachments[1], 1)).toContain("@download-previous-custom");
    });
});
