import {createFormAndWaitForReady, createTestbedModule} from "../helpers.spec";
import {TestBed} from "@angular/core/testing";
import {RadioInputComponent} from "./radio-input.component";
import {QuestionTreeComponent} from "./question-tree.component";
import {CheckboxInputComponent} from "./checkbox-input.component";
import {
  FormConfigFrame, QuestionTreeFieldComponentConfigFrame,
  QuestionTreeModelValueType,
  QuestionTreeOutcomeInfo,
  QuestionTreeOutcomeInfoKey
} from "@researchdatabox/sails-ng-common";

describe('QuestionTreeComponent', () => {

  // question tree component with 3 questions
  // question_1 is the start,
  // question_2 shows only when question_1 is "no", and has an outcome & meta
  // question_3 shows only when question_2 is "yes
  const formConfig: FormConfigFrame = {
    name: 'testing',
    debugValue: true,
    domElementType: 'form',
    defaultComponentConfig: {
      defaultComponentCssClasses: 'row',
    },
    editCssClasses: "redbox-form form",
    componentDefinitions: [
      {
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
              {
                name: "question_3",
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
                name: QuestionTreeOutcomeInfoKey,
                component: {class: "SimpleInputComponent", config: {type: "hidden"}},
                model: {class: "SimpleInputModel", config: {}},
              }
            ],
          }
        },
      },
      {
        "name": "data-classification-item-outcome",
        "component": {"class": "SimpleInputComponent", "config": {}},
        "model": {"class": "SimpleInputModel", "config": {"validators": [{"class": "required"}]}},
        expressions: [
          {
            // Set the component value to the question tree outcome label
            name: `data-classification-item-outcome-expr`,
            config: {
              template: `formData.questiontree_1.${QuestionTreeOutcomeInfoKey}.outcome.label`,
              conditionKind: 'jsonpointer',
              condition: `/questiontree_1::field.value.changed`,
              target: `model.value`
            }
          },
        ]
      },
      {
        "name": "data-classification-item-outcome-details",
        "component": {"class": "SimpleInputComponent", "config": {"type": "hidden"}},
        "model": {"class": "SimpleInputModel", "config": {}},
        expressions: [
          {
            // Set the component value to the question tree outcome meta, using only the labels for each property.
            name: `data-classification-item-outcome-details-expr`,
            config: {
              template: `formData.questiontree_1.${QuestionTreeOutcomeInfoKey}.meta[].`,
              conditionKind: 'jsonpointer',
              condition: `/questiontree_1::field.value.changed`,
              target: `model.value`
            }
          },
        ]
      }
    ]
  };

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

  it('should update the data model and component visibility as the answers are changed', async () => {
    const {fixture} = await createFormAndWaitForReady(formConfig);
    const element = fixture.nativeElement as HTMLElement;

    const qtElements = element.querySelectorAll('redbox-questiontreefield');
    expect(qtElements).toHaveSize(1);
    const qtElement = qtElements[0];

    const questionTree = fixture.componentInstance.componentDefArr[0].component as QuestionTreeComponent;

    // initial state
    const inputElementsInitial = qtElement.querySelectorAll('input');
    expect(inputElementsInitial.length).toEqual(2);

    // Check the question_1 options
    const q1RadioElem1 = inputElementsInitial[0] as HTMLInputElement;
    const q1RadioElem2 = inputElementsInitial[1] as HTMLInputElement;
    expect(q1RadioElem1.value).toBe("yes");
    expect(q1RadioElem1.name).toBe("question_1");
    expect(q1RadioElem2.value).toBe("no");
    expect(q1RadioElem2.name).toBe("question_1");

    const modelInitial = questionTree.model?.getValue();
    expect(modelInitial).toEqual({
      question_1: null,
      question_2: null,
      question_3: null,
      [QuestionTreeOutcomeInfoKey]: {outcome: null, meta: []},
    });

    // change state: Select 'no' to show question_2
    q1RadioElem2.checked = true;
    fixture.detectChanges();
    await fixture.whenStable();

    const inputElementsStep1 = qtElement.querySelectorAll('input');
    expect(inputElementsStep1.length).toEqual(4);

    // Check question_2 options
    const q2CheckboxElem1 = inputElementsStep1[2] as HTMLInputElement;
    const q2CheckboxElem2 = inputElementsStep1[3] as HTMLInputElement;
    expect(q2CheckboxElem1.value).toBe("yes");
    expect(q2CheckboxElem1.name).toBe("question_2");
    expect(q2CheckboxElem2.value).toBe("no");
    expect(q2CheckboxElem2.name).toBe("question_2");

    const modelStep1 = questionTree.model?.getValue();
    expect(modelStep1).toEqual({
      question_1: "no",
      question_2: null,
      question_3: null,
      [QuestionTreeOutcomeInfoKey]: {outcome: null, meta: []},
    });

    // change state: Select question_2: 'no' to get an outcome
    q2CheckboxElem2.checked = true;
    fixture.detectChanges();
    await fixture.whenStable();

    const inputElementsStep2 = qtElement.querySelectorAll('input');
    expect(inputElementsStep2.length).toEqual(4);

    // check outcome is set as expected - outcome 'outcome1' and prop2 'prop2Value1'
    // check that the data model is as expected - q1 and q2 have values
    const modelStep2 = questionTree.model?.getValue();
    expect(modelStep2).toEqual({
      question_1: "no",
      question_2: "no",
      question_3: null,
      [QuestionTreeOutcomeInfoKey]: {
        outcome: "outcome1",
        meta: [{outcome: "outcome1", prop2: "prop2Value1"}]
      },
    });

    // Change state: answer to question_1 to hide both question_2 and question_3
    q1RadioElem2.checked = true;
    fixture.detectChanges();
    await fixture.whenStable();

    const inputElementsStep3 = element.querySelectorAll('input');
    expect(inputElementsStep3).toHaveSize(2);

    // check outcome is set as expected - no outcome
    // check that the data model is as expected - only first question has a value
    const modelStep3 = questionTree.model?.getValue();
    expect(modelStep3).toEqual({
      question_1: "no",
      question_2: null,
      question_3: null,
      [QuestionTreeOutcomeInfoKey]: {outcome: null, meta: []},
    });
  });

  it('should load as expected and update fields outside the question tree via expressions', async () => {
    const formConfigWithModelValue: FormConfigFrame = JSON.parse(JSON.stringify(formConfig));
    formConfigWithModelValue.componentDefinitions[0].model!.config!.value = {
      question_1: "no",
      question_2: "no",
      question_3: null,
      [QuestionTreeOutcomeInfoKey]: {
        outcome: "outcome1",
        meta: [{outcome: "outcome1", prop2: "prop2Value1"}]
      },
    };
    formConfigWithModelValue.componentDefinitions[1].model!.config!.value = "@outcomes-value1";
    formConfigWithModelValue.componentDefinitions[2].model!.config!.value = [{
      outcome: "@outcomes-value1",
      prop2: "@outcomes-prop2-value1"
    }];

    const {fixture, formComponent} = await createFormAndWaitForReady(formConfig);
    const element = fixture.nativeElement as HTMLElement;

    const qtElements = element.querySelectorAll('redbox-questiontreefield');
    expect(qtElements).toHaveSize(1);
    const qtElement = qtElements[0];

    const questionTree = fixture.componentInstance.componentDefArr[0].component as QuestionTreeComponent;

    // initial state
    const inputElementsInitial = qtElement.querySelectorAll('input');
    expect(inputElementsInitial.length).toEqual(4);

    const modelInitial = formComponent.form?.value;
    expect(modelInitial).toEqual({
      questiontree_1: {
        question_1: "no",
        question_2: "no",
        question_3: null,
        [QuestionTreeOutcomeInfoKey]: {
          outcome: "outcome1",
          meta: [{outcome: "outcome1", prop2: "prop2Value1"}]
        },
      },
      "data-classification-item-outcome": "@outcomes-value1",
      "data-classification-item-outcome-details": [{outcome: "@outcomes-value1", prop2: "@outcomes-prop2-value1"}],
    });

    // change state: select question_1 'yes'
    const q1RadioElem1 = inputElementsInitial[0] as HTMLInputElement;
    q1RadioElem1.checked = true;
    fixture.detectChanges();
    await fixture.whenStable();

    const inputElementsStep1 = qtElement.querySelectorAll('input');
    expect(inputElementsStep1.length).toEqual(2);

    const modelStep1 = formComponent.form?.value;
    expect(modelStep1).toEqual({
      questiontree_1: {
        question_1: "yes",
        question_2: null,
        question_3: null,
        [QuestionTreeOutcomeInfoKey]: {outcome: null, meta: []},
      },
      "data-classification-item-outcome": "",
      "data-classification-item-outcome-details": [],
    });
  });

  const qtConfig = formConfig.componentDefinitions[0].component.config as QuestionTreeFieldComponentConfigFrame;
  const outcomeInfoCases: {
    config: QuestionTreeFieldComponentConfigFrame,
    data: QuestionTreeModelValueType,
    expected: QuestionTreeOutcomeInfo | null
  }[] = [
    {
      config: {availableOutcomes: [], questions: [], componentDefinitions: []}, data: {}, expected: null,
    },
    {
      config: {
        availableOutcomes: qtConfig.availableOutcomes,
        questions: qtConfig.questions,
        componentDefinitions: qtConfig.componentDefinitions
      },
      data: {}, expected: null,
    },
    {
      config: {
        componentDefinitions: [],
        availableOutcomes: [
          {value: "outcome1", label: "@outcomes-value1"},
          {value: "outcome2", label: "@outcomes-value2"},
        ],
        availableMeta: {
          prop2: {
            prop2Value1: null,
            prop2Value2: "@outcomes-prop2-value2",
          },
        },
        questions: [
          {
            id: "question_1",
            answersMin: 1,
            answersMax: 1,
            answers: [{value: "yes"}, {value: "no", meta: {prop2: "prop2Value2"}, outcome: "outcome2"}],
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
      },
      data: {question_1: "no", question_2: "no"}, expected: {
        outcome: {value:"outcome2", label: "@outcomes-value2"}, meta: [
          {outcome: {value:"outcome2", label: "@outcomes-value2"}, prop2: {value: "prop2Value2", label: "@outcomes-prop2-value2"}},
          {outcome: {value:"outcome1", label: "@outcomes-value1"}, prop2: {value: "prop2Value1", label: null}},
        ]
      },
    }
  ];
  outcomeInfoCases.forEach(({config, data, expected}) => {
    it(`should calculate the expected outcome info ${JSON.stringify(expected)}`, () => {
      let fixture = TestBed.createComponent(QuestionTreeComponent);
      let component = fixture.componentInstance;
      const actual = component.calculateOutcomeInfo(config, data);
      expect(actual).toEqual(expected);
    });
  });
});
