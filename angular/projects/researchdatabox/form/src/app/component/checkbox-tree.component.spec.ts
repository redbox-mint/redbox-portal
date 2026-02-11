import { TestBed } from "@angular/core/testing";
import { FormConfigFrame } from "@researchdatabox/sails-ng-common";
import { createFormAndWaitForReady, createTestbedModule } from "../helpers.spec";
import { CheckboxTreeComponent } from "./checkbox-tree.component";
import { VocabTreeService } from "../service/vocab-tree.service";

describe("CheckboxTreeComponent", () => {
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
