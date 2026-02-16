import { TestBed } from "@angular/core/testing";
import { FormConfigFrame, buildKeyString } from "@researchdatabox/sails-ng-common";
import { UtilityService } from "@researchdatabox/portal-ng-common";
import { createFormAndWaitForReady, createTestbedModule } from "../helpers.spec";
import { CheckboxTreeComponent } from "./checkbox-tree.component";
import { VocabTreeService } from "../service/vocab-tree.service";

describe("CheckboxTreeComponent", () => {
  const createDeferred = <T>() => {
    let resolve!: (value: T) => void;
    let reject!: (reason?: unknown) => void;
    const promise = new Promise<T>((res, rej) => {
      resolve = res;
      reject = rej;
    });
    return { promise, resolve, reject };
  };

  beforeEach(async () => {
    await createTestbedModule({
      declarations: {
        "CheckboxTreeComponent": CheckboxTreeComponent,
      },
    });
  });

  it("should create component", () => {
    const fixture = TestBed.createComponent(CheckboxTreeComponent);
    const component = fixture.componentInstance;
    expect(component).toBeDefined();
  });

  it("renders inline tree and supports leaf-only checkboxes", async () => {
    const formConfig: FormConfigFrame = {
      name: "testing",
      componentDefinitions: [
        {
          name: "anzsrc",
          component: {
            class: "CheckboxTreeComponent",
            config: {
              inlineVocab: true,
              leafOnly: true,
              treeData: [
                {
                  id: "root",
                  label: "Root",
                  value: "01",
                  notation: "01",
                  hasChildren: true,
                  children: [
                    { id: "leaf", label: "Leaf", value: "0101", notation: "0101", hasChildren: false }
                  ]
                }
              ]
            }
          },
          model: {
            class: "CheckboxTreeModel",
            config: {
              value: []
            }
          }
        }
      ]
    };

    const { fixture } = await createFormAndWaitForReady(formConfig);
    const compiled = fixture.nativeElement as HTMLElement;
    (compiled.querySelector("button") as HTMLButtonElement)?.click();
    await fixture.whenStable();

    const checkboxes = compiled.querySelectorAll('input[type="checkbox"]');
    expect(checkboxes.length).toBe(1);
    expect((compiled.textContent ?? "").includes("Leaf")).toBeTrue();
  });

  it("renders templated visible labels while preserving selected item label value", async () => {
    const utilityService = TestBed.inject(UtilityService);
    spyOn(utilityService, "getDynamicImport").and.callFake(async (brandingAndPortalUrl: string, urlPath: string[]) => {
      const urlKey = `${brandingAndPortalUrl}/${(urlPath ?? []).join("/")}`;
      if (urlKey.startsWith("http://localhost/default/rdmp/dynamicAsset/formCompiledItems/rdmp/oid-generated-")) {
        return {
          evaluate: (key: (string | number)[], context: any) => {
            const keyStr = buildKeyString(key as string[]);
            if (keyStr === "componentDefinitions__0__component__config__labelTemplate") {
              return `${String(context?.notation ?? "").split("/").at(-1)} - ${context?.label ?? ""}`;
            }
            throw new Error(`Unknown key: ${keyStr}`);
          }
        };
      }
      throw new Error(`Unknown url key: ${urlKey}`);
    });

    const formConfig: FormConfigFrame = {
      name: "testing",
      componentDefinitions: [
        {
          name: "anzsrc",
          component: {
            class: "CheckboxTreeComponent",
            config: {
              inlineVocab: true,
              leafOnly: false,
              labelTemplate: "{{default (split notation '/' -1) notation}} - {{label}}",
              treeData: [
                {
                  id: "root",
                  label: "Agricultural biotechnology diagnostics (incl. biosensors)",
                  value: "https://linked.data.gov.au/def/anzsrc-for/2020/300101",
                  notation: "https://linked.data.gov.au/def/anzsrc-for/2020/300101",
                  hasChildren: false
                }
              ]
            }
          },
          model: { class: "CheckboxTreeModel", config: { value: [] } }
        }
      ]
    };

    const { fixture, formComponent } = await createFormAndWaitForReady(formConfig);
    const compiled = fixture.nativeElement as HTMLElement;
    expect((compiled.textContent ?? "").includes("300101 - Agricultural biotechnology diagnostics (incl. biosensors)")).toBeTrue();

    const checkbox = compiled.querySelector('input[type="checkbox"]') as HTMLInputElement;
    checkbox.click();
    checkbox.dispatchEvent(new Event("change"));
    await fixture.whenStable();

    const formValue = (formComponent as any).form.value?.anzsrc ?? [];
    expect(formValue.length).toBe(1);
    expect(formValue[0]?.label).toBe("Agricultural biotechnology diagnostics (incl. biosensors)");
    expect(formValue[0]?.name).toBe("https://linked.data.gov.au/def/anzsrc-for/2020/300101 - Agricultural biotechnology diagnostics (incl. biosensors)");
  });

  it("does not cascade selection and sets parent indeterminate for selected descendants", async () => {
    const formConfig: FormConfigFrame = {
      name: "testing",
      componentDefinitions: [
        {
          name: "anzsrc",
          component: {
            class: "CheckboxTreeComponent",
            config: {
              inlineVocab: true,
              leafOnly: false,
              treeData: [
                {
                  id: "root",
                  label: "Root",
                  value: "01",
                  notation: "01",
                  hasChildren: true,
                  children: [
                    { id: "leaf-1", label: "Leaf 1", value: "0101", notation: "0101", hasChildren: false },
                    { id: "leaf-2", label: "Leaf 2", value: "0102", notation: "0102", hasChildren: false }
                  ]
                }
              ]
            }
          },
          model: {
            class: "CheckboxTreeModel",
            config: {
              value: []
            }
          }
        }
      ]
    };

    const { fixture, formComponent } = await createFormAndWaitForReady(formConfig);
    const compiled = fixture.nativeElement as HTMLElement;
    (compiled.querySelector("button") as HTMLButtonElement)?.click();
    await fixture.whenStable();

    const checkboxes = compiled.querySelectorAll('input[type="checkbox"]') as NodeListOf<HTMLInputElement>;
    checkboxes[1].click();
    checkboxes[1].dispatchEvent(new Event("change"));
    await fixture.whenStable();

    expect(checkboxes[0].checked).toBeFalse();
    expect(checkboxes[0].indeterminate).toBeTrue();
    const formValue = (formComponent as any).form.value?.anzsrc ?? [];
    expect(formValue.length).toBe(1);
    expect(formValue[0]?.notation).toBe("0101");
  });

  it("applies tree accessibility roles and aria attributes", async () => {
    const formConfig: FormConfigFrame = {
      name: "testing",
      componentDefinitions: [
        {
          name: "anzsrc",
          component: {
            class: "CheckboxTreeComponent",
            config: {
              inlineVocab: true,
              leafOnly: false,
              treeData: [{ id: "root", label: "Root", value: "01", notation: "01", hasChildren: false }]
            }
          },
          model: { class: "CheckboxTreeModel", config: { value: [] } }
        }
      ]
    };

    const { fixture } = await createFormAndWaitForReady(formConfig);
    const compiled = fixture.nativeElement as HTMLElement;
    const tree = compiled.querySelector('[role="tree"]');
    const treeItem = compiled.querySelector('[role="treeitem"]');
    expect(tree).toBeTruthy();
    expect(treeItem?.getAttribute("aria-level")).toBe("1");
    expect(treeItem?.getAttribute("aria-checked")).toBe("false");
  });

  it("supports keyboard navigation and selection", async () => {
    const formConfig: FormConfigFrame = {
      name: "testing",
      componentDefinitions: [
        {
          name: "anzsrc",
          component: {
            class: "CheckboxTreeComponent",
            config: {
              inlineVocab: true,
              leafOnly: false,
              treeData: [
                { id: "root-1", label: "Root 1", value: "01", notation: "01", hasChildren: false },
                { id: "root-2", label: "Root 2", value: "02", notation: "02", hasChildren: false }
              ]
            }
          },
          model: { class: "CheckboxTreeModel", config: { value: [] } }
        }
      ]
    };

    const { fixture } = await createFormAndWaitForReady(formConfig);
    const compiled = fixture.nativeElement as HTMLElement;
    const tree = compiled.querySelector('[role="tree"]') as HTMLElement;
    tree.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown" }));
    fixture.detectChanges();
    await fixture.whenStable();

    let activeItem = compiled.querySelector('[role="treeitem"][tabindex="0"]') as HTMLElement;
    expect(activeItem.textContent ?? "").toContain("Root 2");

    tree.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
    fixture.detectChanges();
    await fixture.whenStable();

    const selectedCheckbox = activeItem.querySelector('input[type="checkbox"]') as HTMLInputElement;
    expect(selectedCheckbox.checked).toBeTrue();
  });

  it("shows loading indicator while lazy child nodes are loading", async () => {
    const vocabTreeService = TestBed.inject(VocabTreeService);
    const deferred = createDeferred<{ data: Array<Record<string, unknown>>; meta: Record<string, unknown> }>();
    spyOn(vocabTreeService, "getChildren").and.callFake((_vocabRef: string, parentId?: string) => {
      if (!parentId) {
        return Promise.resolve({
          data: [{ id: "root", label: "Root", value: "01", notation: "01", parent: null, hasChildren: true }],
          meta: { vocabularyId: "v1", parentId: null, total: 1 }
        } as any);
      }
      return deferred.promise as Promise<any>;
    });

    const formConfig: FormConfigFrame = {
      name: "testing",
      componentDefinitions: [
        {
          name: "anzsrc",
          component: {
            class: "CheckboxTreeComponent",
            config: {
              vocabRef: "anzsrc-2020-for",
              inlineVocab: false,
              leafOnly: true,
              treeData: [{ id: "root", label: "Root", value: "01", notation: "01", hasChildren: true }]
            }
          },
          model: { class: "CheckboxTreeModel", config: { value: [] } }
        }
      ]
    };

    const { fixture } = await createFormAndWaitForReady(formConfig);
    const compiled = fixture.nativeElement as HTMLElement;
    (compiled.querySelector("button") as HTMLButtonElement)?.click();
    fixture.detectChanges();
    await fixture.whenStable();
    expect((compiled.textContent ?? "").includes("Loading...")).toBeTrue();

    deferred.resolve({ data: [], meta: { vocabularyId: "v1", parentId: null, total: 0 } });
    await fixture.whenStable();
    fixture.detectChanges();

    expect((compiled.textContent ?? "").includes("Loading...")).toBeFalse();
  });

  it("handles empty vocabulary response without errors", async () => {
    const vocabTreeService = TestBed.inject(VocabTreeService);
    spyOn(vocabTreeService, "getChildren").and.resolveTo({
      data: [],
      meta: { vocabularyId: "v1", parentId: null, total: 0 }
    });

    const formConfig: FormConfigFrame = {
      name: "testing",
      componentDefinitions: [
        {
          name: "anzsrc",
          component: {
            class: "CheckboxTreeComponent",
            config: {
              vocabRef: "anzsrc-2020-for",
              inlineVocab: false,
              leafOnly: true
            }
          },
          model: { class: "CheckboxTreeModel", config: { value: [] } }
        }
      ]
    };

    const { fixture } = await createFormAndWaitForReady(formConfig);
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelectorAll('[role="treeitem"]').length).toBe(0);
    expect((compiled.textContent ?? "").includes("Unable to load vocabulary tree.")).toBeFalse();
  });

  it("deduplicates duplicate node ids in inline tree data", async () => {
    const formConfig: FormConfigFrame = {
      name: "testing",
      componentDefinitions: [
        {
          name: "anzsrc",
          component: {
            class: "CheckboxTreeComponent",
            config: {
              inlineVocab: true,
              leafOnly: false,
              treeData: [
                { id: "dup", label: "First", value: "01", notation: "01", hasChildren: false },
                { id: "dup", label: "Second", value: "02", notation: "02", hasChildren: false }
              ]
            }
          },
          model: { class: "CheckboxTreeModel", config: { value: [] } }
        }
      ]
    };

    const { fixture } = await createFormAndWaitForReady(formConfig);
    const compiled = fixture.nativeElement as HTMLElement;
    const treeItems = compiled.querySelectorAll('[role="treeitem"]');
    expect(treeItems.length).toBe(1);
    expect(treeItems[0].textContent ?? "").toContain("First");
  });

  it("renders very large sibling lists", async () => {
    const treeData = Array.from({ length: 250 }).map((_, index) => ({
      id: `node-${index}`,
      label: `Node ${index}`,
      value: `${index}`,
      notation: `${index}`,
      hasChildren: false
    }));
    const formConfig: FormConfigFrame = {
      name: "testing",
      componentDefinitions: [
        {
          name: "anzsrc",
          component: {
            class: "CheckboxTreeComponent",
            config: {
              inlineVocab: true,
              leafOnly: false,
              treeData
            }
          },
          model: { class: "CheckboxTreeModel", config: { value: [] } }
        }
      ]
    };

    const { fixture } = await createFormAndWaitForReady(formConfig);
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelectorAll('[role="treeitem"]').length).toBe(250);
  });

  it("shows error state when lazy loading root nodes fails", async () => {
    const vocabTreeService = TestBed.inject(VocabTreeService);
    spyOn(vocabTreeService, "getChildren").and.rejectWith(new Error("Failed to load children"));

    const formConfig: FormConfigFrame = {
      name: "testing",
      componentDefinitions: [
        {
          name: "anzsrc",
          component: {
            class: "CheckboxTreeComponent",
            config: {
              vocabRef: "anzsrc-2020-for",
              inlineVocab: false,
              leafOnly: true
            }
          },
          model: { class: "CheckboxTreeModel", config: { value: [] } }
        }
      ]
    };

    const { fixture } = await createFormAndWaitForReady(formConfig);
    const compiled = fixture.nativeElement as HTMLElement;
    expect((compiled.textContent ?? "").includes("Failed to load children")).toBeTrue();
  });
});
