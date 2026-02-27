import {createFormAndWaitForReady, createTestbedModule, setUpDynamicAssets} from "../helpers.spec";
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
import {SimpleInputComponent} from "./simple-input.component";

describe('QuestionTreeComponent', async () => {

  beforeEach(async () => {
    await createTestbedModule({
      declarations: {
        "QuestionTreeComponent": QuestionTreeComponent,
      }
    });
  });

  it('should create component', () => {
    let fixture = TestBed.createComponent(QuestionTreeComponent);
    let component = fixture.componentInstance;
    expect(component).toBeDefined();
  });

  describe("functionality", async () => {
    const waitForQuestionTreeSettle = async () => {
      await new Promise(resolve => setTimeout(resolve, 350));
    };
    // question tree component with 3 questions
    // question_1 is the start,
    // question_2 shows only when question_1 is "no", and has an outcome & meta
    // question_3 shows only when question_2 is "yes
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
                  "expressions": [
                    {
                      "name": "questiontree_1-question_2-layoutvis-qt",
                      "config": {
                        "template": "$count(formData.`questiontree_1`.`question_1`[][$ in [\"no\"]]) > 0",
                        "condition": "/questiontree_1::field.value.changed",
                        "conditionKind": "jsonpointer",
                        "target": "layout.visible",
                        "hasTemplate": true
                      }
                    },
                    {
                      "name": "questiontree_1-question_2-compvis-qt",
                      "config": {
                        "template": "$count(formData.`questiontree_1`.`question_1`[][$ in [\"no\"]]) > 0",
                        "condition": "/questiontree_1::field.value.changed",
                        "conditionKind": "jsonpointer",
                        "target": "component.visible",
                        "hasTemplate": true
                      }
                    },
                    {
                      "name": "questiontree_1-question_2-modval-qt",
                      "config": {
                        "template": "($count(formData.`questiontree_1`.`question_1`[][$ in [\"no\"]]) > 0 ? formData.`questiontree_1`.`question_2` : null)",
                        "condition": "/questiontree_1::field.value.changed",
                        "conditionKind": "jsonpointer",
                        "target": "model.value",
                        "hasTemplate": true
                      }
                    }
                  ],
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
                  "expressions": [
                    {
                      "name": "questiontree_1-question_3-layoutvis-qt",
                      "config": {
                        "template": "$count(formData.`questiontree_1`.`question_2`[][$ in [\"yes\"]]) > 0",
                        "condition": "/questiontree_1::field.value.changed",
                        "conditionKind": "jsonpointer",
                        "target": "layout.visible",
                        "hasTemplate": true
                      }
                    },
                    {
                      "name": "questiontree_1-question_3-compvis-qt",
                      "config": {
                        "template": "$count(formData.`questiontree_1`.`question_2`[][$ in [\"yes\"]]) > 0",
                        "condition": "/questiontree_1::field.value.changed",
                        "conditionKind": "jsonpointer",
                        "target": "component.visible",
                        "hasTemplate": true
                      }
                    },
                    {
                      "name": "questiontree_1-question_3-modval-qt",
                      "config": {
                        "template": "($count(formData.`questiontree_1`.`question_2`[][$ in [\"yes\"]]) > 0 ? formData.`questiontree_1`.`question_3` : null)",
                        "condition": "/questiontree_1::field.value.changed",
                        "conditionKind": "jsonpointer",
                        "target": "model.value",
                        "hasTemplate": true
                      }
                    }
                  ],
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
    beforeEach(async () => {
      await createTestbedModule({
        declarations: {
          "RadioInputComponent": RadioInputComponent,
          "CheckboxInputComponent": CheckboxInputComponent,
          "SimpleInputComponent": SimpleInputComponent,
          "QuestionTreeComponent": QuestionTreeComponent,
        }
      });

    });

    it('should update the data model and component visibility as the answers are changed', async () => {
      setUpDynamicAssets({
        callable: function (keyStr: string, key: (string | number)[], context: any, extra?: any) {
          switch (keyStr) {
            default:
              throw new Error(`Unknown key: ${keyStr}`);
          }
        }
      });

      const {fixture} = await createFormAndWaitForReady(clientFormConfig);
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
        [QuestionTreeOutcomeInfoKey]: null,
      });

      // change state: Select 'no' to show question_2
      q1RadioElem2.click();
      q1RadioElem2.dispatchEvent(new Event("change"));
      fixture.detectChanges();
      await waitForQuestionTreeSettle();
      fixture.detectChanges();
      await fixture.whenStable();

      const inputElementsStep1 = qtElement.querySelectorAll('input');
      expect(inputElementsStep1.length).toEqual(2);

      const modelStep1 = questionTree.model?.getValue();
      expect(modelStep1).toEqual({
        question_1: "no",
        question_2: null,
        question_3: null,
        [QuestionTreeOutcomeInfoKey]: null,
      });

      // Change state: answer to question_1 to ensure model updates remain consistent
      q1RadioElem1.click();
      q1RadioElem1.dispatchEvent(new Event('change'));
      fixture.detectChanges();
      await waitForQuestionTreeSettle();
      fixture.detectChanges();
      await fixture.whenStable();

      const inputElementsStep3 = element.querySelectorAll('input');
      expect(inputElementsStep3.length).toEqual(4);

      // check outcome is set as expected - no outcome
      // check that the data model is as expected - only first question has a value
      const modelStep3 = questionTree.model?.getValue();
      expect(modelStep3).toEqual({
        question_1: "yes",
        question_2: null,
        question_3: null,
        [QuestionTreeOutcomeInfoKey]: null,
      });
    });

    it('should load as expected and update fields outside the question tree via expressions', async () => {
      setUpDynamicAssets({
        callable: function (keyStr: string, key: (string | number)[], context: any, extra?: any) {
          switch (keyStr) {
            default:
              throw new Error(`Unknown key: ${keyStr}`);
          }
        }
      });

      const formConfigWithModelValue: FormConfigFrame = JSON.parse(JSON.stringify(clientFormConfig));
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

      const {fixture, formComponent} = await createFormAndWaitForReady(formConfigWithModelValue);
      await waitForQuestionTreeSettle();
      fixture.detectChanges();
      await fixture.whenStable();
      const element = fixture.nativeElement as HTMLElement;

      const qtElements = element.querySelectorAll('redbox-questiontreefield');
      expect(qtElements).toHaveSize(1);
      const qtElement = qtElements[0];

      // initial state
      const inputElementsInitial = qtElement.querySelectorAll('input');
      expect(inputElementsInitial.length).toEqual(2);

      const modelInitial = formComponent.form?.value;
      expect(modelInitial).toEqual({
        questiontree_1: {
          question_1: "no",
          question_2: "no",
          question_3: null,
          [QuestionTreeOutcomeInfoKey]: {
            outcome: { value: "outcome1", label: "@outcomes-value1" },
            meta: [{
              outcome: { value: "outcome1", label: "@outcomes-value1" },
              prop2: { value: "prop2Value1", label: "@outcomes-prop2-value1" }
            }]
          },
        },
        "data-classification-item-outcome": "@outcomes-value1",
        "data-classification-item-outcome-details": [{outcome: "@outcomes-value1", prop2: "@outcomes-prop2-value1"}],
      });

      // change state: select question_1 'yes'
      const q1RadioElem1 = inputElementsInitial[0] as HTMLInputElement;
      q1RadioElem1.click();
      q1RadioElem1.dispatchEvent(new Event('change'));
      fixture.detectChanges();
      await waitForQuestionTreeSettle();
      fixture.detectChanges();
      await fixture.whenStable();

      const inputElementsStep1 = qtElement.querySelectorAll('input');
      expect(inputElementsStep1.length).toEqual(2);

      const modelStep1 = formComponent.form?.value;
      expect(modelStep1).toEqual({
        questiontree_1: {
          question_1: "yes",
          question_2: "no",
          question_3: null,
          [QuestionTreeOutcomeInfoKey]: {
            outcome: { value: "outcome1", label: "@outcomes-value1" },
            meta: [{
              outcome: { value: "outcome1", label: "@outcomes-value1" },
              prop2: { value: "prop2Value1", label: "@outcomes-prop2-value1" }
            }],
          },
        },
        "data-classification-item-outcome": "@outcomes-value1",
        "data-classification-item-outcome-details": [{outcome: "@outcomes-value1", prop2: "@outcomes-prop2-value1"}],
      });
    });

    it('should render a provided question label value directly', async () => {
      setUpDynamicAssets({
        callable: function (keyStr: string, key: (string | number)[], context: any, extra?: any) {
          switch (keyStr) {
            default:
              throw new Error(`Unknown key: ${keyStr}`);
          }
        }
      });

      const formConfigWithDirectQuestionLabel: FormConfigFrame = JSON.parse(JSON.stringify(clientFormConfig));
      const questionDefs = ((formConfigWithDirectQuestionLabel.componentDefinitions?.[0]?.component?.config as QuestionTreeFieldComponentConfigFrame)?.componentDefinitions ?? []);
      if (!questionDefs[0]?.layout?.config) {
        fail('Question tree test config missing expected first question layout config');
      }
      questionDefs[0]!.layout!.config!.label = "Direct Question Label";

      const {fixture} = await createFormAndWaitForReady(formConfigWithDirectQuestionLabel);
      await waitForQuestionTreeSettle();
      fixture.detectChanges();
      await fixture.whenStable();
      expect(questionDefs[0]?.layout?.config?.label).toBe('Direct Question Label');
    });

    const qtConfig = clientFormConfig.componentDefinitions[0].component.config as QuestionTreeFieldComponentConfigFrame;
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
          questions: qtConfig.questions,
          componentDefinitions: qtConfig.componentDefinitions
        },
        data: {question_1: ['no'], question_2: ["no"]},
        expected: {
          outcome: {value: "outcome1", label: "@outcomes-value1"},
          meta: [{outcome: {value: "outcome1", label: "@outcomes-value1"}, prop2: {value: "prop2Value1", label: null}}]
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

});
