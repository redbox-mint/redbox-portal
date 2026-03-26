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
        expect((formComponent as any).form.value.planPdf.length).toBe(2);
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

    it("renders the legacy split button styling and history dropdown", async () => {
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

        const { fixture } = await createFormAndWaitForReady(formConfig, { oid: "oid-101", editMode: false } as any);
        await fixture.whenStable();
        fixture.detectChanges();

        const host = fixture.nativeElement as HTMLElement;
        expect(host.querySelector(".btn-group .btn.btn-danger")).not.toBeNull();
        expect(host.querySelector(".btn-group .dropdown-toggle")).not.toBeNull();

        const component = fixture.debugElement.query(By.directive(PDFListComponent)).componentInstance as PDFListComponent;
        component.toggleHistoryMenu();
        fixture.detectChanges();
        expect(host.querySelector(".dropdown-menu.show")).not.toBeNull();
    });
});
