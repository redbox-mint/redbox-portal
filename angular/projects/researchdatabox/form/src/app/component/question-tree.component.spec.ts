import {createFormAndWaitForReady, createTestbedModule, setUpDynamicAssets} from "../helpers.spec";
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
import {FormComponentEventBus, FormComponentEventType} from "../form-state";
import {filter} from "rxjs";

describe('QuestionTreeComponent', async () => {

  describe("basic functionality", async () => {
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
  });


  describe("complex functionality", async () => {
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
    const expressionsResultsDefaultFunc = (keyStr: string, key: (string | number)[], context: any, extra?: any) => {
      // keyStr "componentDefinitions__0__component__config__componentDefinitions__2__expressions__2__config__template"
      // key ["componentDefinitions",0,"component","config","componentDefinitions",2,"expressions",2,"config","template"]
      // context {
      //  "value": {...},
      //  "event":{"type":"field.value.changed","fieldId":"/questiontree_1","value": {...}, "previousValue": {...},
      //    "sourceId":"/questiontree_1","timestamp":1774915082974},
      //  "formData": {...},
      //  "runtimeContext":{"requestParams":{}},
      //  "requestParams":{},
      // }
      // extra {"libraries":{}}
      throw new Error(`keyStr ${JSON.stringify(keyStr)} key ${JSON.stringify(key)} context ${JSON.stringify(context)} extra ${JSON.stringify(extra)}`);
    }
    const isNo = ((i: string[]): i is ["no"] => i.length === 1 && i[0] === "no");
    const isYes = ((i: string[]): i is ["yes"] => i.length === 1 && i[0] === "yes");
    const expressionsResults: Record<string, (keyStr: string, key: (string | number)[], context: any, extra?: any) => void> = {
      // question_2:
      "componentDefinitions__0__component__config__componentDefinitions__1__expressions__0__config__template":
        (keyStr: string, key: (string | number)[], context: any, extra?: any) => {
          // $count(formData.`questiontree_1`.`question_1`[][$ in ["no"]]) > 0
          const qtVal: ClientFormValue = context?.formData;
          const val = qtVal?.questiontree_1?.question_1;
          const testing: ["yes"] | ["no"] = ["no"];
          testing?.includes('no')
          return Array.isArray(val) ? isNo(val) : val === "no";
        },
      "componentDefinitions__0__component__config__componentDefinitions__1__expressions__1__config__template":
        (keyStr: string, key: (string | number)[], context: any, extra?: any) => {
          // $count(formData.`questiontree_1`.`question_1`[][$ in ["no"]]) > 0
          const qtVal: ClientFormValue = context?.formData;
          const val = qtVal?.questiontree_1?.question_1;
          return Array.isArray(val) ? isNo(val) : val === "no";
        },
      "componentDefinitions__0__component__config__componentDefinitions__1__expressions__2__config__template":
        (keyStr: string, key: (string | number)[], context: any, extra?: any) => {
          // ($count(formData.`questiontree_1`.`question_1`[][$ in ["no"]]) > 0 ? formData.`questiontree_1.`question_2` : null)
          const qtVal: ClientFormValue = context?.formData;
          const val = qtVal?.questiontree_1?.question_1;
          const matches = Array.isArray(val) ? isNo(val) : val === "no";
          return matches ? context?.formData?.questiontree_1?.question_2 : null;
        },
      // question_3:
      "componentDefinitions__0__component__config__componentDefinitions__2__expressions__0__config__template":
        (keyStr: string, key: (string | number)[], context: any, extra?: any) => {
          // $count(formData.`questiontree_1`.`question_2`[][$ in ["yes"]]) > 0
          const qtVal: ClientFormValue = context?.formData;
          const val = qtVal?.questiontree_1?.question_2;
          return Array.isArray(val) ? isYes(val) : val === "yes";
        },
      "componentDefinitions__0__component__config__componentDefinitions__2__expressions__1__config__template":
        (keyStr: string, key: (string | number)[], context: any, extra?: any) => {
          // $count(formData.`questiontree_1`.`question_2`[][$ in ["yes"]]) > 0
          const qtVal: ClientFormValue = context?.formData;
          const val = qtVal?.questiontree_1?.question_2;
          return Array.isArray(val) ? isYes(val) : val === "yes";
        },
      "componentDefinitions__0__component__config__componentDefinitions__2__expressions__2__config__template":
        (keyStr: string, key: (string | number)[], context: any, extra?: any) => {
          // ($count(formData.`questiontree_1`.`question_2`[][$ in ["yes"]]) > 0 ? formData.`questiontree_1.`question_3` : null)
          const qtVal: ClientFormValue = context?.formData;
          const val = qtVal?.questiontree_1?.question_2;
          const matches = Array.isArray(val) ? isYes(val) : val === "yes";
          return matches ? context?.formData?.questiontree_1?.question_3 : null;
        },
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

    const toggleRadioButton = function (el: HTMLInputElement) {
      el.checked = true;
      el.dispatchEvent(new Event("change"));
      expect(el.checked).toBe(true);
    }

    it('should update the data model and component visibility as the answers are changed', async () => {
      setUpDynamicAssets({
        urlKeyStart: "http://localhost/default/rdmp/dynamicAsset/formCompiledItems/rdmp",
        callable: function (keyStr: string, key: (string | number)[], context: any, extra?: any) {
          if (keyStr in expressionsResults) {
            return expressionsResults[keyStr](keyStr, key, context, extra);
          }
          throw new Error(`Unknown key: ${keyStr}`);
        }
      });


      const {fixture} = await createFormAndWaitForReady(clientFormConfig);
      const eventBus = TestBed.inject(FormComponentEventBus);
      const element = fixture.nativeElement as HTMLElement;

      const events: any[] = [];
      const sub = eventBus.select$(FormComponentEventType.FIELD_VALUE_CHANGED)
        .pipe(filter(event => event.sourceId !== '*'))
        .subscribe(e => events.push(e));

      try {
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
        fixture.detectChanges();
        await fixture.whenStable();
        expect(events.length).toEqual(2);
        expect(events[0].fieldId).toEqual('/questiontree_1/question_1');
        expect(events[1].fieldId).toEqual('/questiontree_1');

        const q1RadioElem2Component = questionTree.formFieldCompMapEntries
          .find(i => i.compConfigJson.name === "question_1");
        expect(q1RadioElem2Component?.component?.componentDefinition?.config?.visible).toEqual(true);
        expect(q1RadioElem2Component?.component?.isVisible).toEqual(true);

        // Detect changes again, the 'visible' property has changed, so the component should become visible.
        fixture.detectChanges();
        await fixture.whenStable();
        fixture.detectChanges();

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
        fixture.detectChanges();
        await fixture.whenStable();
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
        fixture.detectChanges();
        await fixture.whenStable();

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
      } finally {
        sub.unsubscribe();
      }
    });

    it('should load a record and update fields outside the question tree via expressions', async () => {
      setUpDynamicAssets({
        urlKeyStart: "http://localhost/default/rdmp/dynamicAsset/formCompiledItems/rdmp",
        callable: function (keyStr: string, key: (string | number)[], context: any, extra?: any) {
          if (keyStr in expressionsResults) {
            return expressionsResults[keyStr](keyStr, key, context, extra);
          }
          throw new Error(`Unknown key: ${keyStr}`);
        }
      });

      const formConfigWithModelValue: FormConfigFrame = JSON.parse(JSON.stringify(clientFormConfig));
      formConfigWithModelValue.componentDefinitions[0].model!.config!.value = {
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
      };
      formConfigWithModelValue.componentDefinitions[1].model!.config!.value = "@outcomes-value1";
      formConfigWithModelValue.componentDefinitions[2].model!.config!.value = [{
        outcome: "@outcomes-value1",
        prop2: "@outcomes-prop2-value1"
      }];

      const {fixture, formComponent} = await createFormAndWaitForReady(formConfigWithModelValue);
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
      fixture.detectChanges();
      await fixture.whenStable();

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

    it('should render a provided question label value directly', async () => {
      setUpDynamicAssets({
        urlKeyStart: "http://localhost/default/rdmp/dynamicAsset/formCompiledItems/rdmp",
        callable: function (keyStr: string, key: (string | number)[], context: any, extra?: any) {
          if (keyStr in expressionsResults) {
            return expressionsResults[keyStr](keyStr, key, context, extra);
          }
          throw new Error(`Unknown key: ${keyStr}`);
        }
      });

      // TODO: this sleep should not be necessary, but until we can figure out the timing issue,
      //       this is one way to make the test pass.
      const sleep = (delayMs: number) => new Promise((resolve) => setTimeout(resolve, delayMs))

      const formConfigWithDirectQuestionLabel: FormConfigFrame = JSON.parse(JSON.stringify(clientFormConfig));
      const questionDefs = ((formConfigWithDirectQuestionLabel.componentDefinitions?.[0]?.component?.config as QuestionTreeFieldComponentConfigFrame)?.componentDefinitions ?? []);
      if (!questionDefs[0]?.layout?.config) {
        fail('Question tree test config missing expected first question layout config');
      }

      const expectedValue = "Direct Question Label";
      questionDefs[0]!.layout!.config!.label = expectedValue;

      // ensure the angular form has the expected label
      expect(questionDefs[0]?.layout?.config?.label).toBe(expectedValue);

      const eventBus = TestBed.inject(FormComponentEventBus);
      const events: any[] = [];
      const sub = eventBus.selectAll$().subscribe(e => events.push(e));

      const {fixture} = await createFormAndWaitForReady(formConfigWithDirectQuestionLabel);

      try {
        fixture.detectChanges();
        await fixture.whenStable();

        const element = fixture.nativeElement as HTMLElement;

        const qtElements = element.querySelectorAll('redbox-questiontreefield');
        expect(qtElements).toHaveSize(1);
        const qtElement = qtElements[0];
        expect(qtElement).toBeTruthy();

        const questionTree = fixture.componentInstance.componentDefArr[0].component as QuestionTreeComponent;
        expect(questionTree.formFieldCompMapEntries[0].layout?.label).toEqual(expectedValue);
        expect(questionTree.formFieldCompMapEntries[0].layout?.getStringProperty('label')).toEqual(expectedValue);
        expect(questionTree.formFieldCompMapEntries[0].layout?.isVisible).toBeTrue();

        fixture.detectChanges();
        await fixture.whenStable();
        await fixture.whenRenderingDone();

        const fieldLabels = qtElement.querySelectorAll('label.rb-form-field-label');
        expect(fieldLabels).toHaveSize(1);
        const firstLabel = fieldLabels[0];
        expect(firstLabel).toBeTruthy();

        // make sure the form is ready
        expect(events[0].type).toEqual(FormComponentEventType.FORM_DEFINITION_READY);

        let actualValue = null;
        let attempts = 0;
        while(actualValue !== expectedValue) {
          attempts += 1;
          actualValue = firstLabel?.textContent?.trim();
          await sleep(300);
          if (attempts > 10) {
            fail(`Actual value '${actualValue}' was never equal to expected value '${expectedValue}' in ${attempts} attempts.`);
          }
        }
        console.log(`Took ${attempts} attempts to get actual value to match expected value.`);
        expect(firstLabel?.textContent?.trim()).toContain(expectedValue);
      } finally {
        sub?.unsubscribe();
      }
    });

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

});
