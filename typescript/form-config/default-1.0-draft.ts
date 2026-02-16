import { FormConfigFrame } from '@researchdatabox/sails-ng-common';

const formConfig: FormConfigFrame = {
  name: 'default-1.0-draft',
  type: 'rdmp',
  debugValue: true,
  domElementType: 'form',
  defaultComponentConfig: {
    defaultComponentCssClasses: 'row',
  },
  attachmentFields: ["file_upload_1"],
  editCssClasses: 'redbox-form form',
  validationGroups: {
    all: {
      description: 'Validate all fields with validators.',
      initialMembership: 'all',
    },
    none: {
      description: 'Validate none of the fields.',
      initialMembership: 'none',
    },
    minimumCreate: {
      description: 'Fields that must be valid to create a new record.',
      initialMembership: 'none',
    },
    transitionDraftToSubmitted: {
      description: 'Fields that must be valid to transition from draft to submitted.',
      initialMembership: 'all',
    },
  },

  // Validators that operate on multiple fields.
  validators: [{ class: 'different-values', config: { controlNames: ['text_1_event', 'text_2'] } }],
  // operations: [
  //   // sample operations...that can be referenced by expressions
  //   {
  //     class: "script",// or "valueEquals", "valueInList", "hasKey" etc.
  //     config: {
  //         name: "runSomeOperationThatNeedsTheEntireFormData", // the unique name of the operation
  //         template: "<%  %>"
  //     }
  //   },
  //   {
  //     class: "valueEquals",
  //     config: {
  //         name: "setVisibilityByValueEquals",
  //         config: {
  //         }
  //     }
  //   },
  //   {
  //     class: "valueMatches",
  //     config: {
  //         name: "setVisibilityByValueMatches",
  //         config: {
  //         }
  //     }
  //   },
  // ],
  // // Operations that will run every time form data changes
  // expressions: [
  //     {
  //         name: "runSomeOperationThatNeedsTheEntireFormData",
  //         description: '',
  //         config: {
  //             template: ``,
  //             condition: ``,
  //             // target: ``
  //         }
  //     }
  // ],
  componentDefinitions: [
    {
      name: 'main_tab',
      layout: {
        class: 'TabLayout',
        config: {
          // layout-specific config goes here
          hostCssClasses: 'd-flex align-items-start',
          buttonSectionCssClass: 'nav flex-column nav-pills me-5',
          tabPaneCssClass: 'tab-pane fade',
          tabPaneActiveCssClass: 'active show',
        },
      },
      component: {
        class: 'TabComponent',
        config: {
          hostCssClasses: 'tab-content',
          tabs: [
            {
              name: 'tab_1',
              layout: {
                class: 'TabContentLayout',
                config: {
                  buttonLabel: 'Tab 1',
                },
              },
              component: {
                class: 'TabContentComponent',
                config: {
                  selected: true,
                  componentDefinitions: [
                    {
                      name: 'text_block',
                      component: {
                        class: 'ContentComponent',
                        config: {
                          content: 'My first text block component!!!',
                          template: '<h3>content default value content: {{content}}</h3>',
                        },
                      },
                    },
                    // {
                    //     name: 'debug_checkbox',
                    //     layout: {
                    //         class: 'DefaultLayout',
                    //         config: {
                    //             label: 'Debug Checkbox',
                    //             helpText: 'Checkbox some help text - single selection mode',
                    //         }
                    //     },
                    //     model: {
                    //         class: 'CheckboxInputModel',
                    //         config: {
                    //             defaultValue: 'debugging',
                    //         }
                    //     },
                    //     component: {
                    //         class: 'CheckboxInputComponent',
                    //         config: {
                    //             options: [
                    //                 { label: 'Debug', value: 'debugging' }
                    //             ],
                    //             tooltip: 'Checkbox tooltip',
                    //             multipleValues: false
                    //         }
                    //     }
                    // },
                    {
                      name: 'textarea_1',
                      layout: {
                        class: 'DefaultLayout',
                        config: {
                          label: 'Textarea some label',
                          helpText: 'Textarea some help text',
                        },
                      },
                      model: {
                        class: 'TextAreaModel',
                        config: {
                          defaultValue: 'Textarea hello world!!!',
                        },
                      },
                      component: {
                        class: 'TextAreaComponent',
                        config: {
                          rows: 7,
                          cols: 80,
                          tooltip: 'Textarea tooltip',
                        },
                      },
                      // expressions: [
                      //     {
                      //         name: "setVisibilityByValueScript",
                      //         config: {
                      //             sources: [
                      //                 "tab1.text_1_event/value",
                      //                 "tab1.text_1_event/metadata"
                      //             ]
                      //         }
                      //     }
                      // ]
                    },
                    {
                      name: 'rich_text_1',
                      layout: {
                        class: 'DefaultLayout',
                        config: {
                          label: 'Rich text editor',
                          helpText: 'Use the rich text editor to format content.',
                        },
                      },
                      model: {
                        class: 'RichTextEditorModel',
                        config: {
                          defaultValue:
                            '<p><strong>Rich text test content</strong></p><p>Try headings, lists, links, and tables.</p>',
                        },
                      },
                      component: {
                        class: 'RichTextEditorComponent',
                        config: {
                          outputFormat: 'html',
                          minHeight: '240px',
                          placeholder: 'Start writing formatted content...',
                        },
                      },
                    },
                    {
                      name: 'rich_text_markdown_1',
                      layout: {
                        class: 'DefaultLayout',
                        config: {
                          label: 'Rich text editor (Markdown output)',
                          helpText: 'Stores Markdown while keeping rich text editing.',
                        },
                      },
                      model: {
                        class: 'RichTextEditorModel',
                        config: {
                          defaultValue: '## Markdown heading\n\nThis is **bold** and this is *italic*.',
                        },
                      },
                      component: {
                        class: 'RichTextEditorComponent',
                        config: {
                          outputFormat: 'markdown',
                          minHeight: '240px',
                          showSourceToggle: true,
                          placeholder: 'Start writing markdown-backed rich text...',
                        },
                      },
                    },
                    {
                      name: 'dropdown_1',
                      layout: {
                        class: 'DefaultLayout',
                        config: {
                          label: 'Dropdown some label',
                          helpText: 'Dropdown some help text',
                        },
                      },
                      model: {
                        class: 'DropdownInputModel',
                        config: {
                          defaultValue: 'Dropdown hello world!!!',
                        },
                      },
                      component: {
                        class: 'DropdownInputComponent',
                        config: {
                          options: [
                            { label: 'Option 1', value: 'option1' },
                            { label: 'Option 2', value: 'option2' },
                            { label: 'Option 3', value: 'option3' },
                          ],
                          tooltip: 'Dropdown tooltip',
                        },
                      },
                    },
                    {
                      name: 'lookahead_1',
                      layout: {
                        class: 'DefaultLayout',
                        config: {
                          label: 'Lookahead example',
                          helpText: 'Type to filter static options in a typeahead field.',
                        },
                      },
                      model: {
                        class: 'TypeaheadInputModel',
                        config: {
                          defaultValue: 'option2',
                        },
                      },
                      component: {
                        class: 'TypeaheadInputComponent',
                        config: {
                          sourceType: 'static',
                          staticOptions: [
                            { label: 'Option 1', value: 'option1' },
                            { label: 'Option 2', value: 'option2' },
                            { label: 'Option 3', value: 'option3' },
                            { label: 'Another Option', value: 'another-option' },
                          ],
                          placeholder: 'Start typing to search...',
                          minChars: 1,
                          debounceMs: 200,
                          maxResults: 10,
                          allowFreeText: false,
                          valueMode: 'value',
                        },
                      },
                    },
                    {
                      name: 'lookahead_party_1',
                      layout: {
                        class: 'DefaultLayout',
                        config: {
                          label: 'Party lookup',
                          helpText: 'Type to search party records via named query.',
                        },
                      },
                      model: {
                        class: 'TypeaheadInputModel',
                        config: {
                          defaultValue: null,
                        },
                      },
                      component: {
                        class: 'TypeaheadInputComponent',
                        config: {
                          sourceType: 'namedQuery',
                          queryId: 'party',
                          labelField: 'metadata.fullName',
                          valueField: 'oid',
                          placeholder: 'Start typing a party name...',
                          minChars: 1,
                          debounceMs: 250,
                          maxResults: 25,
                          allowFreeText: false,
                          valueMode: 'value',
                        },
                      },
                    },
                    {
                      name: 'lookahead_vocab_1',
                      layout: {
                        class: 'DefaultLayout',
                        config: {
                          label: 'ANZSRC ToA lookup',
                          helpText: 'Type to search vocabulary entries from anzsrc-toa.',
                        },
                      },
                      model: {
                        class: 'TypeaheadInputModel',
                        config: {
                          defaultValue: null,
                        },
                      },
                      component: {
                        class: 'TypeaheadInputComponent',
                        config: {
                          sourceType: 'vocabulary',
                          vocabRef: 'anzsrc-toa',
                          placeholder: 'Start typing a ToA term...',
                          minChars: 1,
                          debounceMs: 250,
                          maxResults: 25,
                          allowFreeText: false,
                          valueMode: 'value',
                        },
                      },
                    },
                    {
                      name: 'checkbox_1',
                      layout: {
                        class: 'DefaultLayout',
                        config: {
                          label: 'Checkbox some label (single value)',
                          helpText: 'Checkbox some help text - single selection mode',
                        },
                      },
                      model: {
                        class: 'CheckboxInputModel',
                        config: {
                          defaultValue: 'option1',
                        },
                      },
                      component: {
                        class: 'CheckboxInputComponent',
                        config: {
                          options: [
                            { label: 'Option 1', value: 'option1' },
                            { label: 'Option 2', value: 'option2' },
                            { label: 'Option 3', value: 'option3' },
                          ],
                          tooltip: 'Checkbox tooltip',
                          multipleValues: false,
                        },
                      },
                    },
                    {
                      name: 'checkbox_multiple',
                      layout: {
                        class: 'DefaultLayout',
                        config: {
                          label: 'Checkbox multiple values',
                          helpText: 'Checkbox with multiple selection enabled',
                        },
                      },
                      model: {
                        class: 'CheckboxInputModel',
                        config: {
                          defaultValue: ['option1', 'option3'],
                        },
                      },
                      component: {
                        class: 'CheckboxInputComponent',
                        config: {
                          options: [
                            { label: 'Multi Option 1', value: 'option1' },
                            { label: 'Multi Option 2', value: 'option2' },
                            { label: 'Multi Option 3', value: 'option3' },
                            { label: 'Multi Option 4', value: 'option4' },
                          ],
                          tooltip: 'Multiple selection checkbox tooltip',
                          multipleValues: true,
                        },
                      },
                    },
                    {
                      name: 'radio_1',
                      layout: {
                        class: 'DefaultLayout',
                        config: {
                          label: 'Radio some label (single value)',
                          helpText: 'Radio some help text - single selection mode',
                        },
                      },
                      model: {
                        class: 'RadioInputModel',
                        config: {
                          defaultValue: 'option1',
                        },
                      },
                      component: {
                        class: 'RadioInputComponent',
                        config: {
                          options: [
                            { label: 'Option 1', value: 'option1' },
                            { label: 'Option 2', value: 'option2' },
                            { label: 'Option 3', value: 'option3' },
                          ],
                          tooltip: 'Checkbox tooltip',
                        },
                      },
                    },
                    {
                      name: 'date_1',
                      layout: {
                        class: 'DefaultLayout',
                        config: {
                          label: 'Date1',
                          helpText: 'Date1 some help text',
                        },
                      },
                      model: {
                        class: 'DateInputModel',
                        config: {},
                      },
                      component: {
                        class: 'DateInputComponent',
                      },
                      expressions: [
                        {
                          name: 'listenToRadio1Change',
                          config: {
                            template: `value = "option2"`,
                            conditionKind: 'jsonpointer',
                            condition: `/main_tab/tab_1/radio_1::field.value.changed`,
                            target: `layout.visible`,
                          },
                        },
                      ],
                    },
                    {
                      name: 'date_2',
                      layout: {
                        class: 'DefaultLayout',
                        config: {
                          label: 'Date some label',
                          helpText: 'Date some help text',
                        },
                      },
                      model: {
                        class: 'DateInputModel',
                        config: {},
                      },
                      component: {
                        class: 'DateInputComponent',
                        config: {
                          enableTimePicker: true,
                        },
                      },
                    },
                    {
                      name: 'text_1_event',
                      layout: {
                        class: 'DefaultLayout',
                        config: {
                          label: 'TextField1 emitting events',
                          helpText: 'This is a help text',
                        },
                      },
                      model: {
                        class: 'SimpleInputModel',
                        config: {
                          defaultValue: 'hello world!',
                          validators: [{ class: 'required' }],
                        },
                      },
                      component: {
                        class: 'SimpleInputComponent',
                      },
                    },
                    {
                      name: 'text_2',
                      layout: {
                        class: 'DefaultLayout',
                        config: {
                          label: 'TextField2 with expression listening to text_1_event',
                          helpText: 'This is a help text',
                        },
                      },
                      model: {
                        class: 'SimpleInputModel',
                        config: {
                          defaultValue: 'hello world 2!',
                          validators: [
                            // {class: 'pattern', config: {pattern: /prefix.*/, description: "must start with prefix"}},
                            // {class: 'minLength', message: "@validator-error-custom-text_2", config: {minLength: 3}},
                          ],
                        },
                      },
                      component: {
                        class: 'SimpleInputComponent',
                      },
                      expressions: [
                        {
                          name: 'listenToText1Event',
                          config: {
                            template: `value & "__suffix"`,
                            conditionKind: 'jsonpointer',
                            condition: `/main_tab/tab_1/text_1_event::field.value.changed`,
                            target: `model.value`,
                          },
                        },
                        {
                          name: 'listenToText1Event2',
                          config: {
                            template: `formData.text_2 & "__hasJSONata"`,
                            conditionKind: 'jsonata',
                            condition: `$contains($lowercase(formData.text_1_event), "jsonata")`,
                            target: `model.value`,
                          },
                        },
                        {
                          name: 'listenToRepeatable1',
                          config: {
                            conditionKind: 'jsonata_query',
                            condition: `$count(**[name="repeatable_textfield_1"].children) >= 2`,
                            template: `formData.text_2 & "__repeatableMoreThan2"`,
                            target: `model.value`,
                          },
                        },
                      ],
                    },
                    {
                      name: 'text_7',
                      layout: {
                        class: 'DefaultLayout',
                        config: {
                          label: 'TextField with default wrapper defined',
                          helpText: 'This is a help text',
                        },
                      },
                      model: {
                        class: 'SimpleInputModel',
                        config: {
                          defaultValue: 'hello world 2!',
                          validators: [
                            {
                              class: 'pattern',
                              config: {
                                pattern: /prefix.*/,
                                description: 'must start with prefix',
                              },
                              groups: { include: ['minimumCreate'] },
                            },
                            {
                              class: 'minLength',
                              message: '@validator-error-custom-text_7',
                              config: { minLength: 3 },
                            },
                          ],
                        },
                      },
                      component: {
                        class: 'SimpleInputComponent',
                      },
                      // expressions: {
                      //     'model.value': {
                      //         template: `<%= _.get(model,'text_1_event','') %>`
                      //     }
                      // }
                    },
                    {
                      name: 'text_2_event',
                      model: {
                        class: 'SimpleInputModel',
                        config: {
                          defaultValue: 'hello world! component event',
                          validators: [{ class: 'required' }],
                        },
                      },
                      component: {
                        class: 'SimpleInputComponent',
                        config: {
                          tooltip: 'text_2_event tooltip',
                          type: 'text',
                        },
                      },
                    },
                    {
                      name: 'text_2_component_event',
                      layout: {
                        class: 'DefaultLayout',
                        config: {
                          label: 'TextField with default wrapper defined',
                          helpText: 'This is a help text',
                          tooltip: 'text_2_component_event layout tooltip',
                        },
                      },
                      model: {
                        class: 'SimpleInputModel',
                        config: {
                          defaultValue: 'hello world 2! component expression',
                        },
                      },
                      component: {
                        class: 'SimpleInputComponent',
                        config: {
                          tooltip: 'text_2_component_event component tooltip 22222',
                          type: 'text',
                        },
                      },
                      // expressions: [

                      // ]
                    },
                    {
                      name: 'text_3_event',
                      model: {
                        class: 'SimpleInputModel',
                        config: {
                          defaultValue: 'hello world! layout event',
                          validators: [{ class: 'required' }],
                        },
                      },
                      component: {
                        class: 'SimpleInputComponent',
                      },
                    },
                    {
                      name: 'text_3_layout_event',
                      layout: {
                        class: 'DefaultLayout',
                        config: {
                          label: 'TextField with default wrapper defined',
                          helpText: 'This is a help text',
                        },
                      },
                      model: {
                        class: 'SimpleInputModel',
                        config: {
                          defaultValue: 'hello world 2! layout expression',
                        },
                      },
                      component: {
                        class: 'SimpleInputComponent',
                      },
                      // expressions: {
                      //     'layout.visible': {
                      //         template: `<% if(_.isEmpty(_.get(model,'text_3_event',''))) {
                      //         return false;
                      //     } else {
                      //         return true;
                      //     } %>`
                      //     }
                      // }
                    },
                  ],
                },
              },
            },
            {
              name: 'tab_2',
              layout: {
                class: 'TabContentLayout',
                config: {
                  buttonLabel: 'Tab 2',
                },
              },
              component: {
                class: 'TabContentComponent',
                config: {
                  componentDefinitions: [
                    {
                      // first group component
                      name: 'group_1_component',
                      layout: {
                        class: 'DefaultLayout',
                        config: {
                          label: 'Group label',
                          helpText: 'Group help',
                        },
                      },
                      model: {
                        class: 'GroupModel',
                        config: {
                          defaultValue: {},
                        },
                      },
                      component: {
                        class: 'GroupComponent',
                        config: {
                          componentDefinitions: [
                            {
                              name: 'text_3',
                              layout: {
                                class: 'DefaultLayout',
                                config: {
                                  label: 'TextField with default wrapper defined',
                                  helpText: 'This is a help text',
                                },
                              },
                              model: {
                                class: 'SimpleInputModel',
                                config: {
                                  defaultValue: 'hello world 3!',
                                },
                              },
                              component: {
                                class: 'SimpleInputComponent',
                              },
                            },
                            {
                              name: 'text_4',
                              model: {
                                class: 'SimpleInputModel',
                                config: {
                                  defaultValue: 'hello world 4!',
                                },
                              },
                              component: {
                                class: 'SimpleInputComponent',
                              },
                            },
                            {
                              // second group component, nested in first group component
                              name: 'group_2_component',
                              layout: {
                                class: 'DefaultLayout',
                                config: {
                                  label: 'Group2 label',
                                  helpText: 'Group 2 help',
                                },
                              },
                              model: {
                                class: 'GroupModel',
                                config: {
                                  defaultValue: {},
                                },
                              },
                              component: {
                                class: 'GroupComponent',
                                config: {
                                  componentDefinitions: [
                                    {
                                      name: 'text_5',
                                      layout: {
                                        class: 'DefaultLayout',
                                        config: {
                                          label: 'TextField with default wrapper defined',
                                          helpText: 'This is a help text',
                                        },
                                      },
                                      model: {
                                        class: 'SimpleInputModel',
                                        config: {
                                          defaultValue: 'hello world 5!',
                                        },
                                      },
                                      component: {
                                        class: 'SimpleInputComponent',
                                      },
                                    },
                                  ],
                                },
                              },
                            },
                          ],
                        },
                      },
                      //                     expressions: {
                      //                         'layout.visible': {
                      //                             template: `<% if(_.isEmpty(_.get(model,'text_3_event',''))) {
                      //     return false;
                      //   } else {
                      //     return true;
                      //   } %>`
                      //                         }
                      //                     }
                    },
                    {
                      name: 'map_coverage',
                      layout: {
                        class: 'DefaultLayout',
                        config: {
                          label: 'Geographic coverage',
                          helpText: 'Draw or import the geographic coverage area.',
                        },
                      },
                      model: {
                        class: 'MapModel',
                        config: {
                          defaultValue: { type: 'FeatureCollection', features: [] },
                        },
                      },
                      component: {
                        class: 'MapComponent',
                        config: {
                          zoom: 4,
                          center: [-24.67, 134.07],
                          enableImport: true,
                        },
                      },
                    },
                    {
                      name: 'file_upload_1',
                      layout: {
                        class: 'DefaultLayout',
                        config: {
                          label: 'File upload',
                          helpText: 'Attach one or more files to this record.',
                        },
                      },
                      model: {
                        class: 'FileUploadModel',
                        config: {
                          defaultValue: [],
                        },
                      },
                      component: {
                        class: 'FileUploadComponent',
                        config: {
                          allowUploadWithoutSave: true,
                          companionUrl: '/companion',
                          enabledSources: ['dropbox', 'googleDrive', 'onedrive'],
                          uppyDashboardNote: 'Maximum upload size: 1 Gb per file',
                        },
                      },
                    },
                    {
                      name: 'repeatable_textfield_1',
                      model: {
                        class: 'RepeatableModel',
                        config: {
                          defaultValue: ['hello world from repeatable, default!'],
                        },
                      },
                      component: {
                        class: 'RepeatableComponent',
                        config: {
                          elementTemplate: {
                            name: null,
                            model: {
                              class: 'SimpleInputModel',
                              config: {
                                newEntryValue: 'hello world from elementTemplate!',
                                validators: [
                                  {
                                    class: 'pattern',
                                    config: {
                                      pattern: /prefix.*/,
                                      description: 'must start with prefix',
                                    },
                                  },
                                  {
                                    class: 'minLength',
                                    message: '@validator-error-custom-example_repeatable',
                                    config: { minLength: 3 },
                                  },
                                ],
                              },
                            },
                            component: {
                              class: 'SimpleInputComponent',
                              config: {
                                wrapperCssClasses: 'col',
                                type: 'text',
                              },
                            },
                            layout: {
                              class: 'RepeatableElementLayout',
                              config: {
                                hostCssClasses: 'row align-items-start',
                              },
                            },
                          },
                        },
                      },
                      layout: {
                        class: 'DefaultLayout',
                        config: {
                          label: 'Repeatable TextField with default wrapper defined',
                          helpText: 'Repeatable component help text',
                        },
                      },
                      // expressions: {
                      //     'layout.visible': {
                      //         template: `<% if(_.isEmpty(_.get(model,'text_3_event',''))) {
                      //         return false;
                      //     } else {
                      //         return true;
                      //     } %>`
                      //     }
                      // }
                    },
                  ],
                },
              },
            },
          ],
        },
      },
    },
    {
      name: 'repeatable_group_1',
      model: {
        class: 'RepeatableModel',
        config: {
          defaultValue: [{ text_3: 'hello world from repeating groups' }],
        },
      },
      component: {
        class: 'RepeatableComponent',
        config: {
          elementTemplate: {
            name: null,
            // first group component
            model: {
              class: 'GroupModel',
              config: {
                newEntryValue: { text_3: 'hello world 3!' },
              },
            },
            component: {
              class: 'GroupComponent',
              config: {
                wrapperCssClasses: 'col',
                componentDefinitions: [
                  {
                    name: 'text_3',
                    model: {
                      class: 'SimpleInputModel',
                      config: {
                        validators: [
                          {
                            class: 'minLength',
                            message: '@validator-error-custom-text_3',
                            config: { minLength: 3 },
                            groups: { exclude: ['transitionDraftToSubmitted'] },
                          },
                        ],
                      },
                    },
                    component: {
                      class: 'SimpleInputComponent',
                      config: {
                        type: 'text',
                      },
                    },
                  },
                ],
              },
            },
            layout: {
              class: 'RepeatableElementLayout',
              config: {
                hostCssClasses: 'row align-items-start',
              },
            },
          },
        },
      },
      layout: {
        class: 'DefaultLayout',
        config: {
          label: 'Repeatable TextField not inside the tab with default wrapper defined',
          helpText: 'Repeatable component help text',
        },
      },
    },
    {
      name: 'save_button',
      component: {
        class: 'SaveButtonComponent',
        config: {
          label: 'Save',
          labelSaving: 'Saving...',
        },
      },
    },
    {
      name: 'tab_nav_buttons',
      component: {
        class: 'TabNavButtonComponent',
        config: {
          prevLabel: 'Previous',
          nextLabel: 'Next',
          targetTabContainerId: 'main_tab',
          endDisplayMode: 'disabled',
        },
      },
    },
    {
      name: 'cancel_button',
      component: {
        class: 'CancelButtonComponent',
        config: {
          label: 'Cancel',
          confirmationTitle: 'Confirm',
          confirmationMessage: 'Are you sure you want to cancel?',
          cancelButtonMessage: 'No',
          confirmButtonMessage: 'Yes',
        },
      },
    },
    {
      name: 'validation_summary_1',
      component: { class: 'ValidationSummaryComponent' },
    },
    // {
    //   module: 'custom',
    //   component: {
    //     class: 'FormCustomComponent',
    //   },
    //   model: {
    //     class: 'FormCustomFieldModel',
    //     config: {
    //       name: 'project_name',
    //       label: 'Project Name',
    //       type: 'text',
    //       defaultValue: 'hello world!'
    //     }
    //   }
    // }
  ],
};
module.exports = formConfig;
