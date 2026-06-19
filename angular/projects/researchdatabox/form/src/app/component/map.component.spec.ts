import {TestBed} from "@angular/core/testing";
import {FormConfigFrame} from "@researchdatabox/sails-ng-common";
import {TranslationService} from "@researchdatabox/portal-ng-common";
import {createFormAndWaitForReady, createTestbedModule} from "../helpers.spec";
import {MAP_DEPENDENCIES_LOADER, MapComponent} from "./map.component";
import {ConfirmationDialogService} from "../confirmation-dialog.service";

describe("MapComponent", () => {
  let fakeMap: any;
  let fakeDraw: any;
  let drawFeatures: unknown[];
  let fakeView: any;
  let fakeRenderSync: jasmine.Spy;
  let fakeVectorLayer: any;
  let fakeVectorSource: any;
  let fakeGeoJSONFormat: any;
  let fakeFromLonLat: jasmine.Spy;
  let fakeIsEmpty: jasmine.Spy;
  let fakeMapCreatesCanvas: boolean;
  let fakeMapCreatesCanvasOnRenderSync: boolean;
  let fakeMapTarget: HTMLElement | undefined;
  let fakeAdapterCtor: jasmine.Spy;
  let drawListeners: Record<string, Function[]>;
  let fakeSelectModeOptions: unknown[];
  let fakeModeInstances: any[];
  let fakeXYZInstances: any[];

  function appendOpenLayersCanvas(target: HTMLElement | undefined): void {
    if (!target?.appendChild || target.querySelector("canvas")) {
      return;
    }
    const viewport = document.createElement("div");
    viewport.className = "ol-viewport";
    viewport.appendChild(document.createElement("canvas"));
    target.appendChild(viewport);
  }

  // OpenLayers-style fake constructors
  function FakeMapCtor(this: any, opts: any) {
    this.target = opts.target;
    fakeMapTarget = opts.target;
    this.layers = opts.layers;
    this.view = opts.view;
    this.updateSize = jasmine.createSpy("updateSize");
    this.setTarget = jasmine.createSpy("setTarget");
    this.addLayer = jasmine.createSpy("addLayer");
    this.removeLayer = jasmine.createSpy("removeLayer");
    this.getView = jasmine.createSpy("getView").and.returnValue(fakeView);
    this.getViewport = jasmine.createSpy("getViewport").and.returnValue(this.target);
    this.renderSync = fakeRenderSync;
    if (fakeMapCreatesCanvas) {
      appendOpenLayersCanvas(this.target);
    }
    Object.assign(this, fakeMap);
    return this;
  }

  function FakeViewCtor(this: any, opts: any) {
    this.center = opts.center;
    this.zoom = opts.zoom;
    this.fit = jasmine.createSpy("fit");
    Object.assign(this, fakeView);
    return this;
  }

  function FakeTileLayerCtor(this: any, opts: any) {
    this.source = opts.source;
  }

  function FakeXYZCtor(this: any, opts: any) {
    this.url = opts.url;
    this.urls = opts.urls;
    this.attributions = opts.attributions;
    fakeXYZInstances.push(this);
  }

  function FakeVectorLayerCtor(this: any, opts: any) {
    this.source = opts.source;
    Object.assign(this, fakeVectorLayer);
    return this;
  }

  function FakeVectorSourceCtor(this: any, opts: any) {
    this.features = opts?.features ?? [];
    this.getExtent = jasmine.createSpy("getExtent").and.returnValue([0, 0, 1, 1]);
    Object.assign(this, fakeVectorSource);
    return this;
  }

  function getToolbarButtons(fixture: any): HTMLButtonElement[] {
    return Array.from(fixture.nativeElement.querySelectorAll(".rb-map-mode-btn")) as HTMLButtonElement[];
  }

  function getButtonLabel(button: HTMLButtonElement): string {
    return button.getAttribute("aria-label") ?? "";
  }

  beforeEach(async () => {
    drawFeatures = [];
    drawListeners = {};
    fakeSelectModeOptions = [];
    fakeModeInstances = [];
    fakeXYZInstances = [];
    fakeMapCreatesCanvas = true;
    fakeMapCreatesCanvasOnRenderSync = false;
    fakeMapTarget = undefined;
    fakeRenderSync = jasmine.createSpy("renderSync").and.callFake(() => {
      if (fakeMapCreatesCanvasOnRenderSync) {
        appendOpenLayersCanvas(fakeMapTarget);
      }
    });
    fakeIsEmpty = jasmine.createSpy("isEmpty").and.returnValue(false);
    fakeFromLonLat = jasmine.createSpy("fromLonLat").and.callFake((coord: [number, number]) => coord);

    fakeView = {
      fit: jasmine.createSpy("fit")
    };

    fakeMap = {
      updateSize: jasmine.createSpy("updateSize"),
      setTarget: jasmine.createSpy("setTarget"),
      addLayer: jasmine.createSpy("addLayer"),
      removeLayer: jasmine.createSpy("removeLayer"),
      getView: jasmine.createSpy("getView").and.returnValue(fakeView)
    };

    fakeVectorLayer = {
      addTo: jasmine.createSpy("addTo")
    };

    fakeVectorSource = {
      features: [],
      getExtent: jasmine.createSpy("getExtent").and.returnValue([0, 0, 1, 1])
    };

    fakeGeoJSONFormat = jasmine.createSpy("GeoJSONFormat").and.callFake(() => ({
      readFeatures: jasmine.createSpy("readFeatures").and.returnValue([])
    }));

    fakeDraw = {
      start: jasmine.createSpy("start"),
      stop: jasmine.createSpy("stop"),
      on: jasmine.createSpy("on").and.callFake((eventName: string, listener: Function) => {
        drawListeners[eventName] = drawListeners[eventName] ?? [];
        drawListeners[eventName].push(listener);
      }),
      setMode: jasmine.createSpy("setMode"),
      addFeatures: jasmine.createSpy("addFeatures").and.callFake((features: unknown[]) => {
        drawFeatures.push(...features);
      }),
      clear: jasmine.createSpy("clear").and.callFake(() => {
        drawFeatures = [];
        drawListeners["change"]?.forEach((listener) => listener({}));
      }),
      removeFeatures: jasmine.createSpy("removeFeatures").and.callFake((ids: unknown[]) => {
        drawFeatures = drawFeatures.filter((feature: any) => !ids.includes(feature.id));
        drawListeners["change"]?.forEach((listener) => listener({deletedIds: ids}));
      }),
      getSnapshot: jasmine.createSpy("getSnapshot").and.callFake(() => ({
        type: "FeatureCollection",
        features: [...drawFeatures]
      }))
    };

    function FakeTerraDrawCtor(this: unknown) {
      return fakeDraw;
    }
    fakeAdapterCtor = jasmine.createSpy("TerraDrawOpenLayersAdapter");
    function FakeAdapterCtor(this: unknown) {
      fakeAdapterCtor();
      return {};
    }
    function fakeModeCtor(modeName: string) {
      return function FakeModeCtor(this: unknown, options?: unknown) {
        const mode = {modeName, options};
        fakeModeInstances.push(mode);
        return mode;
      };
    }
    function FakeSelectModeCtor(this: unknown, options: unknown) {
      const mode = {modeName: "select", options};
      fakeSelectModeOptions.push(options);
      fakeModeInstances.push(mode);
      return mode;
    }

    const mapDependencies = {
      Map: FakeMapCtor as any,
      View: FakeViewCtor as any,
      TileLayer: FakeTileLayerCtor as any,
      VectorLayer: FakeVectorLayerCtor as any,
      XYZ: FakeXYZCtor as any,
      VectorSource: FakeVectorSourceCtor as any,
      GeoJSON: fakeGeoJSONFormat as any,
      fromLonLat: fakeFromLonLat,
      toLonLat: jasmine.createSpy("toLonLat"),
      getUserProjection: jasmine.createSpy("getUserProjection"),
      extentIsEmpty: fakeIsEmpty,
      Feature: function FakeFeature() {} as any,
      Fill: function FakeFill() {} as any,
      Stroke: function FakeStroke() {} as any,
      Circle: function FakeCircle() {} as any,
      Style: function FakeStyle() {} as any,
      Icon: function FakeIcon() {} as any,
      Projection: function FakeProjection() {} as any,
      terraDraw: {
        TerraDraw: FakeTerraDrawCtor,
        TerraDrawPointMode: fakeModeCtor("point"),
        TerraDrawPolygonMode: fakeModeCtor("polygon"),
        TerraDrawLineStringMode: fakeModeCtor("linestring"),
        TerraDrawRectangleMode: fakeModeCtor("rectangle"),
        TerraDrawCircleMode: fakeModeCtor("circle"),
        TerraDrawSelectMode: FakeSelectModeCtor
      },
      terraDrawOpenLayersAdapter: {
        TerraDrawOpenLayersAdapter: fakeAdapterCtor
      },
      parseKmlToGeoJson: () => ({
        type: "FeatureCollection",
        features: [
          {
            type: "Feature",
            geometry: {type: "Point", coordinates: [146.82, -19.25]},
            properties: {name: "Townsville"}
          }
        ]
      })
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

  it("exposes toolbar help text to assistive technology", async () => {
    const formConfig: FormConfigFrame = {
      name: "testing",
      componentDefinitions: [
        {
          name: "map_coverage",
          component: {
            class: "MapComponent",
            config: {
              enabledModes: ["point", "select"]
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
    await fixture.whenStable();
    fixture.detectChanges();

    const pointButton = fixture.nativeElement.querySelector(".rb-map-mode-btn") as HTMLButtonElement;
    const helpId = pointButton.getAttribute("aria-describedby");
    expect(helpId).toBe("rb-map-mode-help-point");
    expect(fixture.nativeElement.querySelector(`#${helpId}`)?.textContent).toContain("Add a point marker to the map.");
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

  it("imports a single GeoJSON feature snippet", async () => {
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
      type: "Feature",
      geometry: {type: "Point", coordinates: [146.82, -19.25]},
      properties: {name: "Townsville"}
    });
    textarea.dispatchEvent(new Event("input"));
    fixture.detectChanges();

    const importButton = fixture.nativeElement.querySelector(".rb-map-import-btn") as HTMLButtonElement;
    importButton.click();
    await fixture.whenStable();

    const modelValue = (formComponent as any).form.value?.map_coverage;
    expect(modelValue?.type).toBe("FeatureCollection");
    expect((modelValue?.features ?? []).length).toBe(1);
    expect(modelValue.features[0].properties.name).toBe("Townsville");
  });

  it("imports a raw GeoJSON geometry snippet", async () => {
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
      type: "Point",
      coordinates: [146.82, -19.25]
    });
    textarea.dispatchEvent(new Event("input"));
    fixture.detectChanges();

    const importButton = fixture.nativeElement.querySelector(".rb-map-import-btn") as HTMLButtonElement;
    importButton.click();
    await fixture.whenStable();

    const modelValue = (formComponent as any).form.value?.map_coverage;
    expect((modelValue?.features ?? []).length).toBe(1);
    expect(modelValue.features[0].geometry.type).toBe("Point");
  });

  it("imports KML and updates form model value", async () => {
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
    textarea.value = "<kml><Placemark><Point><coordinates>146.82,-19.25</coordinates></Point></Placemark></kml>";
    textarea.dispatchEvent(new Event("input"));
    fixture.detectChanges();

    const importButton = fixture.nativeElement.querySelector(".rb-map-import-btn") as HTMLButtonElement;
    importButton.click();
    await fixture.whenStable();

    const modelValue = (formComponent as any).form.value?.map_coverage;
    expect((modelValue?.features ?? []).length).toBe(1);
    expect(modelValue.features[0].properties.name).toBe("Townsville");
  });

  it("renders translated coordinates help text", async () => {
    const translationService = TestBed.inject(TranslationService as any) as any;
    spyOn(translationService, "t").and.callFake((key: string) => {
      if (key === "@dataPublication-geospatial-coordinates-help") {
        return "Enter or paste translated KML or GeoJSON help.";
      }
      return key;
    });
    const formConfig: FormConfigFrame = {
      name: "testing",
      componentDefinitions: [
        {
          name: "map_coverage",
          component: {
            class: "MapComponent",
            config: {
              enableImport: true,
              coordinatesHelp: "@dataPublication-geospatial-coordinates-help"
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
    await fixture.whenStable();
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain("Enter or paste translated KML or GeoJSON help.");
    expect(fixture.nativeElement.textContent).not.toContain("@dataPublication-geospatial-coordinates-help");
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
    expect(fakeDraw.addFeatures).toHaveBeenCalledOnceWith([
      {
        type: "Feature",
        geometry: {type: "Point", coordinates: [144.96, -37.81]},
        properties: {name: "Melbourne"}
      }
    ]);
    expect(drawFeatures.length).toBe(1);
    expect(fakeMap.updateSize).toHaveBeenCalled();
  });

  it("initialises draw tooling when a disabled map is enabled after map load", async () => {
    const formConfig: FormConfigFrame = {
      name: "testing",
      componentDefinitions: [
        {
          name: "map_coverage",
          component: {
            class: "MapComponent",
            config: {
              disabled: true,
              enableImport: true,
              enabledModes: ["point", "polygon"]
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
    const mapComponent = formComponent.getComponentDefByName("map_coverage")?.component as MapComponent;
    await fixture.whenStable();
    fixture.detectChanges();
    const disabledModeButtons = Array.from(fixture.nativeElement.querySelectorAll(".rb-map-mode-btn")) as HTMLButtonElement[];

    expect(fakeDraw.start).not.toHaveBeenCalled();
    expect(disabledModeButtons.some((button) => !button.disabled)).toBeFalse();

    mapComponent.setDisabled(false);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const enabledModeButtons = Array.from(fixture.nativeElement.querySelectorAll(".rb-map-mode-btn")) as HTMLButtonElement[];

    expect(fakeDraw.start).toHaveBeenCalled();
    expect(enabledModeButtons.length).toBeGreaterThan(0);
    expect(enabledModeButtons.every((button) => !button.disabled)).toBeTrue();

    const polygonButton = enabledModeButtons.find((button) => getButtonLabel(button) === "Polygon") as HTMLButtonElement;
    polygonButton.click();
    fixture.detectChanges();

    expect(fakeDraw.setMode).toHaveBeenCalledWith("polygon");
    expect(mapComponent.activeMode).toBe("polygon");
  });

  it("adds select/delete tooling and deletes selected draw features", async () => {
    const formConfig: FormConfigFrame = {
      name: "testing",
      componentDefinitions: [
        {
          name: "map_coverage",
          component: {
            class: "MapComponent",
            config: {
              enableImport: true,
              enabledModes: ["point", "select"]
            }
          },
          model: {
            class: "MapModel",
            config: {
              value: {
                type: "FeatureCollection",
                features: [
                  {
                    id: "feature-1",
                    type: "Feature",
                    geometry: {type: "Point", coordinates: [144.96, -37.81]},
                    properties: {name: "Melbourne", mode: "point"}
                  },
                  {
                    id: "feature-2",
                    type: "Feature",
                    geometry: {type: "Point", coordinates: [153.02, -27.47]},
                    properties: {name: "Brisbane", mode: "point"}
                  }
                ]
              }
            }
          }
        }
      ]
    };

    const {fixture, formComponent} = await createFormAndWaitForReady(formConfig, {editMode: true} as any);
    const mapComponent = formComponent.getComponentDefByName("map_coverage")?.component as MapComponent;
    await fixture.whenStable();
    fixture.detectChanges();

    const modeButtons = getToolbarButtons(fixture);
    const modeButtonLabels = modeButtons.map(getButtonLabel);
    expect(modeButtonLabels).toContain("Point");
    expect(modeButtonLabels).toContain("Select/Edit");

    // Delete button stays hidden until a feature is selected.
    expect(fixture.nativeElement.querySelector(".rb-map-delete-btn")).toBeNull();
    const selectButton = modeButtons.find((button) => getButtonLabel(button) === "Select/Edit") as HTMLButtonElement;
    selectButton.click();
    fixture.detectChanges();

    drawListeners["select"]?.forEach((listener) => listener("feature-1"));
    fixture.detectChanges();
    const deleteButton = fixture.nativeElement.querySelector(".rb-map-delete-btn") as HTMLButtonElement;
    expect(deleteButton).not.toBeNull();
    expect(deleteButton.disabled).toBeFalse();
    const setValueSpy = spyOn(mapComponent.formControl, "setValue").and.callThrough();

    deleteButton.click();
    fixture.detectChanges();

    expect(fakeDraw.removeFeatures).toHaveBeenCalledOnceWith(["feature-1"]);
    expect(setValueSpy).toHaveBeenCalledTimes(1);
    expect(fakeDraw.setMode).toHaveBeenCalledWith("select");
    expect(mapComponent.activeMode).toBe("select");
    expect(mapComponent.selectedFeatureIds.size).toBe(0);
    const modelValue = (formComponent as any).form.value?.map_coverage;
    expect((modelValue?.features ?? []).map((feature: any) => feature.id)).toEqual(["feature-2"]);
  });

  it("clears all map features after confirmation", async () => {
    const confirmationDialogService = TestBed.inject(ConfirmationDialogService);
    const confirmSpy = spyOn(confirmationDialogService, "confirm").and.resolveTo(true);
    const formConfig: FormConfigFrame = {
      name: "testing",
      componentDefinitions: [
        {
          name: "map_coverage",
          component: {
            class: "MapComponent",
            config: {
              enableImport: true,
              enabledModes: ["point", "select"]
            }
          },
          model: {
            class: "MapModel",
            config: {
              value: {
                type: "FeatureCollection",
                features: [
                  {
                    id: "feature-1",
                    type: "Feature",
                    geometry: {type: "Point", coordinates: [144.96, -37.81]},
                    properties: {name: "Melbourne", mode: "point"}
                  }
                ]
              }
            }
          }
        }
      ]
    };

    const {fixture, formComponent} = await createFormAndWaitForReady(formConfig, {editMode: true} as any);
    await fixture.whenStable();
    fixture.detectChanges();

    const clearButton = fixture.nativeElement.querySelector(".rb-map-clear-btn") as HTMLButtonElement;
    expect(clearButton).not.toBeNull();
    clearButton.click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(confirmSpy).toHaveBeenCalledWith({
      title: "Clear map features",
      message: "Clear all map features?",
      confirmLabel: "Clear All",
      cancelLabel: "Cancel",
      confirmButtonClass: "btn btn-danger"
    });
    expect(fakeDraw.clear).toHaveBeenCalled();
    const modelValue = (formComponent as any).form.value?.map_coverage;
    expect(modelValue).toEqual({type: "FeatureCollection", features: []});
    expect(fixture.nativeElement.querySelector(".rb-map-clear-btn")).toBeNull();
  });

  it("hides the select button until the map has features", async () => {
    const formConfig: FormConfigFrame = {
      name: "testing",
      componentDefinitions: [
        {
          name: "map_coverage",
          component: {
            class: "MapComponent",
            config: {
              enableImport: true,
              enabledModes: ["point", "select"]
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
    const mapComponent = formComponent.getComponentDefByName("map_coverage")?.component as MapComponent;
    await fixture.whenStable();
    fixture.detectChanges();

    const initialModeButtons = getToolbarButtons(fixture);
    expect(initialModeButtons.map(getButtonLabel)).toEqual(["Point"]);
    expect(fixture.nativeElement.querySelector(".rb-map-delete-btn")).toBeNull();

    mapComponent.formControl.setValue({
      type: "FeatureCollection",
      features: [
        {
          id: "feature-1",
          type: "Feature",
          geometry: {type: "Point", coordinates: [144.96, -37.81]},
          properties: {name: "Melbourne", mode: "point"}
        }
      ]
    });
    fixture.detectChanges();

    expect(getToolbarButtons(fixture).map(getButtonLabel)).toContain("Select/Edit");
  });

  it("configures select mode so drawn rectangles can be manually selected", async () => {
    const formConfig: FormConfigFrame = {
      name: "testing",
      componentDefinitions: [
        {
          name: "map_coverage",
          component: {
            class: "MapComponent",
            config: {
              enableImport: true,
              enabledModes: ["rectangle", "select"]
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

    await createFormAndWaitForReady(formConfig, {editMode: true} as any);

    expect(fakeSelectModeOptions.length).toBeGreaterThan(0);
    expect(fakeSelectModeOptions[0]).toEqual(jasmine.objectContaining({
      allowManualDeselection: true,
      allowManualSelection: true,
      pointerDistance: 30,
      flags: jasmine.objectContaining({
        rectangle: jasmine.objectContaining({
          feature: jasmine.objectContaining({
            draggable: true,
            coordinates: jasmine.objectContaining({
              draggable: true,
              midpoints: jasmine.objectContaining({draggable: true}),
              deletable: true
            })
          })
        })
      })
    }));
  });

  it("includes circle draw mode in default draw tooling", async () => {
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
    await fixture.whenStable();
    fixture.detectChanges();

    const modeButtonText = getToolbarButtons(fixture).map(getButtonLabel);
    const circleMode = fakeModeInstances.find((mode) => mode.modeName === "circle");

    expect(modeButtonText).toContain("Circle");
    expect(circleMode).toEqual(jasmine.objectContaining({
      modeName: "circle",
      options: {drawInteraction: "click-drag"}
    }));
  });

  it("does not add select/delete tooling when select mode is disabled", async () => {
    const formConfig: FormConfigFrame = {
      name: "testing",
      componentDefinitions: [
        {
          name: "map_coverage",
          component: {
            class: "MapComponent",
            config: {
              enableImport: true,
              enabledModes: ["point"]
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
    await fixture.whenStable();
    fixture.detectChanges();

    const modeButtonText = getToolbarButtons(fixture).map(getButtonLabel);
    expect(modeButtonText).toEqual(["Point"]);
    expect(fixture.nativeElement.querySelector(".rb-map-delete-btn")).toBeNull();
    expect(fakeSelectModeOptions.length).toBe(0);
  });

  it("waits for the OpenLayers canvas before initialising draw tooling", async () => {
    fakeMapCreatesCanvas = false;
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
    await fixture.whenStable();
    fixture.detectChanges();

    expect(fakeAdapterCtor).not.toHaveBeenCalled();
    expect(fakeDraw.start).not.toHaveBeenCalled();

    expect(fakeMapTarget).toBeDefined();
    const viewport = document.createElement("div");
    viewport.className = "ol-viewport";
    viewport.appendChild(document.createElement("canvas"));
    fakeMapTarget!.appendChild(viewport);

    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    fixture.detectChanges();

    expect(fakeAdapterCtor).toHaveBeenCalled();
    expect(fakeDraw.start).toHaveBeenCalled();
  });

  it("initialises draw tooling when renderSync creates the OpenLayers canvas", async () => {
    fakeMapCreatesCanvas = false;
    fakeMapCreatesCanvasOnRenderSync = true;
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
    await fixture.whenStable();
    fixture.detectChanges();

    expect(fakeRenderSync).toHaveBeenCalled();
    expect(fakeMapTarget?.querySelector("canvas")).not.toBeNull();
    expect(fakeAdapterCtor).toHaveBeenCalled();
    expect(fakeDraw.start).toHaveBeenCalled();
  });

  it("creates map with fromLonLat for configured center", async () => {
    const formConfig: FormConfigFrame = {
      name: "testing",
      componentDefinitions: [
        {
          name: "map_coverage",
          component: {
            class: "MapComponent",
            config: {
              center: [-27.47, 153.02],
              zoom: 10
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

    await createFormAndWaitForReady(formConfig, {editMode: false} as any);
    expect(fakeFromLonLat).toHaveBeenCalledWith([153.02, -27.47]);
  });

  it("calls draw.stop and map.setTarget on destroy", async () => {
    const formConfig: FormConfigFrame = {
      name: "testing",
      componentDefinitions: [
        {
          name: "map_coverage",
          component: {
            class: "MapComponent",
            config: {}
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
    await fixture.whenStable();
    fixture.detectChanges();

    fixture.destroy();

    expect(fakeDraw.stop).toHaveBeenCalled();
    expect(fakeMap.setTarget).toHaveBeenCalledWith(undefined);
  });

  it("expands {s} in tile URL to multiple urls", async () => {
    const formConfig: FormConfigFrame = {
      name: "testing",
      componentDefinitions: [
        {
          name: "map_coverage",
          component: {
            class: "MapComponent",
            config: {
              tileLayers: [
                {
                  name: "Custom",
                  url: "https://{s}.tile.example.com/{z}/{x}/{y}.png",
                  options: {subdomains: ["x", "y", "z"]}
                }
              ]
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

    await createFormAndWaitForReady(formConfig, {editMode: false} as any);

    expect(fakeFromLonLat).toHaveBeenCalled();
    expect(fakeXYZInstances.length).toBe(1);
    const xyzInstance = fakeXYZInstances[0];
    expect(xyzInstance.urls).toEqual([
      "https://x.tile.example.com/{z}/{x}/{y}.png",
      "https://y.tile.example.com/{z}/{x}/{y}.png",
      "https://z.tile.example.com/{z}/{x}/{y}.png"
    ]);
  });

  it("expands legacy string subdomains in tile URL", async () => {
    const formConfig: FormConfigFrame = {
      name: "testing",
      componentDefinitions: [
        {
          name: "map_coverage",
          component: {
            class: "MapComponent",
            config: {
              tileLayers: [
                {
                  name: "Legacy",
                  url: "https://{s}.tile.example.com/{z}/{x}/{y}.png",
                  options: {subdomains: "abc"}
                }
              ]
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

    await createFormAndWaitForReady(formConfig, {editMode: false} as any);

    expect(fakeXYZInstances.length).toBe(1);
    expect(fakeXYZInstances[0].urls).toEqual([
      "https://a.tile.example.com/{z}/{x}/{y}.png",
      "https://b.tile.example.com/{z}/{x}/{y}.png",
      "https://c.tile.example.com/{z}/{x}/{y}.png"
    ]);
  });

  it("falls back to default tile subdomains when configured subdomains are empty", async () => {
    const formConfig: FormConfigFrame = {
      name: "testing",
      componentDefinitions: [
        {
          name: "map_coverage",
          component: {
            class: "MapComponent",
            config: {
              tileLayers: [
                {
                  name: "Empty",
                  url: "https://{s}.tile.example.com/{z}/{x}/{y}.png",
                  options: {subdomains: ""}
                }
              ]
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

    await createFormAndWaitForReady(formConfig, {editMode: false} as any);

    expect(fakeXYZInstances.length).toBe(1);
    expect(fakeXYZInstances[0].urls).toEqual([
      "https://a.tile.example.com/{z}/{x}/{y}.png",
      "https://b.tile.example.com/{z}/{x}/{y}.png",
      "https://c.tile.example.com/{z}/{x}/{y}.png"
    ]);
  });
});
