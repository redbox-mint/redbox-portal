import {createFormAndWaitForReady, createTestbedModule, DynamicAssetOptions} from "../helpers.spec";
import {TestBed} from "@angular/core/testing";
import {RadioInputComponent} from "./radio-input.component";
import {QuestionTreeComponent} from "./question-tree.component";
import {CheckboxInputComponent} from "./checkbox-input.component";
import {
  FormConfigFrame, isTypeFieldDefinitionName, QuestionTreeComponentName,
  QuestionTreeFieldComponentConfigFrame, QuestionTreeFieldComponentDefinitionFrame,
  QuestionTreeModelValueType,
  QuestionTreeOutcomeInfo,
  QuestionTreeOutcomeInfoKey
} from "@researchdatabox/sails-ng-common";
import {SimpleInputComponent} from "./simple-input.component";
import * as sinon from "sinon";
import { merge as _merge } from 'lodash-es';

describe('QuestionTreeComponent', async () => {
  // Form config, expression data, helper functions.

  /*
   * question tree component with 3 questions
   * question_1 is the start,
   * question_2 shows only when question_1 is "no", and has an outcome & meta
   * question_3 shows only when question_2 is "yes
   */
  const clientFormConfig: FormConfigFrame = {
    name: 'testing',
    debugValue: false,
    domElementType: 'form',
    defaultComponentConfig: {
      defaultComponentCssClasses: 'row',
    },
    editCssClasses: "redbox-form form",
    componentDefinitions: [
      {
        "name": "questiontree_1",
        "component": {
          "class": "QuestionTreeComponent",
          "config": {
            "readonly": false,
            "visible": true,
            "editMode": true,
            "disabled": false,
            "autofocus": false,
            "availableOutcomes": [
              {
                "value": "outcome1",
                "label": "@outcomes-value1"
              },
              {
                "value": "outcome2",
                "label": "@outcomes-value2"
              }
            ],
            "availableMeta": {
              "prop2": {
                "prop2Value1": "@outcomes-prop2-value1",
                "prop2Value2": "@outcomes-prop2-value2"
              }
            },
            "questions": [
              {
                "id": "question_1",
                "answersMin": 1,
                "answersMax": 1,
                "answers": [
                  {
                    "value": "yes"
                  },
                  {
                    "value": "no"
                  }
                ],
                "rules": {
                  "op": "true"
                }
              },
              {
                "id": "question_2",
                "answersMin": 1,
                "answersMax": 2,
                "answers": [
                  {
                    "value": "yes"
                  },
                  {
                    "value": "no",
                    "meta": {
                      "prop2": "prop2Value1"
                    },
                    "outcome": "outcome1"
                  }
                ],
                "rules": {
                  "op": "in",
                  "q": "question_1",
                  "a": [
                    "no"
                  ]
                }
              },
              {
                "id": "question_3",
                "answersMin": 1,
                "answersMax": 1,
                "answers": [
                  {
                    "value": "yes"
                  },
                  {
                    "value": "no"
                  }
                ],
                "rules": {
                  "op": "in",
                  "q": "question_2",
                  "a": [
                    "yes"
                  ]
                }
              }
            ],
            "componentDefinitions": [
              {
                "name": "question_1",
                "component": {
                  "class": "RadioInputComponent",
                  "config": {
                    "readonly": false,
                    "visible": true,
                    "editMode": true,
                    "disabled": false,
                    "autofocus": false,
                    "options": [
                      {
                        "value": "yes",
                        "label": "@questiontree_1-question_1-yes"
                      },
                      {
                        "value": "no",
                        "label": "@questiontree_1-question_1-no"
                      }
                    ]
                  }
                },
                "model": {
                  "class": "RadioInputModel",
                  "config": {}
                },
                "layout": {
                  "class": "DefaultLayout",
                  "config": {
                    "readonly": false,
                    "visible": true,
                    "editMode": true,
                    "label": "question_1",
                    "disabled": false,
                    "autofocus": false,
                    "labelRequiredStr": "*",
                    "cssClassesMap": {},
                    "helpTextVisibleOnInit": false,
                    "helpTextVisible": false
                  }
                }
              },
              {
                "name": "question_2",
                "component": {
                  "class": "CheckboxInputComponent",
                  "config": {
                    "readonly": false,
                    "visible": false,
                    "editMode": true,
                    "disabled": false,
                    "autofocus": false,
                    "options": [
                      {
                        "value": "yes",
                        "label": "@questiontree_1-question_2-yes"
                      },
                      {
                        "value": "no",
                        "label": "@questiontree_1-question_2-no"
                      }
                    ]
                  }
                },
                "model": {
                  "class": "CheckboxInputModel",
                  "config": {}
                },
                "layout": {
                  "class": "DefaultLayout",
                  "config": {
                    "readonly": false,
                    "visible": false,
                    "editMode": true,
                    "label": "question_2",
                    "disabled": false,
                    "autofocus": false,
                    "labelRequiredStr": "*",
                    "cssClassesMap": {},
                    "helpTextVisibleOnInit": false,
                    "helpTextVisible": false
                  }
                }
              },
              {
                "name": "question_3",
                "component": {
                  "class": "RadioInputComponent",
                  "config": {
                    "readonly": false,
                    "visible": false,
                    "editMode": true,
                    "disabled": false,
                    "autofocus": false,
                    "options": [
                      {
                        "value": "yes",
                        "label": "@questiontree_1-question_3-yes"
                      },
                      {
                        "value": "no",
                        "label": "@questiontree_1-question_3-no"
                      }
                    ]
                  }
                },
                "model": {
                  "class": "RadioInputModel",
                  "config": {}
                },
                "layout": {
                  "class": "DefaultLayout",
                  "config": {
                    "readonly": false,
                    "visible": false,
                    "editMode": true,
                    "label": "question_3",
                    "disabled": false,
                    "autofocus": false,
                    "labelRequiredStr": "*",
                    "cssClassesMap": {},
                    "helpTextVisibleOnInit": false,
                    "helpTextVisible": false
                  }
                }
              },
              {
                "name": "questiontree-outcome-info",
                "component": {
                  "class": "SimpleInputComponent",
                  "config": {
                    "readonly": false,
                    "visible": false,
                    "editMode": true,
                    "disabled": false,
                    "autofocus": false,
                    "type": "hidden"
                  }
                },
                "model": {
                  "class": "SimpleInputModel",
                  "config": {}
                },
                "layout": {
                  "class": "DefaultLayout",
                  "config": {
                    "readonly": false,
                    "visible": false,
                    "editMode": true,
                    "disabled": false,
                    "autofocus": false,
                    "labelRequiredStr": "*",
                    "cssClassesMap": {},
                    "helpTextVisibleOnInit": false,
                    "helpTextVisible": false
                  }
                }
              }
            ]
          }
        },
        "model": {
          "class": "QuestionTreeModel",
          "config": {}
        }
      },
      {
        "name": "data-classification-item-outcome",
        "expressions": [
          {
            "name": "data-classification-item-outcome-expr",
            "config": {
              "template": "formData.questiontree_1.questiontree-outcome-info.outcome.($.label ? $.label : $.value)",
              "condition": "/questiontree_1::field.value.changed",
              "conditionKind": "jsonpointer",
              "target": "model.value",
              "hasTemplate": true
            }
          }
        ],
        "component": {
          "class": "SimpleInputComponent",
          "config": {
            "readonly": false,
            "visible": true,
            "editMode": true,
            "disabled": false,
            "autofocus": false,
            "type": "text"
          }
        },
        "model": {
          "class": "SimpleInputModel",
          "config": {
            "validators": [
              {
                "class": "required"
              }
            ]
          }
        }
      },
      {
        "name": "data-classification-item-outcome-details",
        "expressions": [
          {
            "name": "data-classification-item-outcome-details-expr",
            "config": {
              "template": "$map(formData.questiontree_1.`questiontree-outcome-info`.meta[], function ($v, $i, $a) {\n                    $v.$merge($keys().($entry := $lookup($v, $);{\n                    $: $entry.label ? $entry.label : $entry.value'\n                }))\n                })",
              "condition": "/questiontree_1::field.value.changed",
              "conditionKind": "jsonpointer",
              "target": "model.value",
              "hasTemplate": true
            }
          }
        ],
        "component": {
          "class": "SimpleInputComponent",
          "config": {
            "readonly": false,
            "visible": true,
            "editMode": true,
            "disabled": false,
            "autofocus": false,
            "type": "hidden"
          }
        },
        "model": {
          "class": "SimpleInputModel",
          "config": {}
        }
      }
    ],
  };
  type ClientFormValue = {
    questiontree_1: {
      question_1: null | "yes" | "no" | ["yes"] | ["no"],
      question_2: null | "yes" | "no" | ["yes"] | ["no"] | ["yes", "no"] | ["no" | "yes"],
      question_3: null | "yes" | "no" | ["yes"] | ["no"],
      [QuestionTreeOutcomeInfoKey]: QuestionTreeOutcomeInfo | null,
    },
    "data-classification-item-outcome": string | null,
    "data-classification-item-outcome-details": Record<string, string>[] | null,
  };
  const expressionsResults: Record<string, (keyStr: string, key: (string | number)[], context: any, extra?: any) => void> = {
    // data-classification-item-outcome
    "componentDefinitions__1__expressions__0__config__template":
      (keyStr: string, key: (string | number)[], context: any, extra?: any) => {
        // formData.questiontree_1.questiontree-outcome-info.outcome.($.label ? $.label : $.value)
        const qtVal: ClientFormValue = context?.formData;
        const val = qtVal?.questiontree_1?.['questiontree-outcome-info']?.outcome;
        return val?.label ?? val?.value ?? null;
      },
    // data-classification-item-outcome-details
    "componentDefinitions__2__expressions__0__config__template":
      (keyStr: string, key: (string | number)[], context: any, extra?: any) => {
        // $map(formData.questiontree_1.`questiontree-outcome-info`.meta[], function ($v, $i, $a) {
        //                     $v.$merge($keys().($entry := $lookup($v, $);{
        //                     $: $entry.label ? $entry.label : $entry.value'
        //                 }))
        //                 })
        // from:
        // meta: [{
        //  outcome: {value: "outcome1", label: "@outcomes-value1"},
        //  prop2: {value: "prop2Value2", label: "@outcomes-prop2-value2"}
        // }]
        // to:
        // "rdmp-data-classification-item-outcome": "@outcomes-value1",
        // "rdmp-data-classification-item-outcome-details": [
        //  {"outcome": "@outcomes-value1", "prop2": "@outcomes-prop2-value2"},
        // ]
        const qtVal: ClientFormValue = context?.formData;
        const val = qtVal?.questiontree_1?.['questiontree-outcome-info']?.meta;
        return val?.map(i =>
          Object.fromEntries(Object.keys(i).map(k => [k, i[k]?.label ?? i[k]?.value]))
        ) ?? null;
      },
  };
  const toggleRadioButton = function (el: HTMLInputElement) {
    el.checked = true;
    el.dispatchEvent(new Event("change"));
    expect(el.checked).toBe(true);
  }
  const advanceTime = async function (fixture: any, ms?: number) {
    if (ms === undefined) {
      await clock.runAllAsync();
    } else {
      await clock.tickAsync(ms);
    }
    fixture.detectChanges();
    fixture.whenStable();
  }
  const setInitialFormConfig = async function (formConfig: FormConfigFrame, overrides: Record<string, unknown>) {
    _merge(formConfig, overrides);
  }

  let clock: sinon.SinonFakeTimers;
  beforeEach(async () => {
    // Use sinonjs fake time with auto advance as workaround for https://github.com/angular/angular/issues/44351
    // This works because rxjs debounceTime checks Date.now, but jasmine does not mock it in a way that works with the tests.
    // Sinon js mocks Date.now in a way that works with the tests.
    // See also https://ncjamieson.com/testing-with-fake-time/
    clock = sinon.useFakeTimers({shouldAdvanceTime: true});
    await createTestbedModule({
      declarations: {
        "RadioInputComponent": RadioInputComponent,
        "CheckboxInputComponent": CheckboxInputComponent,
        "SimpleInputComponent": SimpleInputComponent,
        "QuestionTreeComponent": QuestionTreeComponent,
      }
    });
  });

  afterEach(() => {
    clock.restore();
  });

  it('should create component', async () => {
    let fixture = TestBed.createComponent(QuestionTreeComponent);
    let component = fixture.componentInstance;
    await advanceTime(fixture);
    expect(component).toBeDefined();
  });


  it('should update the data model and component visibility as the answers are changed', async () => {
    const dynamicAssetOptions: DynamicAssetOptions = {
      entries: [{
        urlKeyStart: "http://localhost/default/rdmp/dynamicAsset/formCompiledItems/rdmp",
        callable: function (keyStr: string, key: (string | number)[], context: any, extra?: any) {
          if (keyStr in expressionsResults) {
            return expressionsResults[keyStr](keyStr, key, context, extra);
          }
          throw new Error(`Unknown key: ${keyStr}`);
        }
      }]
    };


    const {fixture} = await createFormAndWaitForReady(clientFormConfig, undefined, undefined, dynamicAssetOptions);

    await advanceTime(fixture);

    const element = fixture.nativeElement as HTMLElement;

    const qtElements = element.querySelectorAll('redbox-questiontreefield');
    expect(qtElements).toHaveSize(1);
    const qtElement = qtElements[0];

    const questionTree = fixture.componentInstance.componentDefArr[0].component as QuestionTreeComponent;

    // initial state
    const inputElementsInitial = qtElement.querySelectorAll('input');
    expect(inputElementsInitial.length).toEqual(2);

    // Check the question_1 options
    const q1RadioElem1 = inputElementsInitial[0];
    const q1RadioElem2 = inputElementsInitial[1];
    expect(q1RadioElem1.value).toBe("yes");
    expect(q1RadioElem1.name).toBe("question_1");
    expect(q1RadioElem2.value).toBe("no");
    expect(q1RadioElem2.name).toBe("question_1");

    const modelInitial = questionTree.model?.getValue();
    const modelInitialExpected: QuestionTreeModelValueType = {
      question_1: null,
      question_2: null,
      question_3: null,
      [QuestionTreeOutcomeInfoKey]: null,
    };
    expect(modelInitial).toEqual(modelInitialExpected);

    // change state: Select 'no' to show question_2
    toggleRadioButton(q1RadioElem2);

    await advanceTime(fixture);

    const q1RadioElem2Component = questionTree.formFieldCompMapEntries
      .find(i => i.compConfigJson.name === "question_1");
    expect(q1RadioElem2Component?.component?.componentDefinition?.config?.visible).toEqual(true);
    expect(q1RadioElem2Component?.component?.isVisible).toEqual(true);

    const inputElementsStep1 = qtElement.querySelectorAll('input');
    expect(inputElementsStep1.length).toEqual(4);

    // Check question_2 options
    const q2CheckboxElem1 = inputElementsStep1[2];
    const q2CheckboxElem2 = inputElementsStep1[3];
    expect(q2CheckboxElem1.value).toBe("yes");
    expect(q2CheckboxElem1.name).toBe("question_2");
    expect(q2CheckboxElem2.value).toBe("no");
    expect(q2CheckboxElem2.name).toBe("question_2");

    const modelStep1 = questionTree.model?.getValue();
    const modelStep1Expected: QuestionTreeModelValueType = {
      question_1: "no",
      question_2: null,
      question_3: null,
      [QuestionTreeOutcomeInfoKey]: null,
    };
    expect(modelStep1).toEqual(modelStep1Expected);

    // change state: Select question_2: 'no' to get an outcome
    toggleRadioButton(q2CheckboxElem2);

    await advanceTime(fixture);

    expect(q2CheckboxElem2.checked).toBe(true);

    const inputElementsStep2 = qtElement.querySelectorAll('input');
    expect(inputElementsStep2.length).toEqual(4);


    // check outcome is set as expected - outcome 'outcome1' and prop2 'prop2Value1'
    // check that the data model is as expected - q1 and q2 have values
    const modelStep2 = questionTree.model?.getValue();
    const modelStep2Expected: QuestionTreeModelValueType = {
      question_1: "no",
      question_2: ["no"],
      question_3: null,
      [QuestionTreeOutcomeInfoKey]: {
        outcome: {value: "outcome1", label: "@outcomes-value1"},
        meta: [{
          outcome: {value: "outcome1", label: "@outcomes-value1"},
          prop2: {value: "prop2Value1", label: "@outcomes-prop2-value1"}
        }]
      },
    }
    expect(modelStep2).toEqual(modelStep2Expected);

    // Change state: answer 'yes' to question_1 to hide both question_2 and question_3
    toggleRadioButton(q1RadioElem1);

    await advanceTime(fixture);

    const inputElementsStep3 = qtElement.querySelectorAll('input');
    expect(inputElementsStep3).toHaveSize(2);

    // check outcome is set as expected - no outcome
    // check that the data model is as expected - only first question has a value
    const modelStep3 = questionTree.model?.getValue();
    const modelStep3Expected: QuestionTreeModelValueType = {
      question_1: "yes",
      question_2: null,
      question_3: null,
      [QuestionTreeOutcomeInfoKey]: null,
    };
    expect(modelStep3).toEqual(modelStep3Expected);
  });

  it('should load a record and update fields outside the question tree via expressions', async () => {
    const formConfigWithModelValue: FormConfigFrame = structuredClone(clientFormConfig);
    await setInitialFormConfig(formConfigWithModelValue, {
      componentDefinitions: [
        {
          model: {
            config: {
              value: {
                question_1: "no",
                question_2: "no",
                question_3: null,
                [QuestionTreeOutcomeInfoKey]: {
                  outcome: {value: "outcome1", label: "@outcomes-value1"},
                  meta: [{
                    outcome: {value: "outcome1", label: "@outcomes-value1"},
                    prop2: {value: "prop2Value1", label: "@outcomes-prop2-value1"}
                  }],
                },
              }
            },
          },
          component: {
            config: {
              componentDefinitions: [
                undefined,
                {component: {config: {visible: true}}, layout: {config: {visible: true}}},
              ]
            }
          }
        },
        {
          model: {config: {value: "@outcomes-value1"}},
        },
        {
          model: {
            config: {
              value: [{
                outcome: "@outcomes-value1",
                prop2: "@outcomes-prop2-value1"
              }]
            }
          },
        },
      ]
    });
    const dynamicAssetOptions: DynamicAssetOptions = {
      entries: [{
        urlKeyStart: "http://localhost/default/rdmp/dynamicAsset/formCompiledItems/rdmp",
        callable: function (keyStr: string, key: (string | number)[], context: any, extra?: any) {
          if (keyStr in expressionsResults) {
            return expressionsResults[keyStr](keyStr, key, context, extra);
          }
          throw new Error(`Unknown key: ${keyStr}`);
        }
      }]
    };

    const {
      fixture,
      formComponent
    } = await createFormAndWaitForReady(formConfigWithModelValue, undefined, undefined, dynamicAssetOptions);

    await advanceTime(fixture);

    const element = fixture.nativeElement as HTMLElement;

    const qtElements = element.querySelectorAll('redbox-questiontreefield');
    expect(qtElements).toHaveSize(1);
    const qtElement = qtElements[0];

    // initial state
    const inputElementsInitial = qtElement.querySelectorAll('input');
    expect(inputElementsInitial.length).toEqual(4);

    const modelInitial = formComponent.form?.value;
    const modelInitialExpected: ClientFormValue = {
      questiontree_1: {
        question_1: "no",
        question_2: "no",
        question_3: null,
        [QuestionTreeOutcomeInfoKey]: {
          outcome: {value: "outcome1", label: "@outcomes-value1"},
          meta: [{
            outcome: {value: "outcome1", label: "@outcomes-value1"},
            prop2: {value: "prop2Value1", label: "@outcomes-prop2-value1"}
          }],
        },
      },
      "data-classification-item-outcome": "@outcomes-value1",
      "data-classification-item-outcome-details": [{outcome: "@outcomes-value1", prop2: "@outcomes-prop2-value1"}],
    };
    expect(modelInitial).toEqual(modelInitialExpected);

    // change state: select question_1 'yes'
    const q1RadioElem1 = inputElementsInitial[0];
    toggleRadioButton(q1RadioElem1);

    await advanceTime(fixture);

    const inputElementsStep1 = qtElement.querySelectorAll('input');
    expect(inputElementsStep1.length).toEqual(2);

    await advanceTime(fixture);

    const modelStep1 = formComponent.form?.value;
    const modelStep1Expected: ClientFormValue = {
      questiontree_1: {
        question_1: "yes",
        question_2: null,
        question_3: null,
        [QuestionTreeOutcomeInfoKey]: null,
      },
      "data-classification-item-outcome": null,
      "data-classification-item-outcome-details": null,
    }
    expect(modelStep1).toEqual(modelStep1Expected);
  });

  it('should render a provided question label value directly', async () => {
    const dynamicAssetOptions: DynamicAssetOptions = {
      entries: [{
        urlKeyStart: "http://localhost/default/rdmp/dynamicAsset/formCompiledItems/rdmp",
        callable: function (keyStr: string, key: (string | number)[], context: any, extra?: any) {
          if (keyStr in expressionsResults) {
            return expressionsResults[keyStr](keyStr, key, context, extra);
          }
          throw new Error(`Unknown key: ${keyStr}`);
        }
      }]
    };

    const formConfigWithDirectQuestionLabel: FormConfigFrame = structuredClone(clientFormConfig);
    const expectedValue = "Direct Question Label";
    await setInitialFormConfig(formConfigWithDirectQuestionLabel, {
      componentDefinitions: [{component: {config: {componentDefinitions: [{layout: {config: {label: expectedValue}}}]}}}]
    });
    const qtComponentConfig = formConfigWithDirectQuestionLabel.componentDefinitions?.[0]?.component?.config as QuestionTreeFieldComponentConfigFrame;
    const questionDefs = qtComponentConfig?.componentDefinitions ?? [];
    if (!questionDefs[0]?.layout?.config) {
      fail('Question tree test config missing expected first question layout config');
    }

    // ensure the angular form has the expected label
    expect(questionDefs[0]?.layout?.config?.label).toBe(expectedValue);

    const {fixture} = await createFormAndWaitForReady(formConfigWithDirectQuestionLabel, undefined, undefined, dynamicAssetOptions);

    await advanceTime(fixture);


    const element = fixture.nativeElement as HTMLElement;

    const qtElements = element.querySelectorAll('redbox-questiontreefield');
    expect(qtElements).toHaveSize(1);
    const qtElement = qtElements[0];
    expect(qtElement).toBeTruthy();

    const questionTree = fixture.componentInstance.componentDefArr[0].component as QuestionTreeComponent;
    expect(questionTree.formFieldCompMapEntries[0].layout?.label).toEqual(expectedValue);
    expect(questionTree.formFieldCompMapEntries[0].layout?.getStringProperty('label')).toEqual(expectedValue);
    expect(questionTree.formFieldCompMapEntries[0].layout?.isVisible).toBeTrue();

    const fieldLabels = qtElement.querySelectorAll('label.rb-form-field-label');
    expect(fieldLabels).toHaveSize(1);
    const firstLabel = fieldLabels[0];
    expect(firstLabel).toBeTruthy();

    expect(firstLabel?.textContent?.trim()).toEqual(expectedValue);
    expect(firstLabel?.textContent?.trim()).toContain(expectedValue);
  });

  describe("outcome info checks", async () => {
    const qtComp = clientFormConfig.componentDefinitions[0].component;
    if (!isTypeFieldDefinitionName<QuestionTreeFieldComponentDefinitionFrame>(qtComp, QuestionTreeComponentName)) {
      throw new Error(`Expected QuestionTreeFieldComponentDefinitionFrame but got ${qtComp}`);
    }
    const qtConfig = qtComp.config;
    if (!qtConfig) {
      throw new Error(`Expected QuestionTreeFieldComponentConfigFrame but got ${qtConfig}`);
    }

    const outcomeInfoCases: {
      config: QuestionTreeFieldComponentConfigFrame,
      data: QuestionTreeModelValueType,
      expected: QuestionTreeOutcomeInfo | null
    }[] = [
      {
        config: {availableOutcomes: [], questions: [], componentDefinitions: []},
        data: {}, expected: null,
      },
      {
        config: {
          availableOutcomes: qtConfig.availableOutcomes,
          availableMeta: qtConfig.availableMeta,
          questions: qtConfig.questions,
          componentDefinitions: qtConfig.componentDefinitions
        },
        data: {question_1: ['no'], question_2: ["no"]}, expected: {
          outcome: {value: 'outcome1', label: '@outcomes-value1'},
          meta: [{
            outcome: {value: 'outcome1', label: '@outcomes-value1'},
            prop2: {value: 'prop2Value1', label: "@outcomes-prop2-value1"}
          }]
        },
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
        data: {question_1: "no", question_2: "no"},
        expected: {
          outcome: {value: "outcome2", label: "@outcomes-value2"}, meta: [
            {
              outcome: {value: "outcome2", label: "@outcomes-value2"},
              prop2: {value: "prop2Value2", label: "@outcomes-prop2-value2"}
            },
            {outcome: {value: "outcome1", label: "@outcomes-value1"}, prop2: {value: "prop2Value1", label: null}},
          ]
        },
      }
    ];
    for (const {config, data, expected} of outcomeInfoCases) {
      it(`should calculate the expected outcome info ${JSON.stringify(expected)}`, () => {
        let fixture = TestBed.createComponent(QuestionTreeComponent);
        let component = fixture.componentInstance;
        const actual = component.calculateOutcomeInfo(config, data);
        expect(actual).toEqual(expected);
      });
    }
  });


  it("should show only first question on new form load", async () => {
    const dynamicAssetOptions: DynamicAssetOptions = {
      entries: [{
        urlKeyStart: "http://localhost/default/rdmp/dynamicAsset/formCompiledItems/rdmp",
        callable: function (keyStr: string, key: (string | number)[], context: any, extra?: any) {
          if (keyStr in expressionsResults) {
            return expressionsResults[keyStr](keyStr, key, context, extra);
          }
          throw new Error(`Unknown key: ${keyStr}`);
        }
      }]
    };

    const {fixture} = await createFormAndWaitForReady(clientFormConfig, undefined, undefined, dynamicAssetOptions);

    await advanceTime(fixture);

    const element = fixture.nativeElement as HTMLElement;

    // check there is 1 question tree field
    const qtElements = element.querySelectorAll('redbox-questiontreefield');
    expect(qtElements).toHaveSize(1);

    // the initial state is two radio buttons as answers to the 1 question
    const qtElement = qtElements[0];
    const questionTree = fixture.componentInstance.componentDefArr[0].component as QuestionTreeComponent;
    const inputElementsInitial = qtElement.querySelectorAll('input');
    expect(inputElementsInitial.length).toEqual(2);

    // Check the question_1 options
    const q1RadioElem1 = inputElementsInitial[0];
    const q1RadioElem2 = inputElementsInitial[1];
    expect(q1RadioElem1.value).toBe("yes");
    expect(q1RadioElem1.name).toBe("question_1");
    expect(q1RadioElem2.value).toBe("no");
    expect(q1RadioElem2.name).toBe("question_1");

    // Check the question tree model
    const modelInitial = questionTree.model?.getValue();
    const modelInitialExpected: QuestionTreeModelValueType = {
      question_1: null,
      question_2: null,
      question_3: null,
      [QuestionTreeOutcomeInfoKey]: null,
    };
    expect(modelInitial).toEqual(modelInitialExpected);
  });

  it("should show existing answers on existing record load", async () => {
    const dynamicAssetOptions: DynamicAssetOptions = {
      entries: [{
        urlKeyStart: "http://localhost/default/rdmp/dynamicAsset/formCompiledItems/rdmp",
        callable: function (keyStr: string, key: (string | number)[], context: any, extra?: any) {
          if (keyStr in expressionsResults) {
            return expressionsResults[keyStr](keyStr, key, context, extra);
          }
          throw new Error(`Unknown key: ${keyStr}`);
        }
      }]
    };
    const formConfigWithModelValue: FormConfigFrame = structuredClone(clientFormConfig);
    await setInitialFormConfig(formConfigWithModelValue, {
      componentDefinitions: [
        {
          model: {
            config: {
              value: {
                question_1: "no",
                question_2: "no",
                question_3: null,
                [QuestionTreeOutcomeInfoKey]: {
                  outcome: {value: "outcome1", label: "@outcomes-value1"},
                  meta: [{
                    outcome: {value: "outcome1", label: "@outcomes-value1"},
                    prop2: {value: "prop2Value1", label: "@outcomes-prop2-value1"}
                  }],
                },
              }
            },
          },
          component: {
            config: {
              componentDefinitions: [
                undefined,
                {component: {config: {visible: true}}, layout: {config: {visible: true}}},
              ]
            }
          }
        },
        {
          model: {config: {value: "@outcomes-value1"}},
        },
        {
          model: {
            config: {
              value: [{
                outcome: "@outcomes-value1",
                prop2: "@outcomes-prop2-value1"
              }]
            }
          },
        },
      ]
    });

    const {
      fixture,
      formComponent
    } = await createFormAndWaitForReady(formConfigWithModelValue, undefined, undefined, dynamicAssetOptions);

    await advanceTime(fixture);

    const element = fixture.nativeElement as HTMLElement;

    // check there is 1 question tree field
    const qtElements = element.querySelectorAll('redbox-questiontreefield');
    expect(qtElements).toHaveSize(1);

    // the initial state is two radio buttons as answers to the 1 question
    const qtElement = qtElements[0];
    const inputElementsInitial = qtElement.querySelectorAll('input');
    expect(inputElementsInitial.length).toEqual(4);

    // Check the question_1 options
    const q1RadioElem1 = inputElementsInitial[0];
    const q1RadioElem2 = inputElementsInitial[1];
    expect(q1RadioElem1.value).toBe("yes");
    expect(q1RadioElem1.name).toBe("question_1");
    expect(q1RadioElem2.value).toBe("no");
    expect(q1RadioElem2.name).toBe("question_1");

    // Check the question_2 options
    const q2RadioElem1 = inputElementsInitial[2];
    const q2RadioElem2 = inputElementsInitial[3];
    expect(q2RadioElem1.value).toBe("yes");
    expect(q2RadioElem1.name).toBe("question_2");
    expect(q2RadioElem2.value).toBe("no");
    expect(q2RadioElem2.name).toBe("question_2");

    // Check the form model
    const modelInitial = formComponent.form?.value;
    const modelInitialExpected: ClientFormValue = {
      questiontree_1: {
        question_1: "no",
        question_2: "no",
        question_3: null,
        [QuestionTreeOutcomeInfoKey]: {
          outcome: {value: "outcome1", label: "@outcomes-value1"},
          meta: [{
            outcome: {value: "outcome1", label: "@outcomes-value1"},
            prop2: {value: "prop2Value1", label: "@outcomes-prop2-value1"}
          }],
        },
      },
      "data-classification-item-outcome": "@outcomes-value1",
      "data-classification-item-outcome-details": [{outcome: "@outcomes-value1", prop2: "@outcomes-prop2-value1"}],
    };
    expect(modelInitial).toEqual(modelInitialExpected);
  });

  it("should hide and reset all questions below a question that has been changed", async () => {
    const formConfigWithModelValue: FormConfigFrame = structuredClone(clientFormConfig);
    await setInitialFormConfig(formConfigWithModelValue, {
      componentDefinitions: [
        {
          model: {
            config: {
              value: {
                question_1: "no",
                question_2: "yes",
                question_3: "no",
                [QuestionTreeOutcomeInfoKey]: null
              }
            },
          },
          component: {
            config: {
              componentDefinitions: [
                undefined,
                {component: {config: {visible: true}}, layout: {config: {visible: true}}},
                {component: {config: {visible: true}}, layout: {config: {visible: true}}},
              ]
            }
          }
        },
      ]
    });
    const dynamicAssetOptions: DynamicAssetOptions = {
      entries: [{
        urlKeyStart: "http://localhost/default/rdmp/dynamicAsset/formCompiledItems/rdmp",
        callable: function (keyStr: string, key: (string | number)[], context: any, extra?: any) {
          if (keyStr in expressionsResults) {
            return expressionsResults[keyStr](keyStr, key, context, extra);
          }
          throw new Error(`Unknown key: ${keyStr}`);
        }
      }]
    };

    const {
      fixture,
      formComponent
    } = await createFormAndWaitForReady(formConfigWithModelValue, undefined, undefined, dynamicAssetOptions);

    await advanceTime(fixture, 1000);

    const element = fixture.nativeElement as HTMLElement;

    const qtElements = element.querySelectorAll('redbox-questiontreefield');
    expect(qtElements).toHaveSize(1);
    const qtElement = qtElements[0];

    // initial state
    const inputElementsInitial = qtElement.querySelectorAll('input');
    expect(inputElementsInitial.length).toEqual(6);

    const modelInitial = formComponent.form?.value;
    const modelInitialExpected: ClientFormValue = {
      questiontree_1: {
        question_1: "no",
        question_2: "yes",
        question_3: "no",
        [QuestionTreeOutcomeInfoKey]: null
      },
      "data-classification-item-outcome": null,
      "data-classification-item-outcome-details": null,
    };
    expect(modelInitial).toEqual(modelInitialExpected);

    // change state: select question_1 'yes'
    const q1RadioElem1 = inputElementsInitial[0];
    toggleRadioButton(q1RadioElem1);

    await advanceTime(fixture, 1000);

    const inputElementsStep1 = qtElement.querySelectorAll('input');
    expect(inputElementsStep1.length).toEqual(2);

    const modelStep1 = formComponent.form?.value;
    const modelStep1Expected: ClientFormValue = {
      questiontree_1: {
        question_1: "yes",
        question_2: null,
        question_3: null,
        [QuestionTreeOutcomeInfoKey]: null,
      },
      "data-classification-item-outcome": null,
      "data-classification-item-outcome-details": null,
    }
    expect(modelStep1).toEqual(modelStep1Expected);
  });

});
