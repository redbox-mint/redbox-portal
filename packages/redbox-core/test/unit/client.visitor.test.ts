import {
  FormConfigFrame, FormExpressionsTemplateLayoutConfigFrame,
  QuestionTreeFieldComponentDefinitionOutline,
  QuestionTreeFormComponentDefinitionOutline, QuestionTreeMeta, QuestionTreeOutcome, QuestionTreeOutcomeInfoKey,
  QuestionTreeQuestion,
  RepeatableFieldComponentConfigFrame,
  TabContentFieldComponentConfigFrame, TabFieldComponentConfigFrame
} from "@researchdatabox/sails-ng-common";
import {formConfigExample1} from "./example-data";
import {logger} from "./helpers";
import {
  reusableFormDefinitions, VocabInlineFormConfigVisitor,
  ClientFormConfigVisitor, ConstructFormConfigVisitor, buildRelatedObjectsFieldDefinition,
} from "../../src";


let expect: Chai.ExpectStatic;
import("chai").then(mod => expect = mod.expect);

describe("Client Visitor", async () => {
  it(`should preserve repeatable zero-row config in client output`, async function () {
    const args: FormConfigFrame = {
      name: "repeatable-config-preserve",
      componentDefinitions: [
        {
          name: "legacy_repeatable",
          component: {
            class: "RepeatableComponent",
            config: {
              addButtonShow: false,
              allowZeroRows: true,
              hideWhenZeroRows: true,
              elementTemplate: {
                name: "",
                component: {
                  class: "SimpleInputComponent",
                },
              },
            },
          },
        },
      ],
    };

    const constructor = new ConstructFormConfigVisitor(logger);
    const constructed = constructor.start({
      data: args,
      formMode: "edit",
      reusableFormDefs: reusableFormDefinitions,
    });

    const visitor = new ClientFormConfigVisitor(logger);
    const actual = visitor.start({ form: constructed });
    const repeatableConfig = actual.componentDefinitions[0].component.config as RepeatableFieldComponentConfigFrame;

    expect(repeatableConfig.addButtonShow).to.equal(false);
    expect(repeatableConfig.allowZeroRows).to.equal(true);
    expect(repeatableConfig.hideWhenZeroRows).to.equal(true);
  });

  it('should propagate syncSources through sharedPopulateFieldComponentConfig', () => {
    const args: FormConfigFrame = {
      name: 'repeatable-sync-sources-preserve',
      componentDefinitions: [
        {
          name: 'contributor_dmp_permissions',
          component: {
            class: 'RepeatableComponent',
            config: {
              syncSources: [
                {
                  fieldName: 'contributor_ci_rhd',
                  visibilityConditionField: 'project-type',
                  visibilityConditionValues: ['@dmpt-project-type-rhd-val'],
                },
                {
                  fieldName: 'contributor_ci_not_rhd',
                  visibilityConditionField: 'project-type',
                  visibilityConditionValues: [
                    '@dmpt-project-type-staff-val',
                    '@dmpt-project-type-other-val',
                  ],
                },
              ],
              elementTemplate: {
                name: '',
                component: {
                  class: 'SimpleInputComponent',
                },
              },
            } as RepeatableFieldComponentConfigFrame,
          },
        },
      ],
    };

    const constructor = new ConstructFormConfigVisitor(logger);
    const constructed = constructor.start({
      data: args,
      formMode: 'edit',
      reusableFormDefs: reusableFormDefinitions,
    });

    const visitor = new ClientFormConfigVisitor(logger);
    const actual = visitor.start({ form: constructed });
    const repeatableConfig = actual.componentDefinitions[0].component.config as RepeatableFieldComponentConfigFrame;

    expect(repeatableConfig.syncSources).to.deep.equal([
      {
        fieldName: 'contributor_ci_rhd',
        visibilityConditionField: 'project-type',
        visibilityConditionValues: ['@dmpt-project-type-rhd-val'],
      },
      {
        fieldName: 'contributor_ci_not_rhd',
        visibilityConditionField: 'project-type',
        visibilityConditionValues: [
          '@dmpt-project-type-staff-val',
          '@dmpt-project-type-other-val',
        ],
      },
    ]);
  });

  it('should keep numeric-like string values in repeatable group data', async function () {
    const args: FormConfigFrame = {
      name: 'repeatable-group-numeric-like',
      componentDefinitions: [
        {
          name: 'dc:subject_anzsrc:for-2008',
          model: {
            class: 'RepeatableModel',
            config: {
              defaultValue: [
                {
                  'rdf:resource': 'http://purl.org/asc/1297.0/2008/seo/960808',
                  type: 'for',
                  name: '960808 - Marine Flora, Fauna and Biodiversity',
                  label: 'Marine Flora, Fauna and Biodiversity',
                  notation: '960808',
                  geneaology: ['96', '9608'],
                },
              ],
            },
          },
          component: {
            class: 'RepeatableComponent',
            config: {
              addButtonShow: false,
              allowZeroRows: true,
              hideWhenZeroRows: true,
              elementTemplate: {
                name: '',
                component: {
                  class: 'GroupComponent',
                  config: {
                    componentDefinitions: [
                      {
                        name: 'name',
                        component: { class: 'SimpleInputComponent' },
                        model: { class: 'SimpleInputModel', config: {} },
                      },
                      {
                        name: 'rdf:resource',
                        component: { class: 'SimpleInputComponent', config: { type: 'hidden' } },
                        model: { class: 'SimpleInputModel', config: {} },
                      },
                      {
                        name: 'type',
                        component: { class: 'SimpleInputComponent', config: { type: 'hidden' } },
                        model: { class: 'SimpleInputModel', config: {} },
                      },
                      {
                        name: 'label',
                        component: { class: 'SimpleInputComponent', config: { type: 'hidden' } },
                        model: { class: 'SimpleInputModel', config: {} },
                      },
                      {
                        name: 'notation',
                        component: { class: 'SimpleInputComponent', config: { type: 'hidden' } },
                        model: { class: 'SimpleInputModel', config: {} },
                      },
                      {
                        name: 'geneaology',
                        component: {
                          class: 'RepeatableComponent',
                          config: {
                            addButtonShow: false,
                            allowZeroRows: true,
                            hideWhenZeroRows: true,
                            elementTemplate: {
                              name: '',
                              component: {
                                class: 'SimpleInputComponent',
                                config: { type: 'hidden' },
                              },
                              model: {
                                class: 'SimpleInputModel',
                                config: {},
                              },
                            },
                          },
                        },
                        model: {
                          class: 'RepeatableModel',
                          config: {},
                        },
                      },
                    ],
                  },
                },
                model: {
                  class: 'GroupModel',
                  config: {},
                },
              },
            },
          },
        },
      ],
    };

    const constructor = new ConstructFormConfigVisitor(logger);
    const constructed = constructor.start({
      data: args,
      formMode: 'edit',
      reusableFormDefs: reusableFormDefinitions,
    });

    const visitor = new ClientFormConfigVisitor(logger);
    const actual = visitor.start({ form: constructed });
    const value = actual.componentDefinitions?.[0]?.model?.config?.value as any[];

    expect(value).to.have.length(1);
    expect(value[0]).to.containSubset({
      'rdf:resource': 'http://purl.org/asc/1297.0/2008/seo/960808',
      type: 'for',
      name: '960808 - Marine Flora, Fauna and Biodiversity',
      label: 'Marine Flora, Fauna and Biodiversity',
      notation: '960808',
      geneaology: ['96', '9608'],
    });
  });

  it('should map legacy value property to name for repeatable group rows', async function () {
    const args: FormConfigFrame = {
      name: 'repeatable-group-legacy-value-key',
      componentDefinitions: [
        {
          name: 'dc:subject_anzsrc:for-2008',
          model: {
            class: 'RepeatableModel',
            config: {
              defaultValue: [
                {
                  value: '960808 - Marine Flora, Fauna and Biodiversity',
                  notation: '960808',
                },
              ],
            },
          },
          component: {
            class: 'RepeatableComponent',
            config: {
              addButtonShow: false,
              allowZeroRows: true,
              hideWhenZeroRows: true,
              elementTemplate: {
                name: '',
                component: {
                  class: 'GroupComponent',
                  config: {
                    componentDefinitions: [
                      {
                        name: 'name',
                        component: { class: 'SimpleInputComponent' },
                        model: { class: 'SimpleInputModel', config: {} },
                      },
                      {
                        name: 'notation',
                        component: { class: 'SimpleInputComponent', config: { type: 'hidden' } },
                        model: { class: 'SimpleInputModel', config: {} },
                      },
                    ],
                  },
                },
                model: {
                  class: 'GroupModel',
                  config: {},
                },
              },
            },
          },
        },
      ],
    };

    const constructor = new ConstructFormConfigVisitor(logger);
    const constructed = constructor.start({
      data: args,
      formMode: 'edit',
      reusableFormDefs: reusableFormDefinitions,
    });

    const visitor = new ClientFormConfigVisitor(logger);
    const actual = visitor.start({ form: constructed });
    const value = actual.componentDefinitions?.[0]?.model?.config?.value as any[];

    expect(value).to.have.length(1);
    expect(value[0]).to.containSubset({
      name: '960808 - Marine Flora, Fauna and Biodiversity',
      notation: '960808',
    });
  });

  it('should hide repeatable layout at zero rows when hideWhenZeroRows is true', async function () {
    const args: FormConfigFrame = {
      name: 'repeatable-zero-row-layout-hidden',
      componentDefinitions: [
        {
          name: 'legacy_repeatable',
          model: {
            class: 'RepeatableModel',
            config: {
              defaultValue: [],
            },
          },
          component: {
            class: 'RepeatableComponent',
            config: {
              visible: true,
              addButtonShow: false,
              allowZeroRows: true,
              hideWhenZeroRows: true,
              elementTemplate: {
                name: '',
                component: {
                  class: 'GroupComponent',
                  config: {
                    componentDefinitions: [
                      {
                        name: 'name',
                        component: { class: 'SimpleInputComponent' },
                        model: { class: 'SimpleInputModel', config: {} },
                      },
                    ],
                  },
                },
                model: {
                  class: 'GroupModel',
                  config: {},
                },
              },
            },
          },
          layout: {
            class: 'DefaultLayout',
            config: {
              visible: true,
              label: 'Repeatable Legacy',
            },
          },
        },
      ],
    };

    const constructor = new ConstructFormConfigVisitor(logger);
    const constructed = constructor.start({
      data: args,
      formMode: 'edit',
      reusableFormDefs: reusableFormDefinitions,
    });

    const visitor = new ClientFormConfigVisitor(logger);
    const actual = visitor.start({ form: constructed });
    const repeatable = actual.componentDefinitions?.[0];

    expect(repeatable.component?.config?.visible).to.equal(false);
    expect(repeatable.layout?.config?.visible).to.equal(false);
  });

  it('should normalize null repeatable rows and null new entry values', async function () {
    const args: FormConfigFrame = {
      name: 'repeatable-null-values',
      componentDefinitions: [
        {
          name: 'legacy_repeatable',
          model: {
            class: 'RepeatableModel',
            config: {
              defaultValue: [null],
            },
          },
          component: {
            class: 'RepeatableComponent',
            config: {
              elementTemplate: {
                name: '',
                component: {
                  class: 'GroupComponent',
                  config: {
                    componentDefinitions: [
                      {
                        name: 'name',
                        component: { class: 'SimpleInputComponent' },
                        model: { class: 'SimpleInputModel', config: {} },
                      },
                    ],
                  },
                },
                model: {
                  class: 'GroupModel',
                  config: {
                    // @ts-ignore: testing that null is normalised
                    newEntryValue: null,
                  },
                },
              },
            },
          },
        },
      ],
    };

    const constructor = new ConstructFormConfigVisitor(logger);
    const constructed = constructor.start({
      data: args,
      formMode: 'edit',
      reusableFormDefs: reusableFormDefinitions,
    });

    const visitor = new ClientFormConfigVisitor(logger);
    const actual = visitor.start({ form: constructed });
    const repeatable = actual.componentDefinitions?.[0];
    const repeatableValue = repeatable?.model?.config?.value as unknown[] | undefined;
    const repeatableConfig = repeatable?.component?.config as RepeatableFieldComponentConfigFrame | undefined;
    const newEntryValue = repeatableConfig?.elementTemplate?.model?.config?.newEntryValue;

    expect(repeatableValue).to.have.length(1);
    expect(repeatableValue?.[0]).to.deep.equal({});
    expect(newEntryValue).to.deep.equal({});
  });

  it(`should create full example form config`, async function () {
    const args = formConfigExample1;

    const constructor = new ConstructFormConfigVisitor(logger);
    const constructed = constructor.start({
      data: args,
      formMode: "edit",
      reusableFormDefs: reusableFormDefinitions,
    });

    const visitor = new ClientFormConfigVisitor(logger);
    const actual = visitor.start({form: constructed});

    const stringified = JSON.stringify(actual);

    expect(stringified).to.not.contain("constraints");
    expect(stringified).to.not.contain("defaultValue");

    // top-level form config components
    const formCompDefs = actual.componentDefinitions;
    expect(formCompDefs).to.have.length(4);

    // tab count
    const formCompDefFirstTabs = actual.componentDefinitions[0].component;
    expect(formCompDefFirstTabs.class).to.eql("TabComponent");
    expect((formCompDefFirstTabs.config as TabFieldComponentConfigFrame)?.tabs).to.have.length(2);

    // tab 1 component count
    const tabFirst = (formCompDefFirstTabs.config as TabFieldComponentConfigFrame)?.tabs[0];
    expect(tabFirst.component.class).to.eql("TabContentComponent");
    expect((tabFirst.component.config as TabContentFieldComponentConfigFrame)?.componentDefinitions).to.have.length(15);

    // tab 2 component count
    const tabSecond = (formCompDefFirstTabs.config as TabFieldComponentConfigFrame)?.tabs[1];
    expect(tabSecond.component.class).to.eql("TabContentComponent");
    expect((tabSecond.component.config as TabContentFieldComponentConfigFrame)?.componentDefinitions).to.have.length(3);
  });

  const cases: {
    title: string,
    args: FormConfigFrame;
    expected: FormConfigFrame | {};
  }[] = [
    {
      title: "create empty form config",
      args: {name: '', componentDefinitions: []},
      expected: {},
    },
    {
      title: "create basic form config",
      args: {
        name: "basic-form",
        type: "rdmp",
        debugValue: true,
        domElementType: 'form',
        defaultComponentConfig: {
          defaultComponentCssClasses: 'row',
        },
        editCssClasses: "redbox-form form",
        componentDefinitions: [
          {
            name: 'text_1',
            component: {class: 'SimpleInputComponent'},
          },
          {
            name: 'text_2',
            layout: {
              class: 'DefaultLayout',
              config: {
                label: 'TextField with default wrapper defined',
                helpText: 'This is a help text',
              }
            },
            model: {
              class: 'SimpleInputModel',
              config: {
                defaultValue: 'hello world 2!',
              }
            },
            component: {
              class: 'SimpleInputComponent',
            },
            constraints: {
              authorization: {
                allowRoles: [],
              },
              allowModes: [],
            },
            expressions: [
              {
                name: 'text_2_text_1_expr',
                config: {
                  template: `value & "__suffix"`,
                  conditionKind: 'jsonpointer',
                  condition: `/text_1::field.value.changed`,
                  target: `model.value`,
                  runOnFormReady: false,
                },
              },
              {
                name: 'text_2_no_template_expr',
                config: {
                  operation: "testing",
                  conditionKind: 'jsonpointer',
                  condition: `/text_1::field.value.changed`,
                  target: `model.value`,
                  runOnFormReady: false,
                },
              },
            ]
          }
        ]
      },
      expected: {
        name: "basic-form",
        type: "rdmp",
        debugValue: true,
        domElementType: 'form',
        defaultComponentConfig: {
          defaultComponentCssClasses: 'row',
        },
        editCssClasses: "redbox-form form",
        enabledValidationGroups: ["all"],
        validators: [],
        validationGroups: {
          all: {description: "Validate all fields with validators.", initialMembership: "all"},
          none: {description: "Validate none of the fields.", initialMembership: "none"},
        },
        componentDefinitions: [
          {
            name: "text_1",
            component: {
              class: 'SimpleInputComponent',
              "config": {
                "autofocus": false,
                "disabled": false,
                "editMode": true,
                "placeholder": "",
                "readonly": false,
                "type": "text",
                "visible": true,
              },

            },
            model: {class: "SimpleInputModel", config: {}},
          },
          {
            name: 'text_2',
            layout: {
              class: 'DefaultLayout',
              config: {
                autofocus: false,
                cssClassesMap: {},
                disabled: false,
                editMode: true,
                helpTextVisible: false,
                helpTextVisibleOnInit: false,
                label: 'TextField with default wrapper defined',
                labelRequiredStr: '*',
                readonly: false,
                visible: true,
                helpText: 'This is a help text',
              }
            },
            model: {
              class: 'SimpleInputModel',
              config: {
                value: 'hello world 2!',
              }
            },
            component: {
              class: 'SimpleInputComponent',
              config: {
                "autofocus": false,
                "disabled": false,
                "editMode": true,
                "placeholder": "",
                "readonly": false,
                "type": "text",
                "visible": true,
              }
            },
            expressions: [
              {
                name: 'text_2_text_1_expr',
                config: {
                  hasTemplate: true,
                  conditionKind: 'jsonpointer',
                  condition: `/text_1::field.value.changed`,
                  target: `model.value`,
                  template: `value & "__suffix"`,
                  runOnFormReady: false,
                },
              },

              {
                name: 'text_2_no_template_expr',
                config: {
                  hasTemplate: false,
                  operation: "testing",
                  conditionKind: 'jsonpointer',
                  condition: `/text_1::field.value.changed`,
                  target: `model.value`,
                  runOnFormReady: false,
                },
              },
            ]
          }
        ]
      }
    },
    {
      title: "remove the component because the user does not have the required roles",
      args: {
        name: "remove-item-constraint-roles",
        type: "rdmp",
        debugValue: true,
        domElementType: 'form',
        defaultComponentConfig: {
          defaultComponentCssClasses: 'row',
        },
        editCssClasses: "redbox-form form",
        componentDefinitions: [
          {
            name: 'text_1',
            component: {
              class: 'SimpleInputComponent',
            },
          },
          {
            name: 'text_2',
            layout: {
              class: 'DefaultLayout',
              config: {
                label: 'TextField with default wrapper defined',
                helpText: 'This is a help text',
              }
            },
            model: {
              class: 'SimpleInputModel',
              config: {
                defaultValue: 'hello world 2!',
              }
            },
            component: {
              class: 'SimpleInputComponent',
            },
            constraints: {
              authorization: {
                allowRoles: ['Admin', 'Librarians'],
              },
              allowModes: [],
            },
          }
        ]
      },
      expected: {
        name: "remove-item-constraint-roles",
        type: "rdmp",
        debugValue: true,
        domElementType: 'form',
        defaultComponentConfig: {
          defaultComponentCssClasses: 'row',
        },
        editCssClasses: "redbox-form form",
        enabledValidationGroups: ["all"],
        validators: [],
        validationGroups: {
          all: {description: "Validate all fields with validators.", initialMembership: "all"},
          none: {description: "Validate none of the fields.", initialMembership: "none"},
        },
        componentDefinitions: [
          {
            name: 'text_1',
            component: {
              class: 'SimpleInputComponent',
              config: {
                "autofocus": false,
                "disabled": false,
                "editMode": true,
                "placeholder": "",
                "readonly": false,
                "type": "text",
                "visible": true,
              }
            },
            model: {class: "SimpleInputModel", config: {}}
          }
        ]
      }
    },
    {
      title: "remove the component because the client does not have the required mode",
      args: {
        name: "remove-item-constraint-mode",
        type: "rdmp",
        debugValue: true,
        domElementType: 'form',
        defaultComponentConfig: {
          defaultComponentCssClasses: 'row',
        },
        editCssClasses: "redbox-form form",
        componentDefinitions: [
          {
            name: 'text_1',
            component: {
              class: 'SimpleInputComponent',
            },
            model: {
              class: "SimpleInputModel",
              config: {
                validators: [{class: 'required'}]
              }
            }
          },
          {
            name: 'text_2',
            layout: {
              class: 'DefaultLayout',
              config: {
                label: 'TextField with default wrapper defined',
                helpText: 'This is a help text',
              }
            },
            model: {
              class: 'SimpleInputModel',
              config: {
                defaultValue: 'hello world 2!',
              }
            },
            component: {
              class: 'SimpleInputComponent',
            },
            constraints: {
              authorization: {
                allowRoles: [],
              },
              allowModes: ['edit'],
            },
          }
        ]
      },
      expected: {
        name: "remove-item-constraint-mode",
        type: "rdmp",
        debugValue: true,
        domElementType: 'form',
        defaultComponentConfig: {
          defaultComponentCssClasses: 'row',
        },
        editCssClasses: "redbox-form form",
        enabledValidationGroups: ["all"],
        validators: [],
        validationGroups: {
          all: {description: "Validate all fields with validators.", initialMembership: "all"},
          none: {description: "Validate none of the fields.", initialMembership: "none"},
        },
        componentDefinitions: [
          {
            name: 'text_1',
            component: {
              class: 'SimpleInputComponent',
              config: {
                autofocus: false,
                disabled: false,
                editMode: true,
                placeholder: "",
                readonly: false,
                type: "text",
                visible: true,
              },
            },
            model: {
              class: "SimpleInputModel",
              config: {
                validators: [{class: 'required'}]
              }
            }
          },
        ]
      }
    },
    {
      title: "remove the components nested in repeatable and group components when the constraints are not met",
      args: {
        name: "remove-items-constrains-nested",
        type: "rdmp",
        debugValue: true,
        domElementType: 'form',
        defaultComponentConfig: {
          defaultComponentCssClasses: 'row',
        },
        editCssClasses: "redbox-form form",
        componentDefinitions: [
          {
            name: 'repeatable_group_1',
            model: {
              class: 'RepeatableModel',
              config: {
                defaultValue: [{
                  text_1: "hello world from repeating groups",
                  text_2: 'hello world 2!',
                  repeatable_for_admin: ['hello world from repeatable for admin'],
                  removed_group: {removed_group_text: 'hello world 1!'},
                }]
              }
            },
            component: {
              class: 'RepeatableComponent',
              config: {
                elementTemplate: {
                  name: "",
                  model: {
                    class: 'GroupModel',
                    config: {
                      newEntryValue: {
                        text_1: 'hello world 1!',
                        text_2: "repeatable_group_1 elementTemplate text_2 default"
                      }
                    },
                  },
                  component: {
                    class: 'GroupComponent',
                    config: {
                      wrapperCssClasses: 'col',
                      componentDefinitions: [
                        {
                          // requires mode edit, so expect to be removed
                          name: 'text_1',
                          model: {
                            class: 'SimpleInputModel',
                            config: {}
                          },
                          component: {class: 'SimpleInputComponent'},
                          constraints: {allowModes: ['edit']},
                        },
                        {
                          name: 'text_2',
                          model: {
                            class: 'SimpleInputModel',
                            config: {}
                          },
                          component: {class: 'SimpleInputComponent'},
                        },
                        {
                          // elementTemplate requires role 'Admin', so repeatable is removed
                          name: 'repeatable_for_admin',
                          model: {class: 'RepeatableModel', config: {}},
                          component: {
                            class: 'RepeatableComponent',
                            config: {
                              elementTemplate: {
                                name: "",
                                model: {
                                  class: 'SimpleInputModel',
                                  config: {}
                                },
                                component: {class: 'SimpleInputComponent'},
                                constraints: {authorization: {allowRoles: ['Admin']}},
                              }
                            }
                          },
                        },
                        {
                          // all group components are removed, so group is removed
                          name: "removed_group",
                          model: {
                            class: 'GroupModel', config: {}
                          },
                          component: {
                            class: 'GroupComponent',
                            config: {
                              wrapperCssClasses: 'col',
                              componentDefinitions: [
                                {
                                  // requires mode edit, so expect to be removed
                                  name: 'removed_group_text',
                                  model: {
                                    class: 'SimpleInputModel',
                                    config: {}
                                  },
                                  component: {class: 'SimpleInputComponent'},
                                  constraints: {allowModes: ['edit']},
                                },
                              ]
                            }
                          }
                        }
                      ]
                    }
                  },
                  layout: {
                    class: 'RepeatableElementLayout',
                    config: {hostCssClasses: 'row align-items-start'}
                  },
                  // requires mode view, so is kept
                  constraints: {authorization: {allowRoles: []}, allowModes: ['view']}
                }
              },
            },
            layout: {
              class: 'DefaultLayout',
              config: {
                label: 'Repeatable TextField with default wrapper defined',
                helpText: 'Repeatable component help text',
              }
            },
          },
        ]
      },
      expected: {
        name: "remove-items-constrains-nested",
        type: "rdmp",
        debugValue: true,
        domElementType: 'form',
        defaultComponentConfig: {
          defaultComponentCssClasses: 'row',
        },
        editCssClasses: "redbox-form form",
        enabledValidationGroups: ["all"],
        validators: [],
        validationGroups: {
          all: {description: "Validate all fields with validators.", initialMembership: "all"},
          none: {description: "Validate none of the fields.", initialMembership: "none"},
        },
        componentDefinitions: [
          {
            name: 'repeatable_group_1',
            model: {
              class: 'RepeatableModel',
              config: {value: [{text_2: 'hello world 2!'}]}
            },
            component: {
              class: 'RepeatableComponent',
              config: {
                addButtonShow: true,
                allowZeroRows: false,
                autofocus: false,
                disabled: false,
                editMode: true,
                readonly: false,
                hideWhenZeroRows: false,
                visible: true,
                elementTemplate: {
                  name: "",
                  model: {
                    class: 'GroupModel',
                    config: {newEntryValue: {
                        text_2: "repeatable_group_1 elementTemplate text_2 default"
                      }}
                  },
                  component: {
                    class: 'GroupComponent',
                    config: {
                      autofocus: false,
                      disabled: false,
                      editMode: true,
                      readonly: false,
                      visible: true,
                      wrapperCssClasses: 'col',
                      componentDefinitions: [
                        // <-- requires mode edit, so expect to be removed
                        {
                          name: 'text_2',
                          model: {
                            class: 'SimpleInputModel',
                            config: {}
                          },
                          component: {
                            class: 'SimpleInputComponent',
                            config: {
                              autofocus: false,
                              disabled: false,
                              editMode: true,
                              placeholder: "",
                              readonly: false,
                              type: "text",
                              visible: true,
                            }
                          },
                        },
                        // <-- requires role 'Admin', so is removed
                      ]
                    }
                  },
                  layout: {
                    class: 'RepeatableElementLayout',
                    config: {
                      alignment: 'end',
                      hostCssClasses: 'row align-items-start',
                      containerCssClass: 'rb-form-action-row',
                      compact: false,
                      autofocus: false,
                      cssClassesMap: {},
                      disabled: false,
                      editMode: true,
                      helpTextVisible: false,
                      helpTextVisibleOnInit: false,
                      labelRequiredStr: '*',
                      readonly: false,
                      slotCssClass: 'rb-form-action-slot',
                      visible: true,
                      wrap: true,
                    }
                  },
                  // <-- requires mode view, so is kept, constraints removed
                }
              },
            },
            layout: {
              class: 'DefaultLayout',
              config: {
                label: 'Repeatable TextField with default wrapper defined',
                helpText: 'Repeatable component help text',
                autofocus: false,
                cssClassesMap: {},
                disabled: false,
                editMode: true,
                helpTextVisible: false,
                helpTextVisibleOnInit: false,
                labelRequiredStr: '*',
                readonly: false,
                visible: true,
              }
            },
          },
        ]
      }
    }
  ];
  cases.forEach(({title, args, expected}) => {
    it(`should ${title}`, async function () {
      const constructor = new ConstructFormConfigVisitor(logger);
      const constructed = constructor.start({data: args, formMode: "edit"});

      const visitor = new ClientFormConfigVisitor(logger);
      const actual = visitor.start({form: constructed});
      expect(actual).to.eql(expected);
    });
  });

  it(`should result in an empty form config due to roles`, async function () {
    const formConfig: FormConfigFrame = {
      name: "basic-form",
      type: "rdmp",
      debugValue: true,
      domElementType: 'form',
      defaultComponentConfig: {
        defaultComponentCssClasses: 'row',
      },
      editCssClasses: "redbox-form form",
      componentDefinitions: [
        {
          name: 'text_2',
          layout: {
            class: 'DefaultLayout',
            config: {
              label: 'TextField with default wrapper defined',
              helpText: 'This is a help text',
            }
          },
          model: {
            class: 'SimpleInputModel',
            config: {
              defaultValue: 'hello world 2!',
            }
          },
          component: {
            class: 'SimpleInputComponent',
          },
          constraints: {
            authorization: {
              allowRoles: ['Admin'],
            },
            allowModes: [],
          },
        }
      ]
    };

    const constructor = new ConstructFormConfigVisitor(logger);
    const constructed = constructor.start({
      data: formConfig,
      formMode: "edit",
      record: {text_2: "text_2_value"}
    });

    const visitor = new ClientFormConfigVisitor(logger);
    const actual = visitor.start({
      form: constructed,
      formMode: "view",
      userRoles: ["Librarian"],
    });
    expect(actual).to.eql({});
  });

  it(`should keep transformed accordion in view mode`, async function () {
    const constructor = new ConstructFormConfigVisitor(logger);
    const constructed = constructor.start({
      formMode: "view",
      data: {
        name: "form",
        componentDefinitions: [
          {
            name: "main_tab",
            component: {
              class: "TabComponent",
              config: {
                tabs: [
                  {
                    name: "tab1",
                    component: {
                      class: "TabContentComponent",
                      config: { componentDefinitions: [] }
                    }
                  }
                ]
              }
            },
            layout: { class: "TabLayout", config: {} }
          }
        ]
      }
    });

    const visitor = new ClientFormConfigVisitor(logger);
    const actual = visitor.start({ form: constructed, formMode: "view" });
    expect(actual.componentDefinitions[0].component.class).to.eql("AccordionComponent");
  });

  it(`should prune edit-only repeatables nested in transformed tabs for view mode`, async function () {
    const constructor = new ConstructFormConfigVisitor(logger);
    const constructed = constructor.start({
      formMode: "view",
      record: { finalKeywords: ["alpha", "beta"] },
      data: {
        name: "form",
        componentDefinitions: [
          {
            name: "main_tab",
            component: {
              class: "TabComponent",
              config: {
                tabs: [
                  {
                    name: "tab1",
                    component: {
                      class: "TabContentComponent",
                      config: {
                        componentDefinitions: [
                          {
                            name: "finalKeywords",
                            constraints: {
                              authorization: { allowRoles: [] },
                              allowModes: ["edit"],
                            },
                            component: {
                              class: "RepeatableComponent",
                              config: {
                                elementTemplate: {
                                  name: "",
                                  component: { class: "SimpleInputComponent", config: {} },
                                  model: { class: "SimpleInputModel", config: {} },
                                },
                              },
                            },
                            model: {
                              class: "RepeatableModel",
                              config: {},
                            },
                          },
                        ],
                      }
                    }
                  }
                ]
              }
            },
            layout: { class: "TabLayout", config: {} }
          }
        ]
      }
    });

    const visitor = new ClientFormConfigVisitor(logger);
    const actual = visitor.start({ form: constructed, formMode: "view" });
    const accordion = actual.componentDefinitions[0];
    expect(accordion.component.class).to.eql("AccordionComponent");
    const panel = (accordion.component.config as any).panels?.[0];
    const nested = panel?.component?.config?.componentDefinitions ?? [];
    expect(nested).to.have.length(0);
  });

  it(`should keep explicit view repeatables in view mode`, async function () {
    const constructor = new ConstructFormConfigVisitor(logger);
    const constructed = constructor.start({
      formMode: "view",
      record: { actions: ["Edit this plan", "Create a data record from this plan"] },
      data: {
        name: "form",
        componentDefinitions: [
          {
            name: "actions",
            constraints: {
              authorization: { allowRoles: [] },
              allowModes: ["view"],
            },
            component: {
              class: "RepeatableComponent",
              config: {
                elementTemplate: {
                  name: "",
                  component: { class: "ContentComponent", config: { template: "<div>{{content}}</div>" } },
                },
              },
            },
            model: {
              class: "RepeatableModel",
              config: {},
            },
          },
        ]
      }
    });

    const visitor = new ClientFormConfigVisitor(logger);
    const actual = visitor.start({ form: constructed, formMode: "view" });
    expect(actual.componentDefinitions[0].component.class).to.eql("RepeatableComponent");
  });

  it(`should prune edit-only repeatables in view mode before view transforms`, async function () {
    const constructor = new ConstructFormConfigVisitor(logger);
    const constructed = constructor.start({
      formMode: "view",
      data: {
        name: "form",
        componentDefinitions: [
          {
            name: "project",
            component: {
              class: "GroupComponent",
              config: {
                componentDefinitions: [
                  {
                    name: "dc:subject_anzsrc:for-2008",
                    constraints: {
                      authorization: { allowRoles: [] },
                      allowModes: ["edit"],
                    },
                    component: {
                      class: "RepeatableComponent",
                      config: {
                        elementTemplate: {
                          name: "",
                          component: {
                            class: "GroupComponent",
                            config: {
                              componentDefinitions: [
                                {
                                  name: "name",
                                  component: { class: "SimpleInputComponent", config: {} },
                                  model: { class: "SimpleInputModel", config: {} },
                                }
                              ]
                            }
                          },
                          model: { class: "GroupModel", config: {} }
                        }
                      }
                    },
                    model: { class: "RepeatableModel", config: {} }
                  }
                ]
              }
            },
            model: { class: "GroupModel", config: {} }
          }
        ]
      }
    });

    const visitor = new ClientFormConfigVisitor(logger);
    const actual = visitor.start({ form: constructed, formMode: "view" });
    expect(actual.componentDefinitions ?? []).to.have.length(0);
  });

  it(`should keep action row groups in view mode`, async function () {
    const constructor = new ConstructFormConfigVisitor(logger);
    const constructed = constructor.start({
      formMode: "view",
      data: {
        name: "form",
        componentDefinitions: [
          {
            name: "actions",
            component: {
              class: "GroupComponent",
              config: {
                componentDefinitions: [
                  {
                    name: "edit_link",
                    component: {
                      class: "ContentComponent",
                      config: {
                        template: "<a class=\"btn btn-info\">Edit this plan</a>",
                      },
                    },
                    layout: { class: "InlineLayout", config: {} },
                  },
                ],
              },
            },
            model: {
              class: "GroupModel",
              config: {},
            },
            layout: { class: "ActionRowLayout", config: {} },
          },
        ]
      }
    });

    const visitor = new ClientFormConfigVisitor(logger);
    const actual = visitor.start({ form: constructed, formMode: "view" });
    expect(actual.componentDefinitions[0].component.class).to.eql("GroupComponent");
    expect(actual.componentDefinitions[0].layout?.class).to.eql("ActionRowLayout");
  });

  it(`should keep tab in edit mode`, async function () {
    const constructor = new ConstructFormConfigVisitor(logger);
    const constructed = constructor.start({
      formMode: "edit",
      data: {
        name: "form",
        componentDefinitions: [
          {
            name: "main_tab",
            component: {
              class: "TabComponent",
              config: {
                tabs: [
                  {
                    name: "tab1",
                    component: {
                      class: "TabContentComponent",
                      config: { componentDefinitions: [] }
                    }
                  }
                ]
              }
            },
            layout: { class: "TabLayout", config: {} }
          }
        ]
      }
    });

    const visitor = new ClientFormConfigVisitor(logger);
    const actual = visitor.start({ form: constructed, formMode: "edit" });
    expect(actual.componentDefinitions[0].component.class).to.eql("TabComponent");
  });

  it("should build the expected form config with question tree", async () => {
    const availableOutcomes: QuestionTreeOutcome[] = [
      {value: "value1", label: "@outcomes-value1"},
      {value: "value2", label: "@outcomes-value2"},
    ];
    const availableMeta: QuestionTreeMeta = {
      prop2: {
        value1: "@outcomes-prop2-value1",
        value2: "@outcomes-prop2-value2",
      },
    };
    const questions: QuestionTreeQuestion[] = [
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
        answers: [{value: "yes"}, {value: "no"}],
        rules: {op: "in", q: "question_1", a: ["no"]}
      },
      {
        id: "question_3",
        answersMin: 1,
        answersMax: 2,
        answers: [{value: "yes"}, {value: "maybe"}, {value: "no"}],
        rules: {op: "in", q: "question_2", a: ["yes"]}
      },
      {
        id: "question_4",
        answersMin: 1,
        answersMax: 1,
        answers: [
          {
            value: "yes",
            label: "@answer-yes",
            outcome: "value1",
            meta: {prop2: "value2"},
          },
          {
            value: "no", label: "No",
            outcome: "value2",
            meta: {prop2: "value2"},
          },
        ],
        rules: {
          op: "or", args: [
            {
              op: "and", args: [
                {op: "in", q: "question_1", a: ["no"]},
                {op: "in", q: "question_2", a: ["no"]},
              ]
            },
            {
              op: "and", args: [
                {op: "only", q: "question_1", a: ["no"]},
                {op: "notin", q: "question_2", a: ["no"]},
                {op: "in", q: "question_3", a: ["no", "maybe"]},
              ]
            }
          ]
        },
      }
    ];
    const formConfig: FormConfigFrame = {
      name: "form",
      componentDefinitions: [
        {
          name: "questiontree_1",
          component: {
            class: "QuestionTreeComponent",
            config: {
              availableOutcomes,
              availableMeta,
              questions,
              componentDefinitions: [],
            }
          },
        }
      ]
    };
    const expressionBase: FormExpressionsTemplateLayoutConfigFrame = {
      condition: "/questiontree_1::field.value.changed",
      template: "",
      conditionKind: 'jsonpointer',
      target: `layout.visible`,
    };
    const expected: FormConfigFrame = {
      name: "form",
      componentDefinitions: [
        {
          name: "questiontree_1",
          component: {
            class: "QuestionTreeComponent",
            config: {
              availableOutcomes,
              availableMeta,
              questions,
              componentDefinitions: [
                {
                  name: "question_1",
                  component: {
                    class: "RadioInputComponent",
                    config: {
                      options: [
                        {value: "yes", label: "@questiontree_1-question_1-yes"},
                        {value: "no", label: "@questiontree_1-question_1-no"},
                      ]
                    }
                  },
                  layout: {
                    class: "DefaultLayout",
                    config: {
                      helpText: "@questiontree_1-item-question_1-help",
                      visible: true,
                    }
                  }
                },
                {
                  name: "question_2",
                  component: {
                    class: "CheckboxInputComponent",
                    config: {
                      options: [
                        {value: "yes", label: "@questiontree_1-question_2-yes"},
                        {value: "no", label: "@questiontree_1-question_2-no"},
                      ]
                    }
                  },
                  layout: {
                    class: "DefaultLayout",
                    config: {
                      helpText: "@questiontree_1-item-question_2-help",
                      visible: false,
                    }
                  },
                  expressions: [
                    {
                      name: "questiontree_1-question_2-layoutvis-qt", description: undefined,
                      config: {
                        ...expressionBase,
                        template: "$count(formData.`questiontree_1`.`question_1`[][$ in [\"no\"]]) > 0"
                      }
                    }
                  ],
                },
                {
                  name: "question_3",
                  component: {
                    class: "CheckboxInputComponent",
                    config: {
                      options: [
                        {value: "yes", label: "@questiontree_1-question_3-yes"},
                        {value: "maybe", label: "@questiontree_1-question_3-maybe"},
                        {value: "no", label: "@questiontree_1-question_3-no"}]
                    }
                  },
                  layout: {
                    class: "DefaultLayout",
                    config: {
                      helpText: "@questiontree_1-item-question_3-help",
                      visible: false,
                    }
                  },
                  expressions: [
                    {
                      name: "questiontree_1-question_3-layoutvis-qt", description: undefined,
                      config: {
                        ...expressionBase,
                        template: "$count(formData.`questiontree_1`.`question_2`[][$ in [\"yes\"]]) > 0"
                      }
                    }
                  ],
                },
                {
                  name: "question_4",
                  component: {
                    class: "RadioInputComponent",
                    config: {
                      options: [
                        {value: "yes", label: "@answer-yes"},
                        {value: "no", label: "No"},
                      ]
                    }
                  },
                  layout: {
                    class: "DefaultLayout",
                    config: {
                      helpText: "@questiontree_1-item-question_4-help",
                      visible: false,
                    }
                  },
                  expressions: [
                    {
                      name: "questiontree_1-question_4-layoutvis-qt", description: undefined,
                      config: {
                        ...expressionBase, template: "(" +
                          "(" +
                          "$count(formData.`questiontree_1`.`question_1`[][$ in [\"no\"]]) > 0" +
                          ") and (" +
                          "$count(formData.`questiontree_1`.`question_2`[][$ in [\"no\"]]) > 0" +
                          ")" +
                          ") or (" +
                          "(" +
                          "formData.`questiontree_1`.`question_1`[] = [\"no\"]" +
                          ") and (" +
                          "$count(formData.`questiontree_1`.`question_2`[][$not($ in [\"no\"])]) = $count(formData.`questiontree_1`.`question_2`)" +
                          ") and (" +
                          "$count(formData.`questiontree_1`.`question_3`[][$ in [\"no\",\"maybe\"]]) > 0" +
                          ")" +
                          ")"
                      }
                    }
                  ],
                },
              ],
            }
          },
        }
      ]
    };

    const constructor = new ConstructFormConfigVisitor(logger);
    const constructed = constructor.start({
      data: formConfig,
      formMode: "edit",
      reusableFormDefs: reusableFormDefinitions,
    });

    const visitor = new ClientFormConfigVisitor(logger);
    const actual = visitor.start({form: constructed});

    expect(actual).to.containSubset(expected);
  });

  it("should transform question tree answers to content in view mode", async () => {
    const formConfig: FormConfigFrame = {
      name: "question-tree-view-transform",
      componentDefinitions: [
        {
          name: "questiontree_1",
          model: {
            class: "QuestionTreeModel",
            config: {
              defaultValue: {
                question_1: "no",
                question_2: ["yes", "maybe"],
                [QuestionTreeOutcomeInfoKey]: {
                  outcome: { value: "restricted", label: "@outcome-restricted" },
                  meta: [],
                },
              },
            },
          },
          component: {
            class: "QuestionTreeComponent",
            config: {
              availableOutcomes: [{ value: "restricted", label: "@outcome-restricted" }],
              availableMeta: {},
              questions: [
                {
                  id: "question_1",
                  label: "Primary question",
                  answersMin: 1,
                  answersMax: 1,
                  answers: [
                    { value: "yes", label: "Yes" },
                    { value: "no", label: "No" },
                  ],
                  rules: { op: "true" },
                },
                {
                  id: "question_2",
                  answersMin: 1,
                  answersMax: 2,
                  answers: [
                    { value: "yes", label: "Yes" },
                    { value: "maybe", label: "@questiontree_1-data-not-from-or-about-individuals-data-about-individuals-label" },
                    { value: "no", label: "No" },
                  ],
                  rules: { op: "in", q: "question_1", a: ["no"] },
                },
              ],
              componentDefinitions: [],
            },
          },
        },
      ],
    };

    const constructor = new ConstructFormConfigVisitor(logger);
    const constructed = constructor.start({
      data: formConfig,
      formMode: "view",
      reusableFormDefs: reusableFormDefinitions,
    });

    const constructedQuestionTree = constructed.componentDefinitions[0];
    if (constructedQuestionTree.model?.config) {
      constructedQuestionTree.model.config.value = {
        [QuestionTreeOutcomeInfoKey]: {
          outcome: { value: "restricted", label: "@outcome-restricted" },
          meta: [],
        },
      };
    }
    const constructedQuestions =
      ((constructedQuestionTree.component.config as QuestionTreeFieldComponentDefinitionOutline["config"])?.componentDefinitions ?? []);
    const questionOne = constructedQuestions.find((component) => component.name === "question_1");
    const questionTwo = constructedQuestions.find((component) => component.name === "question_2");
    if (questionOne?.model?.config) {
      questionOne.model.config.value = "no";
    }
    if (questionTwo?.model?.config) {
      questionTwo.model.config.value = ["yes", "maybe"];
    }

    const visitor = new ClientFormConfigVisitor(logger);
    const actual = visitor.start({ form: constructed, formMode: "view" });
    const transformed = actual.componentDefinitions[0];

    expect(transformed.component.class).to.equal("ContentComponent");
    expect(transformed.component.config).to.containSubset({
      content: [
        {
          questionLabel: "Primary question",
          answerLabel: "No",
        },
        {
          questionLabel: "@questiontree_1-item-question_2-label",
          answerLabels: [
            { label: "Yes" },
            { label: "@questiontree_1-data-not-from-or-about-individuals-data-about-individuals-label" },
          ],
        },
      ],
    });
    expect((transformed.component.config as { template?: string }).template).to.contain("rb-view-group");
  });

  it("should construct the question tree config", async () => {

    // question tree component with 3 questions
    // question_1 is the start,
    // question_2 shows only when question_1 is "no", and has an outcome & meta
    // question_3 shows only when question_2 is "yes
    const serverFormConfig: FormConfigFrame = {
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
          model: {class: "QuestionTreeModel", config: {}},
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
                template: `formData.questiontree_1.${QuestionTreeOutcomeInfoKey}.outcome.($.label ? $.label : $.value)`,
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

              /*
              template:
    $map(formData.questiontree_1.`questiontree-outcome-info`.meta[], function ($v, $i, $a) {
      $v.$merge($keys().($entry := $lookup($v, $);{
      $: $entry.label ? $entry.label : $entry.value
    }))
    })

              converts data:
    {
      "formData": {
        "questiontree_1": {
          "question_1": "no",
          "question_2": "no",
          "question_3": null,
          "questiontree-outcome-info": {
            "outcome": {"value": "outcome2", "label": "@outcomes-value2"}, "meta": [
              {
                "outcome": {"value": "outcome2", "label": "@outcomes-value2"},
                "prop2": {"value": "prop2Value2", "label": "@outcomes-prop2-value2"}
              },
              {
                "outcome": {"value": "outcome1", "label": "@outcomes-value1"},
                "prop2": {"value": "prop2Value1", "label": null}
              }
            ]
          }
        }
      }
    }
              to output:
    [
    {
      "outcome": "@outcomes-value2",
      "prop2": "@outcomes-prop2-value2"
    },
    {
      "outcome": "@outcomes-value1",
      "prop2": "prop2Value1"
    }
    ]
               */
              name: `data-classification-item-outcome-details-expr`,
              config: {
                template: `$map(formData.questiontree_1.\`${QuestionTreeOutcomeInfoKey}\`.meta[], function ($v, $i, $a) {
                    $v.$merge($keys().($entry := $lookup($v, $);{
                    $: $entry.label ? $entry.label : $entry.value'
                }))
                })`,
                conditionKind: 'jsonpointer',
                condition: `/questiontree_1::field.value.changed`,
                target: `model.value`
              }
            },
          ]
        }
      ]
    };


      const constructor = new ConstructFormConfigVisitor(logger);
      const constructed = constructor.start({
        data: serverFormConfig,
        formMode: "edit",
        reusableFormDefs: reusableFormDefinitions,
      });

      const vocabVisitor = new VocabInlineFormConfigVisitor(logger);
      await vocabVisitor.resolveVocabs(constructed, 'default');

      const visitor = new ClientFormConfigVisitor(logger);
      const result = visitor.start({form: constructed});
      expect(result.componentDefinitions).to.have.length(3);
      const qt = result.componentDefinitions[0] as QuestionTreeFormComponentDefinitionOutline;
      expect(qt.component.config?.componentDefinitions).to.have.length(4);
  });

  it("should construct the related publications fields", async () => {
    const data: FormConfigFrame = {
      name: 'related-objects-test',
      componentDefinitions: [
        ...buildRelatedObjectsFieldDefinition({
          fieldName: "related_publications",
          fieldLabel: "@dmpt-related-publication",
          fieldHelp: "@dmpt-related-publication-help",
          titleLabel: "@dataPublication-related-publication-title",
          titlePlaceholder: "Full citation or publication title",
          urlLabel: "@dataPublication-related-publication-url",
          urlPlaceholder: "https://doi.org/...",
          notesLabel: "@dataPublication-related-publication-notes",
          notesPlaceholder: "Open access, in press, or other context",
        })
      ],
    };
    const expected: FormConfigFrame = {
      name: 'related-objects-test',
      componentDefinitions: [
        {
          component: {
            "class": "RepeatableComponent",
            config: {
              addButtonShow: true,
              allowZeroRows: false,
              elementTemplate: {
                component: {
                  "class": "GroupComponent",
                  config: {
                    componentDefinitions: [
                      {
                        component: {
                          "class": "SimpleInputComponent",
                          config: {
                            label: "@dataPublication-related-publication-title",
                            placeholder: "Full citation or publication title",
                            type: "text",
                            wrapperCssClasses: "rb-form-related-link-inline__field",
                          }
                        },
                        layout: {
                          "class": "InlineLayout",
                          config: {label: "@dataPublication-related-publication-title"}
                        },
                        model: {"class": "SimpleInputModel"},
                        name: "related_title",
                      },
                      {
                        component: {
                          "class": "SimpleInputComponent",
                          config: {
                            label: "@dataPublication-related-publication-url",
                            placeholder: "https://doi.org/...",
                            type: "text",
                            wrapperCssClasses: "rb-form-related-link-inline__field",
                          },
                        },
                        layout: {"class": "InlineLayout", config: {label: "@dataPublication-related-publication-url"}},
                        model: {"class": "SimpleInputModel"},
                        name: "related_url",
                      },
                      {
                        component: {
                          "class": "TextAreaComponent",
                          config: {
                            cols: 20,
                            label: "@dataPublication-related-publication-notes",
                            placeholder: "Open access, in press, or other context",
                            rows: 1,
                            wrapperCssClasses: "rb-form-related-link-inline__field",
                          }
                        },
                        layout: {
                          "class": "InlineLayout",
                          config: {label: "@dataPublication-related-publication-notes"}
                        },
                        model: {"class": "TextAreaModel"},
                        name: "related_notes",
                      }
                    ],
                    hostCssClasses: "rb-form-related-link-inline",
                  }
                },
                layout: {
                  "class": "RepeatableElementLayout",
                  config: {
                    alignment: "end",
                    containerCssClass: "rb-form-action-row",
                    hostCssClasses: "rb-form-action-row-layout",
                    slotCssClass: "rb-form-action-slot",
                  }
                },
                model: {
                  "class": "GroupModel", config: {newEntryValue: {}}
                },
                name: "",
              }
            }
          },
          layout: {
            "class": "DefaultLayout",
            config: {helpText: "@dmpt-related-publication-help", label: "@dmpt-related-publication"}
          },
          model: {"class": "RepeatableModel"},
          name: "related_publications"
        }
      ]
    };

    const constructVisitor = new ConstructFormConfigVisitor(logger);
    const constructForm = constructVisitor.start({
      data,
      formMode: 'edit',
      reusableFormDefs: reusableFormDefinitions,
    });
    // expect(constructForm).to.containSubset(expected);

    const clientFormVisitor = new ClientFormConfigVisitor(logger);
    const clientForm = clientFormVisitor.start({
      form: constructForm,
      formMode: 'edit',
      reusableFormDefs: reusableFormDefinitions,
    });

    expect(clientForm).to.containSubset(expected);
  });
});
