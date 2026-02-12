import {TestBed} from "@angular/core/testing";
import {FormConfigFrame} from "@researchdatabox/sails-ng-common";
import {createFormAndWaitForReady, createTestbedModule} from "../helpers.spec";
import {RichTextEditorComponent} from "./rich-text-editor.component";

describe("RichTextEditorComponent", () => {
  beforeEach(async () => {
    await createTestbedModule({declarations: {"RichTextEditorComponent": RichTextEditorComponent}});
  });

  it("should create component", () => {
    const fixture = TestBed.createComponent(RichTextEditorComponent);
    const component = fixture.componentInstance;
    expect(component).toBeDefined();
  });

  it("renders HTML in readonly mode and sanitizes unsafe tags", async () => {
    const formConfig: FormConfigFrame = {
      name: "testing",
      componentDefinitions: [
        {
          name: "htmlField",
          component: {
            class: "RichTextEditorComponent",
            config: {
              readonly: true,
              outputFormat: "html"
            }
          },
          model: {
            class: "RichTextEditorModel",
            config: {
              value: "<script>alert('xss')</script><p><strong>Safe</strong> body</p>"
            }
          }
        }
      ]
    };

    const {fixture} = await createFormAndWaitForReady(formConfig);
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector("script")).toBeNull();
    const content = (compiled.querySelector(".redbox-rich-text-view") as HTMLElement)?.innerHTML ?? "";
    expect(content).toContain("<p><strong>Safe</strong> body</p>");
  });

  it("renders markdown as HTML in readonly mode", async () => {
    const formConfig: FormConfigFrame = {
      name: "testing",
      componentDefinitions: [
        {
          name: "markdownField",
          component: {
            class: "RichTextEditorComponent",
            config: {
              readonly: true,
              outputFormat: "markdown"
            }
          },
          model: {
            class: "RichTextEditorModel",
            config: {
              value: "**Bold markdown**"
            }
          }
        }
      ]
    };

    const {fixture} = await createFormAndWaitForReady(formConfig);
    const compiled = fixture.nativeElement as HTMLElement;
    const content = (compiled.querySelector(".redbox-rich-text-view") as HTMLElement)?.innerHTML ?? "";
    expect(content).toContain("<strong>Bold markdown</strong>");
  });

  it("keeps readonly view content in sync with formControl setValue", async () => {
    const formConfig: FormConfigFrame = {
      name: "testing",
      componentDefinitions: [
        {
          name: "syncField",
          component: {
            class: "RichTextEditorComponent",
            config: {
              readonly: true,
              outputFormat: "html"
            }
          },
          model: {
            class: "RichTextEditorModel",
            config: {
              value: "<p>Before</p>"
            }
          }
        }
      ]
    };

    const {fixture, formComponent} = await createFormAndWaitForReady(formConfig);
    (formComponent as any).form.controls.syncField.setValue("<p>After</p>");
    await fixture.whenStable();
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    const content = (compiled.querySelector(".redbox-rich-text-view") as HTMLElement)?.innerHTML ?? "";
    expect(content).toContain("<p>After</p>");
  });
});
