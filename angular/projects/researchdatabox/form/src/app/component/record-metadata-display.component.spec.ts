import { TestBed } from "@angular/core/testing";
import { By } from "@angular/platform-browser";
import { FormConfigFrame } from "@researchdatabox/sails-ng-common";
import { RecordService } from "@researchdatabox/portal-ng-common";
import { createFormAndWaitForReady, createTestbedModule, DynamicAssetOptions } from "../helpers.spec";
import { RecordMetadataDisplayComponent } from "./record-metadata-display.component";
import { RecordMetadataDisplayDataService } from "../service/record-metadata-display-data.service";

describe("RecordMetadataDisplayComponent", () => {
  let recordService: jasmine.SpyObj<RecordService>;

  beforeEach(async () => {
    recordService = jasmine.createSpyObj<RecordService>("RecordService", ["waitForInit", "getRecordMeta"]);
    recordService.waitForInit.and.resolveTo(recordService);

    await createTestbedModule({
      declarations: {
        RecordMetadataDisplayComponent,
      },
      providers: {
        RecordService: { provide: RecordService, useValue: recordService },
      },
    });
  });

  const getTableRows = (compiled: HTMLElement): string[][] => {
    return Array.from(compiled.querySelectorAll("tbody tr")).map((row) =>
      Array.from(row.querySelectorAll("td")).map((cell) => cell.textContent?.replace(/\s+/g, " ").trim() ?? "")
    );
  };

  it("should create component", () => {
    const fixture = TestBed.createComponent(RecordMetadataDisplayComponent);
    expect(fixture.componentInstance).toBeDefined();
  });

  it("renders empty content for null values", async () => {
    const formConfig: FormConfigFrame = {
      name: "testing",
      componentDefinitions: [
        {
          name: "related_record",
          component: {
            class: "RecordMetadataDisplayComponent",
            config: {
              emptyContent: "No related record",
            },
          },
          model: {
            class: "RecordMetadataDisplayModel",
            config: {
              value: null,
            },
          },
        },
      ],
    };

    const { fixture } = await createFormAndWaitForReady(formConfig);
    const compiled = fixture.nativeElement as HTMLElement;

    expect(compiled.textContent).toContain("No related record");
    expect(recordService.getRecordMeta).not.toHaveBeenCalled();
  });

  it("uses prehydrated metadata on initial load", async () => {
    const formConfig: FormConfigFrame = {
      name: "testing",
      componentDefinitions: [
        {
          name: "related_record",
          component: {
            class: "RecordMetadataDisplayComponent",
          },
          model: {
            class: "RecordMetadataDisplayModel",
            config: {
              value: "oid-1",
            },
          },
        },
      ],
    };

    const dataService = TestBed.inject(RecordMetadataDisplayDataService);
    dataService.seedFromPayload({
      recordMetadata: {
        "oid-1": { oid: "oid-1", data: { title: "Seeded title" } },
      },
    });

    const { fixture } = await createFormAndWaitForReady(formConfig);
    const compiled = fixture.nativeElement as HTMLElement;

    expect(compiled.textContent).toContain("Seeded title");
    expect(recordService.getRecordMeta).not.toHaveBeenCalled();
  });

  it("falls back to live fetch and renders arrays as a table by default preserving order", async () => {
    recordService.getRecordMeta.and.callFake(async (oid: string) => ({ data: { title: `Title ${oid}` } } as never));

    const formConfig: FormConfigFrame = {
      name: "testing",
      componentDefinitions: [
        {
          name: "related_records",
          component: {
            class: "RecordMetadataDisplayComponent",
          },
          model: {
            class: "RecordMetadataDisplayModel",
            config: {
              value: ["oid-2", "oid-1", "oid-2"],
            },
          },
        },
      ],
    };

    const { fixture } = await createFormAndWaitForReady(formConfig);
    await fixture.whenStable();
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    const rows = getTableRows(compiled);

    expect(recordService.getRecordMeta).toHaveBeenCalledTimes(2);
    expect(rows).toEqual([
      ["Title oid-2", "oid-2"],
      ["Title oid-1", "oid-1"],
      ["Title oid-2", "oid-2"],
    ]);
  });

  it("renders partial failures without mutating the model", async () => {
    recordService.getRecordMeta.and.callFake(async (oid: string) => {
      if (oid === "oid-fail") {
        throw new Error("boom");
      }
      return { data: { title: `Title ${oid}` } } as never;
    });

    const formConfig: FormConfigFrame = {
      name: "testing",
      componentDefinitions: [
        {
          name: "related_records",
          component: {
            class: "RecordMetadataDisplayComponent",
            config: {
              failedItemContent: "Unable to load record",
            },
          },
          model: {
            class: "RecordMetadataDisplayModel",
            config: {
              value: ["oid-ok", "oid-fail"],
            },
          },
        },
      ],
    };

    const { fixture, formComponent } = await createFormAndWaitForReady(formConfig);
    await fixture.whenStable();
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    const rows = getTableRows(compiled);

    expect(rows).toEqual([
      ["Title oid-ok", "oid-ok"],
      ["Unable to load record"],
    ]);
    expect((formComponent as any).form.value.related_records).toEqual(["oid-ok", "oid-fail"]);
  });

  it("uses top-level template for a single oid", async () => {
    recordService.getRecordMeta.and.resolveTo({ data: { title: "Single title" } } as never);
    const dynamicAssetOptions: DynamicAssetOptions = {
      entries: [{
        urlKeyStart: "http://localhost/default/rdmp/dynamicAsset/formCompiledItems/rdmp/oid-generated-",
        callable: (keyStr: string, _key: (string | number)[], context: any) => {
          if (keyStr === "componentDefinitions__0__component__config__template") {
            return `<strong>${context?.metadata?.title ?? ""}</strong>`;
          }
          throw new Error(`Unknown key: ${keyStr}`);
        },
      }],
    };

    const formConfig: FormConfigFrame = {
      name: "testing",
      componentDefinitions: [
        {
          name: "related_record",
          component: {
            class: "RecordMetadataDisplayComponent",
            config: {
              template: "{{metadata.title}}",
              hasTemplate: true,
            },
          },
          model: {
            class: "RecordMetadataDisplayModel",
            config: {
              value: "oid-1",
            },
          },
        },
      ],
    };

    const { fixture } = await createFormAndWaitForReady(formConfig, undefined, undefined, dynamicAssetOptions);
    await fixture.whenStable();
    fixture.detectChanges();

    const component = fixture.debugElement.query(By.directive(RecordMetadataDisplayComponent)).componentInstance as RecordMetadataDisplayComponent;
    const compiled = fixture.nativeElement as HTMLElement;

    expect(component.renderedTemplate).toContain("Single title");
    expect(compiled.querySelector("strong")?.textContent).toBe("Single title");
  });
});
