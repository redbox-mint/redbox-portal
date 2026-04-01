import { TestBed } from "@angular/core/testing";
import { By } from "@angular/platform-browser";
import { FormConfigFrame } from "@researchdatabox/sails-ng-common";
import { createFormAndWaitForReady, createTestbedModule } from "../helpers.spec";
import { PublishDataLocationSelectorComponent } from "./publish-data-location-selector.component";

describe("PublishDataLocationSelectorComponent", () => {
  beforeEach(async () => {
    await createTestbedModule({
      declarations: {
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
});
