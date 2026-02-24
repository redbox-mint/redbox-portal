import {createFormAndWaitForReady, createTestbedModule} from "../helpers.spec";
import {TestBed} from "@angular/core/testing";
import {RadioInputComponent} from "./radio-input.component";
import {QuestionTreeComponent} from "./question-tree.component";
import {CheckboxInputComponent} from "./checkbox-input.component";
import {FormConfigFrame} from "@researchdatabox/sails-ng-common";

describe('QuestionTreeComponent', () => {
  beforeEach(async () => {
    await createTestbedModule({
      declarations: {
        "RadioInputComponent": RadioInputComponent,
        "CheckboxInputComponent": CheckboxInputComponent,
        "QuestionTreeComponent": QuestionTreeComponent,
      }
    });
  });
  it('should create component', () => {
    let fixture = TestBed.createComponent(QuestionTreeComponent);
    let component = fixture.componentInstance;
    expect(component).toBeDefined();
  });
  it('should render the group and child components', async () => {
    // arrange
    const formConfig: FormConfigFrame = {
      name: 'testing',
      debugValue: true,
      domElementType: 'form',
      defaultComponentConfig: {
        defaultComponentCssClasses: 'row',
      },
      editCssClasses: "redbox-form form",
      componentDefinitions: [{
        name: "questiontree_1",
        model: {class: "QuestionTreeModel"},
        component: {
          class: "QuestionTreeComponent",
          config: {
            availableOutcomes: [
              {value: "outcome1", label: "@outcomes-value1"},
              {value: "outcome2", label: "@outcomes-value2"},
            ],
            availableMeta: {
              prop2: {
                prop2Value1: "@outcomes-prop2-value1",
                prop2Value2: "@outcomes-prop2-value2",
              },
            },
            questions: [
              {
                id: "question_1",
                answersMin: 1,
                answersMax: 1,
                answers: [{value: "yes"}, {value: "no"}],
                rules: {op: "true"},
              },
              {
                id: "question_2",
                answersMin: 1,
                answersMax: 2,
                answers: [{value: "yes"}, {value: "no", meta: {prop2: "prop2Value1"}, outcome: "outcome1"}],
                rules: {op: "in", q: "question_1", a: ["no"]},
              },
              {
                id: "question_3",
                answersMin: 1,
                answersMax: 1,
                answers: [{value: "yes"}, {value: "no"}],
                rules: {op: "in", q: "question_2", a: ["yes"]},
              },
            ],
            componentDefinitions: [
              {
                name: "question_1",
                model: {
                  class: "RadioInputModel",
                },
                component: {
                  class: "RadioInputComponent",
                  config: {
                    options: [{value: "yes", label: "Yes"}, {value: "no", label: "No"}],
                  },
                },
              },
              {
                name: "question_2",
                model: {
                  class: "CheckboxInputModel",
                },
                component: {
                  class: "CheckboxInputComponent",
                  config: {
                    options: [{value: "yes", label: "Yes"}, {value: "no", label: "No"}],
                    multipleValues: true,
                  },
                },
              },
            ],
          }
        },
      }
      ]
    };

    const { fixture, formComponent } = await createFormAndWaitForReady(formConfig);

    // Ensure all expected html elements were created.
    const compiled = fixture.nativeElement as HTMLElement;

    const qtElements = compiled.querySelectorAll('redbox-questiontreefield');
    expect(qtElements).toHaveSize(1);

    const inputElementsInitial = compiled.querySelectorAll('input');
    expect(inputElementsInitial.length).toEqual(4);

    // Check the question_1 options
    const q1RadioElem1 = inputElementsInitial[0] as HTMLInputElement;
    const q1RadioElem2 = inputElementsInitial[1] as HTMLInputElement;

    expect(q1RadioElem1.value).toBe("yes");
    expect(q1RadioElem1.name).toBe("question_1");
    expect(q1RadioElem2.value).toBe("no");
    expect(q1RadioElem2.name).toBe("question_1");

    // Check question_2 options
    const q2CheckboxElem1 = inputElementsInitial[2] as HTMLInputElement;
    const q2CheckboxElem2 = inputElementsInitial[3] as HTMLInputElement;
    expect(q2CheckboxElem1.value).toBe("yes");
    expect(q2CheckboxElem1.name).toBe("question_2");
    expect(q2CheckboxElem2.value).toBe("no");
    expect(q2CheckboxElem2.name).toBe("question_2");
  });

  it('should build child components from questions when componentDefinitions are not provided', async () => {
    const formConfig: FormConfigFrame = {
      name: 'testing',
      debugValue: true,
      domElementType: 'form',
      defaultComponentConfig: {
        defaultComponentCssClasses: 'row',
      },
      editCssClasses: "redbox-form form",
      componentDefinitions: [{
        name: "questiontree_fallback",
        model: {class: "QuestionTreeModel"},
        component: {
          class: "QuestionTreeComponent",
          config: {
            availableOutcomes: [
              {value: "outcome1", label: "@outcomes-value1"},
            ],
            questions: [
              {
                id: "is-data-sensitive",
                answersMin: 1,
                answersMax: 1,
                answers: [{value: "yes", label: "Yes"}, {value: "no", label: "No"}],
                rules: {op: "true"},
              },
            ],
            componentDefinitions: [],
          }
        },
      }]
    };

    const { fixture } = await createFormAndWaitForReady(formConfig);
    const compiled = fixture.nativeElement as HTMLElement;

    const radioElements = compiled.querySelectorAll('input[type="radio"]');
    expect(radioElements.length).toEqual(2);
    expect((radioElements[0] as HTMLInputElement).name).toBe("is-data-sensitive");
    expect((radioElements[1] as HTMLInputElement).name).toBe("is-data-sensitive");
  });
});
