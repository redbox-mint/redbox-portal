import { RecordActionResult } from '@researchdatabox/portal-ng-common';
import { Location } from "@angular/common";
import { TestBed } from "@angular/core/testing";
import { By } from "@angular/platform-browser";
import { FormConfigFrame, jsonataCompileAndEvaluate } from "@researchdatabox/sails-ng-common";
import { createFormAndWaitForReady, createTestbedModule } from "../helpers.spec";
import { FormComponentEventBus, FormComponentEventType } from "../form-state";
import { SimpleInputComponent } from "./simple-input.component";
import { PublishDataLocationRefreshComponent } from "./publish-data-location-refresh.component";
import { PublishDataLocationSelectorComponent } from "./publish-data-location-selector.component";

describe("PublishDataLocationSelectorComponent", () => {
  beforeEach(async () => {
    await createTestbedModule({
      declarations: {
        PublishDataLocationRefreshComponent,
        PublishDataLocationSelectorComponent,
        SimpleInputComponent,
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

  it("saves zero, one, or many refreshed locations as an array on review", async () => {
    const oidTemplate = `($record := formData.dataRecord ?: formData.mainTab.about.dataRecord;
      $exists($record.oid) ? $record.oid : ($exists($record.redboxOid) ? $record.redboxOid :
        ($exists($record) ? $record : runtimeContext.requestParams.dataRecordOid)))`;
    const refreshTemplate = `(
      $freshLocations := event.value.dataLocations ?: [];
      $currentLocations := formData.dataLocations ?: formData.mainTab.data.dataLocations ?: [];
      $locationKey := function($location) {
        $string($location.type ?: "") & "|" &
          $string($location.fileId ?: $location.location ?: $location.uploadUrl ?: $location.name ?: "")
      };
      $map($freshLocations, function($freshLocation) {(
        $matchingCurrentLocation := $currentLocations[$locationKey($) = $locationKey($freshLocation)][0];
        $exists($matchingCurrentLocation.selected)
          ? $merge([$freshLocation, {"selected": $matchingCurrentLocation.selected}])
          : $freshLocation;
      )})
    )`;
    const retained = { type: "url" as const, location: "https://example.com", selected: true };
    const additional = { type: "physical", location: "Archive" };
    const config: FormConfigFrame = {
      name: "publication",
      componentDefinitions: [{
        name: "dataRecord",
        component: { class: "SimpleInputComponent" },
        model: { class: "SimpleInputModel", config: { value: "" } },
      }, {
        name: "dataPubLocationRefresherTrigger",
        component: { class: "PublishDataLocationRefreshComponent" },
      }, {
        name: "dataLocations",
        component: { class: "PublishDataLocationSelectorComponent" },
        model: { class: "PublishDataLocationSelectorModel", config: { value: [retained] } },
        expressions: [{
          name: "location-refresh",
          config: {
            conditionKind: "jsonpointer", condition: "/dataPubLocationRefresher::field.value.changed",
            runOnFormReady: false, target: "model.value", hasTemplate: true, template: refreshTemplate,
          },
        }],
      }],
      behaviours: [{
        name: "fetch-on-refresh",
        conditionKind: "jsonpointer", condition: "/dataPubLocationRefresherTrigger::field.value.changed",
        runOnFormReady: false,
        processors: [
          { type: "jsonataTransform", config: { hasTemplate: true, template: oidTemplate } },
          { type: "fetchMetadata" },
        ],
        actions: [{ type: "emitEvent", config: {
          eventType: "field.value.changed", fieldId: "/dataPubLocationRefresher", sourceId: "*",
        } }],
      }],
    };
    let failTemplate = false;
    const { fixture, formComponent } = await createFormAndWaitForReady(config, {
      oid: "publication", formName: "", recordType: "dataPublication", editMode: true, downloadAndCreateOnInit: false,
    }, undefined, {
      entries: [{
        urlKeyStart: "http://localhost/default/rdmp/dynamicAsset/formCompiledItems/",
        callable: (_key, path, context) => {
          if (path.includes("processors")) return jsonataCompileAndEvaluate(oidTemplate, context);
          if (failTemplate) throw new Error("Temporary refresh template failure");
          return jsonataCompileAndEvaluate(refreshTemplate, context);
        },
      }],
    });
    const refresh = fixture.debugElement.query(By.directive(PublishDataLocationRefreshComponent))
      .componentInstance as PublishDataLocationRefreshComponent;
    const click = async () => {
      fixture.ngZone!.run(() => refresh.onClick());
      await fixture.whenStable();
    };
    const fetch = spyOn(formComponent.recordService, "getRecordMeta");
    const update = spyOn(formComponent.recordService, "update").and.resolveTo(RecordActionResult.fromResponse({
      success: true, oid: "publication", message: "", data: null,
    }));

    await click();
    expect(fetch).not.toHaveBeenCalled();
    expect(formComponent.form!.value.dataLocations).toEqual([retained]);

    formComponent.form!.get("dataRecord")!.setValue("linked-record");
    failTemplate = true;
    fetch.and.resolveTo({ dataLocations: [] });
    await click();
    expect(fetch).toHaveBeenCalledOnceWith("linked-record");
    expect(formComponent.form!.value.dataLocations).toEqual([retained]);
    failTemplate = false;

    const fresh = { ...retained, selected: false, notes: "Fresh notes" };
    const selected = { ...fresh, selected: true };
    for (const [dataLocations, expected] of [
      [[fresh], [selected]],
      [[fresh, additional], [selected, additional]],
      [[], []],
    ]) {
      update.calls.reset();
      fetch.and.resolveTo({ dataLocations });
      await click();
      await formComponent.saveForm({ force: true, targetStep: "review" });
      expect(update).toHaveBeenCalledOnceWith(
        "publication", { dataRecord: "linked-record", dataLocations: expected }, "review", undefined, jasmine.any(Object),
      );
    }
  });

  it("requires a reload to edit unconfirmed locations while allowing title saves", async () => {
    const location = { type: "url" as const, location: "https://example.com", selected: true };
    const path = '["dataLocations"]';
    const { formComponent } = await createFormAndWaitForReady({
      name: "publication",
      componentDefinitions: [{
        name: "title",
        component: { class: "SimpleInputComponent" },
        model: { class: "SimpleInputModel", config: { value: "Draft" } },
      }, {
        name: "dataLocations",
        component: { class: "PublishDataLocationSelectorComponent" },
        model: { class: "PublishDataLocationSelectorModel", config: { value: [location] } },
      }],
    }, { oid: "publication", editMode: true, formName: "", recordType: "dataPublication", downloadAndCreateOnInit: false });
    formComponent.formDefMap!.formConfigMeta = { oid: "publication", editableRowPaths: [path], rowProofs: {} };
    const update = spyOn(formComponent.recordService, "update").and.resolveTo(RecordActionResult.fromResponse({
      success: true, oid: "publication", message: "", data: null, confirmedListPaths: [path], savedRowProofs: {},
    }));
    const options = { rowEdits: {} };
    const locations = formComponent.form!.get("dataLocations")!;
    await formComponent.saveForm({ force: true });
    expect(update.calls.argsFor(0)).toEqual(["publication", { title: "Draft", dataLocations: [location] }, "", undefined, jasmine.any(Object), options]);

    locations.setValue([]);
    update.and.resolveTo(RecordActionResult.fromResponse({
      success: true, oid: "publication", message: "", data: null, confirmedListPaths: [], savedRowProofs: {},
    }));
    await formComponent.saveForm({ force: true });
    expect(update.calls.argsFor(1)).toEqual(["publication", { title: "Draft", dataLocations: [] }, "", undefined, jasmine.any(Object), options]);

    formComponent.form!.get("title")!.setValue("Updated title");
    await formComponent.saveForm({ force: true });
    expect(update.calls.argsFor(2)).toEqual(["publication", { title: "Updated title" }, "", undefined, jasmine.any(Object), {}]);

    locations.setValue([location]);
    await formComponent.saveForm({ force: true });
    expect(update).toHaveBeenCalledTimes(3);
  });

  it("keeps pending publication notes available until they are applied before creating", async () => {
    const location = { type: "url" as const, location: "https://example.com", notes: "Stored note", selected: true };
    const { fixture, formComponent } = await createFormAndWaitForReady({
      name: "publication",
      componentDefinitions: [{
        name: "dataLocations",
        component: { class: "PublishDataLocationSelectorComponent" },
        model: { class: "PublishDataLocationSelectorModel", config: { value: [location] } },
      }],
    }, { oid: "", editMode: true, formName: "", recordType: "dataPublication", downloadAndCreateOnInit: false });
    const component = fixture.debugElement.query(By.directive(PublishDataLocationSelectorComponent))
      .componentInstance as PublishDataLocationSelectorComponent;
    const create = spyOn(formComponent.recordService, "create").and.resolveTo(RecordActionResult.fromResponse({
      success: true, oid: "new-publication", message: "", data: null,
    }));
    spyOn<any>(formComponent, "changeLocationHref").and.stub();
    spyOn(fixture.debugElement.injector.get(Location), "replaceState").and.stub();
    const failure = jasmine.createSpy("save failure");
    const subscription = TestBed.inject(FormComponentEventBus).select$(FormComponentEventType.FORM_SAVE_FAILURE)
      .subscribe(failure);

    component.startEditNotes(0);
    expect(component.prepareForCreate()).toBeUndefined();
    component.editingNotesValue = "Pending note";
    await formComponent.saveForm({ force: true });
    expect(create).not.toHaveBeenCalled();
    expect(failure).toHaveBeenCalledWith(jasmine.objectContaining({ error: jasmine.stringMatching(/Apply or Cancel/) }));
    expect(component.editingNotesValue).toBe("Pending note");

    component.applyEditNotes();
    await formComponent.saveForm({ force: true });
    expect(create).toHaveBeenCalledOnceWith(
      { dataLocations: [{ ...location, notes: "Pending note" }] }, "dataPublication", "", undefined, jasmine.any(Object),
    );
    subscription.unsubscribe();
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
});
