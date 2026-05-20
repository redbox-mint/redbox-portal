import { TestBed } from "@angular/core/testing";
import { By } from "@angular/platform-browser";
import { FormConfigFrame } from "@researchdatabox/sails-ng-common";
import { createFormAndWaitForReady, createTestbedModule } from "../helpers.spec";
import { PublishDataLocationRefreshComponent } from "./publish-data-location-refresh.component";
import { PublishDataLocationSelectorComponent } from "./publish-data-location-selector.component";

describe("PublishDataLocationSelectorComponent", () => {
  beforeEach(async () => {
    await createTestbedModule({
      declarations: {
        PublishDataLocationRefreshComponent,
        PublishDataLocationSelectorComponent,
      },
    });
  });

  it("should create component", () => {
    const fixture = TestBed.createComponent(PublishDataLocationSelectorComponent);
    expect(fixture.componentInstance).toBeDefined();
  });

  it("updates selected locations in the form model", async () => {
    const formConfig: FormConfigFrame = {
      name: "testing",
      componentDefinitions: [
        {
          name: "dataLocations",
          component: {
            class: "PublishDataLocationSelectorComponent",
          },
          model: {
            class: "PublishDataLocationSelectorModel",
            config: {
              value: [
                { type: "url", location: "https://example.com" },
                {
                  type: "attachment",
                  location: "/record/oid-1/attach/file-1",
                  uploadUrl: "/record/oid-1/attach/file-1",
                  fileId: "file-1",
                  name: "file-1",
                  selected: false,
                },
              ],
            },
          },
        },
      ],
    };

    const { fixture, formComponent } = await createFormAndWaitForReady(formConfig, { oid: "oid-1", editMode: true } as any);
    const component = fixture.debugElement.query(By.directive(PublishDataLocationSelectorComponent))
      .componentInstance as PublishDataLocationSelectorComponent;

    component.toggleLocationSelection(0, true);
    await fixture.whenStable();

    expect((formComponent as any).form.value.dataLocations[0].selected).toBeTrue();
  });

  it("only selects matching records when isc selection criteria are enabled", async () => {
    const formConfig: FormConfigFrame = {
      name: "testing",
      componentDefinitions: [
        {
          name: "dataLocations",
          component: {
            class: "PublishDataLocationSelectorComponent",
            config: {
              iscEnabled: true,
              selectionCriteria: [{ isc: "public", type: "attachment" }],
            },
          },
          model: {
            class: "PublishDataLocationSelectorModel",
            config: {
              value: [
                {
                  type: "attachment",
                  location: "/record/oid-1/attach/file-1",
                  uploadUrl: "/record/oid-1/attach/file-1",
                  fileId: "file-1",
                  name: "file-1",
                  isc: "public",
                },
                {
                  type: "attachment",
                  location: "/record/oid-1/attach/file-2",
                  uploadUrl: "/record/oid-1/attach/file-2",
                  fileId: "file-2",
                  name: "file-2",
                  isc: "restricted",
                },
              ],
            },
          },
        },
      ],
    };

    const { fixture, formComponent } = await createFormAndWaitForReady(formConfig, { oid: "oid-1", editMode: true } as any);
    const component = fixture.debugElement.query(By.directive(PublishDataLocationSelectorComponent))
      .componentInstance as PublishDataLocationSelectorComponent;

    component.selectAllLocations(true);
    await fixture.whenStable();

    const values = (formComponent as any).form.value.dataLocations;
    expect(values[0].selected).toBeTrue();
    expect(values[1].selected).toBeFalsy();
  });

  it("updates notes on the selected data location", async () => {
    const formConfig: FormConfigFrame = {
      name: "testing",
      componentDefinitions: [
        {
          name: "dataLocations",
          component: {
            class: "PublishDataLocationSelectorComponent",
          },
          model: {
            class: "PublishDataLocationSelectorModel",
            config: {
              value: [
                { type: "url", location: "https://example.com", notes: "old" },
              ],
            },
          },
        },
      ],
    };

    const { fixture, formComponent } = await createFormAndWaitForReady(formConfig, { oid: "oid-1", editMode: true } as any);
    const component = fixture.debugElement.query(By.directive(PublishDataLocationSelectorComponent))
      .componentInstance as PublishDataLocationSelectorComponent;

    component.startEditNotes(0);
    component.editingNotesValue = "updated";
    component.applyEditNotes();
    await fixture.whenStable();

    expect((formComponent as any).form.value.dataLocations[0].notes).toBe("updated");
  });

  it("shows the metadata-only banner when locations exist but none are selected", async () => {
    const formConfig: FormConfigFrame = {
      name: "testing",
      componentDefinitions: [
        {
          name: "dataLocations",
          component: {
            class: "PublishDataLocationSelectorComponent",
            config: {
              metadataOnlyTitle: "No data locations selected",
              metadataOnlyBody: "Metadata only body",
            },
          },
          model: {
            class: "PublishDataLocationSelectorModel",
            config: {
              value: [
                { type: "url", location: "https://example.com", selected: false },
              ],
            },
          },
        },
      ],
    };

    const { fixture } = await createFormAndWaitForReady(formConfig, { oid: "oid-1", editMode: true } as any);
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.textContent).toContain("No data locations selected");
    expect(compiled.textContent).toContain("Metadata only body");
  });

  it("shows the empty banner when no locations are available", async () => {
    const formConfig: FormConfigFrame = {
      name: "testing",
      componentDefinitions: [
        {
          name: "dataLocations",
          component: {
            class: "PublishDataLocationSelectorComponent",
            config: {
              noLocationsAvailableTitle: "No data locations available",
              noLocationsAvailableBody: "Add locations then refresh",
            },
          },
          model: {
            class: "PublishDataLocationSelectorModel",
            config: {
              value: [],
            },
          },
        },
      ],
    };

    const { fixture } = await createFormAndWaitForReady(formConfig, { oid: "oid-1", editMode: true } as any);
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.textContent).toContain("No data locations available");
    expect(compiled.textContent).toContain("Add locations then refresh");
  });

  it("shows the selection summary when one or more locations are selected", async () => {
    const formConfig: FormConfigFrame = {
      name: "testing",
      componentDefinitions: [
        {
          name: "dataLocations",
          component: {
            class: "PublishDataLocationSelectorComponent",
            config: {
              selectionSummaryTemplate: "{{selected}} of {{total}} locations selected for publication",
            },
          },
          model: {
            class: "PublishDataLocationSelectorModel",
            config: {
              value: [
                { type: "url", location: "https://example.com", selected: true },
                { type: "url", location: "https://example.org", selected: false },
              ],
            },
          },
        },
      ],
    };

    const { fixture } = await createFormAndWaitForReady(formConfig, { oid: "oid-1", editMode: true } as any);
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.textContent).toContain("1 of 2 locations selected for publication");
  });

  it("falls back to legacy noLocationSelected config values", async () => {
    const formConfig: FormConfigFrame = {
      name: "testing",
      componentDefinitions: [
        {
          name: "dataLocations",
          component: {
            class: "PublishDataLocationSelectorComponent",
            config: {
              noLocationSelectedText: "Legacy title",
              noLocationSelectedHelp: "Legacy help",
            },
          },
          model: {
            class: "PublishDataLocationSelectorModel",
            config: {
              value: [
                { type: "url", location: "https://example.com", selected: false },
              ],
            },
          },
        },
      ],
    };

    const { fixture } = await createFormAndWaitForReady(formConfig, { oid: "oid-1", editMode: true } as any);
    const component = fixture.debugElement.query(By.directive(PublishDataLocationSelectorComponent))
      .componentInstance as PublishDataLocationSelectorComponent;

    expect(component.metadataOnlyTitle).toBe("Legacy title");
    expect(component.metadataOnlyBody).toBe("Legacy help");
  });
});
