import {TestBed} from "@angular/core/testing";
import {FormConfigFrame} from "@researchdatabox/sails-ng-common";
import {createFormAndWaitForReady, createTestbedModule} from "../helpers.spec";
import {MAP_DEPENDENCIES_LOADER, MapComponent} from "./map.component";
import * as L from "leaflet";

describe("MapComponent", () => {
  let fakeMap: any;
  let fakeDraw: any;
  let drawFeatures: unknown[];

  beforeEach(async () => {
    drawFeatures = [];

    fakeMap = {
      invalidateSize: jasmine.createSpy("invalidateSize"),
      fitBounds: jasmine.createSpy("fitBounds"),
      remove: jasmine.createSpy("remove")
    };

    const fakeLayer = {
      addTo: jasmine.createSpy("addTo"),
      removeFrom: jasmine.createSpy("removeFrom"),
      getBounds: () => ({isValid: () => false})
    };

    spyOn(L, "tileLayer").and.returnValue({} as any);
    spyOn(L, "map").and.returnValue(fakeMap);
    spyOn(L, "geoJSON").and.returnValue(fakeLayer as any);

    fakeDraw = {
      start: jasmine.createSpy("start"),
      stop: jasmine.createSpy("stop"),
      on: jasmine.createSpy("on"),
      addFeatures: jasmine.createSpy("addFeatures").and.callFake((features: unknown[]) => {
        drawFeatures.push(...features);
      }),
      getSnapshot: jasmine.createSpy("getSnapshot").and.callFake(() => ({
        type: "FeatureCollection",
        features: [...drawFeatures]
      }))
    };

    function FakeTerraDrawCtor(this: unknown) {
      return fakeDraw;
    }
    function FakeAdapterCtor(this: unknown) {
      return {};
    }
    function FakeModeCtor(this: unknown) {
      return {};
    }

    const mapDependencies = {
      L,
      terraDraw: {
        TerraDraw: FakeTerraDrawCtor,
        TerraDrawPointMode: FakeModeCtor,
        TerraDrawPolygonMode: FakeModeCtor,
        TerraDrawLineStringMode: FakeModeCtor,
        TerraDrawRectangleMode: FakeModeCtor,
        TerraDrawSelectMode: FakeModeCtor
      },
      terraDrawLeafletAdapter: {
        TerraDrawLeafletAdapter: FakeAdapterCtor
      },
      parseKmlToGeoJson: () => ({type: "FeatureCollection", features: []})
    } as any;

    await createTestbedModule({
      declarations: {
        "MapComponent": MapComponent
      },
      providers: {
        "MAP_DEPENDENCIES_LOADER": {
          provide: MAP_DEPENDENCIES_LOADER,
          useValue: () => Promise.resolve(mapDependencies)
        }
      }
    });
  });

  it("should create component", () => {
    const fixture = TestBed.createComponent(MapComponent);
    const component = fixture.componentInstance;
    expect(component).toBeDefined();
  });

  it("imports GeoJSON and updates form model value", async () => {
    const formConfig: FormConfigFrame = {
      name: "testing",
      componentDefinitions: [
        {
          name: "map_coverage",
          component: {
            class: "MapComponent",
            config: {
              enableImport: true
            }
          },
          model: {
            class: "MapModel",
            config: {
              defaultValue: {type: "FeatureCollection", features: []}
            }
          }
        }
      ]
    };

    const {fixture, formComponent} = await createFormAndWaitForReady(formConfig, {editMode: true} as any);
    const textarea = fixture.nativeElement.querySelector("textarea") as HTMLTextAreaElement;
    textarea.value = JSON.stringify({
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          geometry: {type: "Point", coordinates: [153.02, -27.47]},
          properties: {name: "Brisbane"}
        }
      ]
    });
    textarea.dispatchEvent(new Event("input"));
    fixture.detectChanges();

    const importButton = fixture.nativeElement.querySelector(".rb-map-import-btn") as HTMLButtonElement;
    importButton.click();
    await fixture.whenStable();

    const modelValue = (formComponent as any).form.value?.map_coverage;
    expect(modelValue?.type).toBe("FeatureCollection");
    expect((modelValue?.features ?? []).length).toBe(1);
  });

  it("shows invalid import error for malformed payload", async () => {
    const formConfig: FormConfigFrame = {
      name: "testing",
      componentDefinitions: [
        {
          name: "map_coverage",
          component: {
            class: "MapComponent",
            config: {
              enableImport: true
            }
          },
          model: {
            class: "MapModel",
            config: {
              defaultValue: {type: "FeatureCollection", features: []}
            }
          }
        }
      ]
    };

    const {fixture} = await createFormAndWaitForReady(formConfig, {editMode: true} as any);
    const textarea = fixture.nativeElement.querySelector("textarea") as HTMLTextAreaElement;
    textarea.value = "{broken";
    textarea.dispatchEvent(new Event("input"));
    fixture.detectChanges();

    const importButton = fixture.nativeElement.querySelector(".rb-map-import-btn") as HTMLButtonElement;
    importButton.click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect((fixture.nativeElement.textContent ?? "").includes("Entered text is not valid KML or GeoJSON")).toBeTrue();
  });

  it("hides import controls in view mode", async () => {
    const formConfig: FormConfigFrame = {
      name: "testing",
      componentDefinitions: [
        {
          name: "map_coverage",
          component: {
            class: "MapComponent",
            config: {
              enableImport: true
            }
          },
          model: {
            class: "MapModel",
            config: {
              defaultValue: {type: "FeatureCollection", features: []}
            }
          }
        }
      ]
    };

    const {fixture} = await createFormAndWaitForReady(formConfig, {editMode: false} as any);
    expect(fixture.nativeElement.querySelector("textarea")).toBeNull();
  });

  it("loads pre-existing features into draw state and invalidates map size", async () => {
    const formConfig: FormConfigFrame = {
      name: "testing",
      componentDefinitions: [
        {
          name: "map_coverage",
          component: {
            class: "MapComponent",
            config: {
              enableImport: true
            }
          },
          model: {
            class: "MapModel",
            config: {
              value: {
                type: "FeatureCollection",
                features: [
                  {
                    type: "Feature",
                    geometry: {type: "Point", coordinates: [144.96, -37.81]},
                    properties: {name: "Melbourne"}
                  }
                ]
              }
            }
          }
        }
      ]
    };

    await createFormAndWaitForReady(formConfig, {editMode: true} as any);
    expect(fakeDraw.addFeatures).toHaveBeenCalled();
    expect(fakeMap.invalidateSize).toHaveBeenCalled();
  });
});
