import {
  FormOverride,
  ContentComponentName,
  RepeatableComponentName,
  RepeatableFieldComponentDefinitionFrame,
 ReusableComponentName,
 SimpleInputComponentName,
 GroupFieldComponentName,
 DropdownInputComponentName,
 CheckboxInputComponentName,
 TypeaheadInputComponentName,
 FileUploadComponentName,
 DateInputComponentName,
 RichTextEditorComponentName,
 isTypeFieldDefinitionName,
 ILogger,
 handlebarsCompile,
} from '../../src';

let expect: Chai.ExpectStatic;

before(async () => {
  const chai = await import('chai');
  expect = chai.expect;
});

function createLogger(): ILogger {
  const noop = () => undefined;
  return {
    silly: noop,
    verbose: noop,
    trace: noop,
    debug: noop,
    log: noop,
    info: noop,
    warn: noop,
    error: noop,
    crit: noop,
    fatal: noop,
    silent: noop,
    blank: noop,
  };
}

function createExpression(name: string) {
  return {
    name,
    config: {
      template: name,
    },
  };
}

const normalizeTemplate = (template: string): string => template.replace(/\s+/g, ' ').trim();

describe('FormOverride reusable expansion', () => {
  it('keeps wrapper expressions intact when reusable and additional items both define expressions', () => {
    const formOverride = new FormOverride(createLogger());
    const wrapperExpressions = [createExpression('wrapper-a'), createExpression('wrapper-b')];
    const reusableExpressions = [createExpression('reusable-a'), createExpression('reusable-b')];
    const additionalExpressions = [createExpression('additional-a'), createExpression('additional-b')];

    const result = formOverride.applyOverridesReusable(
      [
        {
          name: 'wrapper',
          component: {
            class: ReusableComponentName,
            config: {
              componentDefinitions: [
                {
                  name: 'shared-field',
                  component: {
                    class: SimpleInputComponentName,
                  },
                  expressions: additionalExpressions,
                },
              ],
            },
          },
          expressions: wrapperExpressions,
          overrides: {
            reusableFormName: 'shared-form',
          },
        } as never,
      ],
      {
        'shared-form': [
          {
            name: 'shared-field',
            component: {
              class: SimpleInputComponentName,
            },
            expressions: reusableExpressions,
          } as never,
        ],
      }
    );

    expect(result).to.have.length(1);
    expect(result[0].name).to.equal('shared-field');
    expect(result[0].expressions).to.deep.equal(wrapperExpressions);
  });

  it('replaces expression arrays instead of merging them by index', () => {
    const formOverride = new FormOverride(createLogger());
    const reusableExpressions = [createExpression('reusable-a'), createExpression('reusable-b')];
    const additionalExpressions = [createExpression('additional-a'), createExpression('additional-b')];

    const result = formOverride.applyOverridesReusable(
      [
        {
          name: 'wrapper',
          component: {
            class: ReusableComponentName,
            config: {
              componentDefinitions: [
                {
                  name: 'shared-field',
                  component: {
                    class: SimpleInputComponentName,
                  },
                  expressions: additionalExpressions,
                },
              ],
            },
          },
          overrides: {
            reusableFormName: 'shared-form',
          },
        } as never,
      ],
      {
        'shared-form': [
          {
            name: 'shared-field',
            component: {
              class: SimpleInputComponentName,
            },
            expressions: reusableExpressions,
          } as never,
        ],
      }
    );

    expect(result).to.have.length(1);
    expect(result[0].expressions).to.deep.equal(additionalExpressions);
  });

  it('preserves date formatting when rendering date content leaf values', () => {
    const formOverride = new FormOverride(createLogger());

    const result = (formOverride as any).renderLeafValue(
      {
        component: {
          class: ContentComponentName,
          config: {
            template: '<span data-value="{{content}}">{{formatDate content "DD/MM/YYYY"}}</span>',
          },
        },
      } as never,
      'project',
      ['startDate']
    );

    expect(result).to.equal('<span data-value="{{default (get project "startDate" "") ""}}">{{formatDate (get project "startDate" "") "DD/MM/YYYY"}}</span>');
  });

  it('reports component classes with default view transforms', () => {
    const formOverride = new FormOverride(createLogger());

    expect(formOverride.hasDefaultViewTransform(SimpleInputComponentName)).to.equal(true);
    expect(formOverride.hasDefaultViewTransform(DateInputComponentName)).to.equal(true);
    expect(formOverride.hasDefaultViewTransform(RepeatableComponentName)).to.equal(true);
    expect(formOverride.hasDefaultViewTransform(ContentComponentName)).to.equal(false);
    expect(formOverride.hasDefaultViewTransform('UnknownComponent')).to.equal(false);
    expect(formOverride.hasDefaultViewTransform(undefined)).to.equal(false);
  });

  it('renders dropdown leaf option labels in generated view templates', () => {
    const formOverride = new FormOverride(createLogger());

    const result = (formOverride as any).renderLeafValue(
      {
        component: {
          class: DropdownInputComponentName,
          config: {
            options: [
              { value: 'dataset', label: 'Dataset' },
              { value: 'software', label: 'Software' },
            ],
          },
        },
      } as never,
      'content',
      ['datatype']
    );

    expect(result).to.equal(
      '{{#if (eq (get content "datatype" "") "dataset")}}<span data-value="{{default (get content "datatype" "") ""}}">{{t "Dataset"}}</span>{{else}}{{#if (eq (get content "datatype" "") "software")}}<span data-value="{{default (get content "datatype" "") ""}}">{{t "Software"}}</span>{{else}}<span>{{default (get content "datatype" "") ""}}</span>{{/if}}{{/if}}'
    );
  });

  it('normalizes empty dropdown values before selecting the view template', () => {
    const formOverride = new FormOverride(createLogger());
    const options = [
      { value: 'heritage', label: 'Heritage' },
      { value: 'research', label: 'Research' },
    ];

    const transform = (value: unknown) =>
      formOverride.applyOverrideTransform(
        {
          name: 'retentionReason',
          component: {
            class: DropdownInputComponentName,
            config: { options },
          },
          model: {
            class: 'DropdownInputModel',
            config: { value },
          },
        } as never,
        'view',
        { phase: 'client' }
      );

    const getViewConfig = (value: unknown) =>
      transform(value).component.config as { content?: unknown; template?: string };

    const emptyArray = getViewConfig([]);
    expect(emptyArray.content).to.equal(undefined);
    expect(emptyArray.template).to.equal('<span></span>');

    const emptyValueArray = getViewConfig(['']);
    expect(emptyValueArray.content).to.equal(undefined);
    expect(emptyValueArray.template).to.equal('<span></span>');

    const emptyScalar = getViewConfig('');
    expect(emptyScalar.content).to.equal(undefined);
    expect(emptyScalar.template).to.equal('<span></span>');

    const mixedValues = getViewConfig(['', 'heritage']);
    expect(mixedValues.content).to.deep.equal({ value: 'heritage', label: 'Heritage' });
    expect(mixedValues.template).to.contain('content.label');

    const populatedValue = getViewConfig(['heritage']);
    expect(populatedValue.content).to.deep.equal({ value: 'heritage', label: 'Heritage' });
    expect(populatedValue.template).to.contain('content.label');

    const populatedValues = getViewConfig(['heritage', 'research']);
    expect(populatedValues.content).to.deep.equal([
      { value: 'heritage', label: 'Heritage' },
      { value: 'research', label: 'Research' },
    ]);
    expect(populatedValues.template).to.contain('<li data-value="{{this.value}}">');
  });

  it('renders checkbox leaf option labels in generated view templates', () => {
    const formOverride = new FormOverride(createLogger());

    const result = (formOverride as any).renderLeafValue(
      {
        component: {
          class: CheckboxInputComponentName,
          config: {
            options: [
              { value: 'tropicalEcoSystems', label: 'Tropical Eco Systems' },
              { value: 'industriesEconomies', label: 'Industries and Economies' },
            ],
          },
        },
      } as never,
      'content',
      ['research_themes']
    );

    expect(result).to.equal(
      '{{#if (get content "research_themes" "")}}{{#if (isArray (get content "research_themes" ""))}}<ul>{{#each (get content "research_themes" "")}}{{#if (eq this "tropicalEcoSystems")}}<li data-value="{{this}}">{{t "Tropical Eco Systems"}}</li>{{else}}{{#if (eq this "industriesEconomies")}}<li data-value="{{this}}">{{t "Industries and Economies"}}</li>{{else}}<li>{{this}}</li>{{/if}}{{/if}}{{/each}}</ul>{{else}}{{#if (eq (get content "research_themes" "") "tropicalEcoSystems")}}<span data-value="{{default (get content "research_themes" "") ""}}">{{t "Tropical Eco Systems"}}</span>{{else}}{{#if (eq (get content "research_themes" "") "industriesEconomies")}}<span data-value="{{default (get content "research_themes" "") ""}}">{{t "Industries and Economies"}}</span>{{else}}<span>{{default (get content "research_themes" "") ""}}</span>{{/if}}{{/if}}{{/if}}{{/if}}'
    );
  });

  it('renders typeahead leaf values using the configured label field', () => {
    const formOverride = new FormOverride(createLogger());

    const result = (formOverride as any).renderLeafValue(
      {
        component: {
          class: TypeaheadInputComponentName,
          config: {
            labelField: 'dc_description',
            valueField: 'value',
          },
        },
      } as never,
      'content',
      ['fundingSource']
    );

    expect(result).to.contain('(get (get content "fundingSource" "") "dc_description" "")');
    expect(result).to.contain('{{{renderMetadataValue (get content "fundingSource" "")}}}');
    expect(result).to.not.equal('{{default (get content "fundingSource" "") ""}}');
  });

  it('renders legacy typeahead option objects as content in view mode', () => {
    const formOverride = new FormOverride(createLogger());

    const transformed = formOverride.applyOverrideTransform(
      {
        name: 'fundingSource',
        component: {
          class: TypeaheadInputComponentName,
          config: {
            valueMode: 'optionObject',
          },
        },
        model: {
          class: 'TypeaheadInputModel',
          config: {
            value: {
              label: 'Legacy funding source',
              value: 'legacy-funding-source',
            },
          },
        },
      } as never,
      'view',
      { phase: 'client' }
    );

    expect(transformed.component.class).to.equal(ContentComponentName);
    expect((transformed.component.config as { content?: unknown } | undefined)?.content).to.equal(
      'Legacy funding source'
    );
  });

  it('renders configured typeahead option objects as content in view mode', () => {
    const formOverride = new FormOverride(createLogger());

    const transformed = formOverride.applyOverrideTransform(
      {
        name: 'research-master-project-id',
        component: {
          class: TypeaheadInputComponentName,
          config: {
            labelField: 'dc_title',
            valueField: 'grant_number',
            valueMode: 'optionObject',
            optionObjectFields: {
              dc_title: 'dc_title',
              grant_number: 'grant_number',
            },
          },
        },
        model: {
          class: 'TypeaheadInputModel',
          config: {
            value: {
              dc_title: 'Improving the transition of agricultural students between vocational and higher education - RSH/4414',
              grant_number: '0980024219',
            },
          },
        },
      } as never,
      'view',
      { phase: 'client' }
    );

    expect(transformed.component.class).to.equal(ContentComponentName);
    expect((transformed.component.config as { content?: unknown } | undefined)?.content).to.equal(
      'Improving the transition of agricultural students between vocational and higher education - RSH/4414'
    );
  });

  it('renders configured typeahead objects when stored keys differ from source paths', () => {
    const formOverride = new FormOverride(createLogger());

    const transformed = formOverride.applyOverrideTransform(
      {
        name: 'research-master-project-id',
        component: {
          class: TypeaheadInputComponentName,
          config: {
            labelField: 'metadata.dc_title',
            valueField: 'metadata.grant_number',
            valueMode: 'optionObject',
            optionObjectFields: {
              projectTitle: 'metadata.dc_title',
              projectGrantNumber: 'metadata.grant_number',
            },
          },
        },
        model: {
          class: 'TypeaheadInputModel',
          config: {
            value: {
              projectTitle: 'Mapped project title',
              projectGrantNumber: 'RSH/4414',
            },
          },
        },
      } as never,
      'view',
      { phase: 'client' }
    );

    expect(transformed.component.class).to.equal(ContentComponentName);
    expect((transformed.component.config as { content?: unknown } | undefined)?.content).to.equal(
      'Mapped project title'
    );
  });

  it('renders repeatable typeahead objects without stringifying them', () => {
    const formOverride = new FormOverride(createLogger());

    const result = (formOverride as any).generateTemplateForComponent(
      {
        name: 'foaf:fundedBy_foaf:Agent',
        component: {
          class: RepeatableComponentName,
          config: {
            elementTemplate: {
              name: '',
              component: {
                class: TypeaheadInputComponentName,
                config: {
                  labelField: 'dc_description',
                  valueField: 'value',
                },
              },
            },
          },
        },
      } as never,
      'content'
    );

    expect(result).to.contain('(get this "dc_description" "")');
    expect(result).to.contain('{{{renderMetadataValue this}}}');
    expect(result).to.not.contain('{{default this ""}}');
  });

  it('renders repeatable content objects using display fields after child transforms', () => {
    const formOverride = new FormOverride(createLogger());

    const result = (formOverride as any).generateTemplateForComponent(
      {
        name: 'foaf:fundedBy_vivo:Grant',
        component: {
          class: RepeatableComponentName,
          config: {
            elementTemplate: {
              name: '',
              component: {
                class: ContentComponentName,
                config: {
                  template: '<span>{{content}}</span>',
                },
              },
            },
          },
        },
      } as never,
      'content'
    );

    expect(result).to.contain('(get this "dc_title" "")');
    expect(result).to.contain('{{{renderMetadataValue this}}}');
    expect(result).to.not.contain('{{default this ""}}');
  });

  it('renders utf8_name object values as display labels', () => {
    const formOverride = new FormOverride(createLogger());

    const result = (formOverride as any).renderDisplayValue('content');

    expect(result).to.contain('(get content "utf8_name" "")');
    expect(result).to.contain('{{{plaintextToHtml (get content "utf8_name" "")}}}');
  });

  it('renders file upload leaf values as attachment download links', () => {
    const formOverride = new FormOverride(createLogger());

    const result = (formOverride as any).renderLeafValue(
      {
        component: {
          class: FileUploadComponentName,
        },
      } as never,
      'content',
      ['contractualObligations_licences']
    );

    expect(result).to.contain('attachmentDownloadUrl this oid branding portal');
    expect(result).to.contain('<a href="{{attachmentDownloadUrl this oid branding portal}}"');
    expect(result).to.contain('target="_blank"');
    expect(result).to.contain('rel="noopener noreferrer"');
  });

  it('expands contributor_dmp_permissions wrapper with replaceName, wrapper expressions, and syncSources', () => {
    const formOverride = new FormOverride(createLogger());
    const wrapperExpressions = [
      createExpression('projectType-sync'),
      createExpression('ciRhd-sync'),
      createExpression('ciNotRhd-sync'),
    ];
    const syncSourcesOverride = [
      { fieldName: 'contributor_ci_rhd', visibilityConditionField: 'project-type', visibilityConditionValues: ['rhd'] },
      { fieldName: 'contributor_ci_not_rhd', visibilityConditionField: 'project-type', visibilityConditionValues: ['staff'] },
    ];

    const result = formOverride.applyOverridesReusable(
      [
        {
          name: 'contributor_dmp_permissions',
          component: {
            class: ReusableComponentName,
            config: {
              componentDefinitions: [
                {
                  name: 'contributor_dmp_permissions_repeatable',
                  overrides: {
                    replaceName: 'contributor_dmp_permissions',
                  },
                  component: {
                    class: 'RepeatableComponent',
                    config: {
                      syncSources: syncSourcesOverride,
                    },
                  },
                },
              ],
            },
          },
          expressions: wrapperExpressions,
          overrides: {
            reusableFormName: 'contributor-dmp-permissions',
          },
        } as never,
      ],
      {
        'contributor-dmp-permissions': [
          {
            name: 'contributor_dmp_permissions_repeatable',
            component: {
              class: 'RepeatableComponent',
              config: {
                addButtonShow: true,
                allowZeroRows: true,
                hideWhenZeroRows: false,
                syncSources: [],
                elementTemplate: {
                  name: '',
                  component: { class: ReusableComponentName, config: { componentDefinitions: [] } },
                },
              },
            },
            model: { class: 'RepeatableModel' },
            layout: { class: 'DefaultLayout' },
          } as never,
        ],
      }
    );

    expect(result).to.have.length(1);
    expect(result[0].name).to.equal('contributor_dmp_permissions');
    expect(result[0].expressions).to.deep.equal(wrapperExpressions);

    if (!isTypeFieldDefinitionName<RepeatableFieldComponentDefinitionFrame>(result[0].component, RepeatableComponentName)) {
      throw new Error(`Expected RepeatableFieldComponentDefinitionFrame but got ${result[0].component?.class}`);
    }

    expect(result[0].component.config?.syncSources).to.deep.equal(syncSourcesOverride);
    expect(result[0].component.config?.addButtonShow).to.equal(true);
    expect(result[0].component.config?.elementTemplate).to.exist;
  });

  it('applies nested contributor_dmp_permissions field overrides inside the repeatable element template', () => {
    const formOverride = new FormOverride(createLogger());

    const result = formOverride.applyOverridesReusable(
      [
        {
          name: 'contributor_dmp_permissions',
          component: {
            class: ReusableComponentName,
            config: {
              componentDefinitions: [
                {
                  name: 'contributor_dmp_permissions_repeatable',
                  overrides: {
                    replaceName: 'contributor_dmp_permissions',
                  },
                  component: {
                    class: 'RepeatableComponent',
                    config: {
                      elementTemplate: {
                        component: {
                          config: {
                            componentDefinitions: [
                              {
                                name: 'standard_contributor_fields_lookup_only_group',
                                component: {
                                  class: 'GroupComponent',
                                  config: {
                                    componentDefinitions: [
                                      {
                                        name: 'standard_contributor_fields_lookup_only_reusable',
                                        component: {
                                          class: ReusableComponentName,
                                          config: {
                                            componentDefinitions: [
                                              {
                                                name: 'name',
                                                component: {
                                                  class: 'TypeaheadInputComponent',
                                                  config: {
                                                    labelField: 'text_full_name',
                                                    valueField: 'text_full_name',
                                                  },
                                                },
                                              },
                                              {
                                                name: 'email',
                                                component: {
                                                  class: 'SimpleInputComponent',
                                                  config: {
                                                    onItemSelect: { rawPath: 'email' },
                                                  },
                                                },
                                              },
                                              {
                                                name: 'orcid',
                                                component: {
                                                  class: 'SimpleInputComponent',
                                                  config: {
                                                    onItemSelect: { rawPath: 'orcid' },
                                                  },
                                                },
                                              },
                                            ],
                                          },
                                        },
                                      },
                                    ],
                                  },
                                },
                              },
                            ],
                          },
                        },
                      },
                    },
                  },
                },
              ],
            },
          },
          overrides: {
            reusableFormName: 'contributor-dmp-permissions',
          },
        } as never,
      ],
      {
        'standard-contributor-fields-lookup-only': [
          {
            name: 'name',
            component: {
              class: 'TypeaheadInputComponent',
              config: {
                labelField: 'metadata.fullName',
                valueField: 'oid',
              },
            },
          },
          {
            name: 'email',
            component: {
              class: 'SimpleInputComponent',
              config: {
                onItemSelect: { rawPath: 'metadata.email' },
              },
            },
          },
          {
            name: 'orcid',
            component: {
              class: 'SimpleInputComponent',
              config: {
                onItemSelect: { rawPath: 'metadata.orcid' },
              },
            },
          },
        ] as never,
        'contributor-dmp-permissions': [
          {
            name: 'contributor_dmp_permissions_repeatable',
            component: {
              class: 'RepeatableComponent',
              config: {
                elementTemplate: {
                  name: '',
                  component: {
                    class: ReusableComponentName,
                    config: {
                      componentDefinitions: [
                        {
                          name: 'standard_contributor_fields_lookup_only_group',
                          component: {
                            class: 'GroupComponent',
                            config: {
                              componentDefinitions: [
                                {
                                  name: 'standard_contributor_fields_lookup_only_reusable',
                                  overrides: { reusableFormName: 'standard-contributor-fields-lookup-only' },
                                  component: { class: ReusableComponentName, config: { componentDefinitions: [] } },
                                },
                              ],
                            },
                          },
                        },
                      ],
                    },
                  },
                },
              },
            },
          } as never,
        ],
      }
    );

    const repeatableComponent = result[0].component as RepeatableFieldComponentDefinitionFrame;
    const nestedGroup = (repeatableComponent.config?.elementTemplate as any)?.component?.config?.componentDefinitions?.[0];
    const nestedReusable = nestedGroup?.component?.config?.componentDefinitions?.[0];
    const nestedFields = nestedReusable?.component?.config?.componentDefinitions;

    expect(nestedFields).to.have.length(3);
    expect(nestedFields[0].component.config.labelField).to.equal('text_full_name');
    expect(nestedFields[0].component.config.valueField).to.equal('text_full_name');
    expect(nestedFields[1].component.config.onItemSelect.rawPath).to.equal('email');
    expect(nestedFields[2].component.config.onItemSelect.rawPath).to.equal('orcid');
  });

  it('skips hidden simple inputs when rendering group view rows', () => {
    const formOverride = new FormOverride(createLogger());

    const transformed = formOverride.applyOverrideTransform(
      {
        name: 'person',
        component: {
          class: GroupFieldComponentName,
          config: {
            componentDefinitions: [
              {
                name: 'name',
                component: {
                  class: SimpleInputComponentName,
                  config: { label: 'Name' },
                },
              },
              {
                name: 'identifier',
                component: {
                  class: SimpleInputComponentName,
                  config: { label: 'Identifier', type: 'hidden' },
                },
              },
              {
                name: 'nickname',
                component: {
                  class: SimpleInputComponentName,
                  config: { label: 'Nickname', visible: false },
                },
              },
            ],
          },
        },
      } as never,
      'view',
      { phase: 'client' }
    );

    expect(transformed.component.class).to.equal(ContentComponentName);
    const template = normalizeTemplate((transformed.component.config as { template?: string }).template ?? '');
    expect(template).to.contain('{{t "Name"}}');
    expect(template).to.not.contain('{{t "Identifier"}}');
    expect(template).to.not.contain('{{t "Nickname"}}');
    expect(template).to.not.contain('identifier');
    expect(template).to.not.contain('nickname');
  });

  it('skips hidden simple inputs when rendering repeatable group tables', () => {
    const formOverride = new FormOverride(createLogger());

    const transformed = formOverride.applyOverrideTransform(
      {
        name: 'contributors',
        component: {
          class: RepeatableComponentName,
          config: {
            elementTemplate: {
              name: '',
              component: {
                class: GroupFieldComponentName,
                config: {
                  componentDefinitions: [
                    {
                      name: 'name',
                      component: {
                        class: SimpleInputComponentName,
                        config: { label: 'Name' },
                      },
                    },
                    {
                      name: 'orcid',
                      component: {
                        class: SimpleInputComponentName,
                        config: { label: 'ORCID', type: 'hidden' },
                      },
                    },
                    {
                      name: 'nickname',
                      component: {
                        class: SimpleInputComponentName,
                        config: { label: 'Nickname', visible: false },
                      },
                    },
                  ],
                },
              },
            },
          },
        },
        model: {
          class: 'RepeatableModel',
          config: {
            value: [
              {
                name: 'Ada Lovelace',
                orcid: '0000-0000-0000-0000',
              },
            ],
          },
        },
      } as never,
      'view',
      { phase: 'client' }
    );

    expect(transformed.component.class).to.equal(ContentComponentName);
    const template = normalizeTemplate((transformed.component.config as { template?: string }).template ?? '');
    expect(template).to.contain('rb-view-repeatable-table');
    expect(template).to.contain('<th>{{t "Name"}}</th>');
    expect(template).to.not.contain('<th>{{t "ORCID"}}</th>');
    expect(template).to.not.contain('<th>{{t "Nickname"}}</th>');
    expect(template).to.not.contain('get this "orcid"');
    expect(template).to.not.contain('get this "nickname"');
  });

  it('renders repeatable table values from unflattened leaf components', () => {
    const formOverride = new FormOverride(createLogger());

    const transformed = formOverride.applyOverrideTransform(
      {
        name: 'events',
        component: {
          class: RepeatableComponentName,
          config: {
            elementTemplate: {
              name: '',
              component: {
                class: GroupFieldComponentName,
                config: {
                  componentDefinitions: [
                    {
                      name: 'startDate',
                      component: {
                        class: DateInputComponentName,
                        config: { label: 'Start date', dateFormat: 'DD/MM/YYYY' },
                      },
                    },
                    {
                      name: 'endDate',
                      component: {
                        class: DateInputComponentName,
                        config: { label: 'End date' },
                      },
                    },
                    {
                      name: 'description',
                      component: {
                        class: RichTextEditorComponentName,
                        config: { label: 'Description', outputFormat: 'markdown' },
                      },
                    },
                    {
                      name: 'person',
                      component: {
                        class: SimpleInputComponentName,
                        config: { label: 'Person' },
                      },
                    },
                  ],
                },
              },
            },
          },
        },
        model: {
          class: 'RepeatableModel',
          config: {
            value: [
              {
                startDate: '2026-07-09',
                endDate: '2026-07-10',
                description: '**Details**',
                person: { dc_title: 'Ada Lovelace' },
              },
            ],
          },
        },
      } as never,
      'view',
      { phase: 'client' }
    );

    expect(transformed.component.class).to.equal(ContentComponentName);
    const template = normalizeTemplate((transformed.component.config as { template?: string }).template ?? '');
    expect(template).to.contain('<span data-value="{{default (get this "startDate" "") ""}}">{{formatDate (get this "startDate" "") "DD/MM/YYYY"}}</span>');
    expect(template).to.contain('<span data-value="{{default (get this "endDate" "") ""}}">{{formatDate (get this "endDate" "") "YYYY/MM/DD"}}</span>');
    expect(template).to.contain('{{{markdownToHtml (get this "description" "") "markdown"}}}');
    expect(template).to.contain('(get (get this "person" "") "dc_title" "")');
    expect(template).to.contain('{{{renderMetadataValue (get this "person" "")}}}');
    expect(template).to.not.contain('{{default (get this "person" "") ""}}');
  });

  it('renders standalone url simple inputs as links without changing plain simple inputs', () => {
    const formOverride = new FormOverride(createLogger());

    const urlTransformed = formOverride.applyOverrideTransform(
      {
        name: 'projectUrl',
        component: {
          class: SimpleInputComponentName,
          config: { type: 'url' },
        },
        model: {
          class: 'SimpleInputModel',
          config: {
            value: 'https://example.test/project',
          },
        },
      } as never,
      'view',
      { phase: 'client' }
    );

    expect(urlTransformed.component.class).to.equal(ContentComponentName);
    expect((urlTransformed.component.config as { content?: string }).content).to.equal('https://example.test/project');
    const urlTemplate = normalizeTemplate((urlTransformed.component.config as { template?: string }).template ?? '');
    expect(urlTemplate).to.contain('<a href="{{default content ""}}" target="_blank" rel="noopener noreferrer">{{default content ""}}</a>');
    const renderedUrlTemplate = handlebarsCompile(urlTemplate)({ content: 'https://example.test/project' });
    expect(renderedUrlTemplate).to.contain('<a href="https://example.test/project" target="_blank" rel="noopener noreferrer">https://example.test/project</a>');

    const plainTransformed = formOverride.applyOverrideTransform(
      {
        name: 'projectTitle',
        component: {
          class: SimpleInputComponentName,
          config: { type: 'text' },
        },
        model: {
          class: 'SimpleInputModel',
          config: {
            value: 'Project title',
          },
        },
      } as never,
      'view',
      { phase: 'client' }
    );

    expect(plainTransformed.component.class).to.equal(ContentComponentName);
    expect((plainTransformed.component.config as { content?: string }).content).to.equal('Project title');
    const plainTemplate = normalizeTemplate((plainTransformed.component.config as { template?: string }).template ?? '');
    expect(plainTemplate).to.equal('<span>{{content}}</span>');
    expect(plainTemplate).to.not.contain('<a ');
  });

  it('renders url simple inputs as links in repeatable group tables', () => {
    const formOverride = new FormOverride(createLogger());

    const transformed = formOverride.applyOverrideTransform(
      {
        name: 'resources',
        component: {
          class: RepeatableComponentName,
          config: {
            elementTemplate: {
              name: '',
              component: {
                class: GroupFieldComponentName,
                config: {
                  componentDefinitions: [
                    {
                      name: 'title',
                      component: {
                        class: SimpleInputComponentName,
                        config: { label: 'Title' },
                      },
                    },
                    {
                      name: 'link',
                      component: {
                        class: SimpleInputComponentName,
                        config: { label: 'Link', type: 'url' },
                      },
                    },
                  ],
                },
              },
            },
          },
        },
        model: {
          class: 'RepeatableModel',
          config: {
            value: [
              {
                title: 'Repository',
                link: 'https://example.test/repository',
              },
            ],
          },
        },
      } as never,
      'view',
      { phase: 'client' }
    );

    expect(transformed.component.class).to.equal(ContentComponentName);
    const template = normalizeTemplate((transformed.component.config as { template?: string }).template ?? '');
    expect(template).to.contain('<a href="{{default (get this "link" "") ""}}" target="_blank" rel="noopener noreferrer">{{default (get this "link" "") ""}}</a>');
    const renderedTemplate = handlebarsCompile(template)({
      content: [
        {
          title: 'Repository',
          link: 'https://example.test/repository',
        },
      ],
    });
    expect(renderedTemplate).to.contain('<a href="https://example.test/repository" target="_blank" rel="noopener noreferrer">https://example.test/repository</a>');
  });

  it('substitutes the reusable repeatable-list item class', () => {
    const formOverride = new FormOverride(createLogger());

    const transformed = formOverride.applyOverrideTransform(
      {
        name: 'keywords',
        component: {
          class: RepeatableComponentName,
          config: {
            elementTemplate: {
              name: 'keyword',
              component: {class: SimpleInputComponentName},
              model: {class: 'SimpleInputModel'},
            },
          },
        },
        model: {class: 'RepeatableModel', config: {value: ['one']}},
      } as never,
      'view',
      {
        phase: 'client',
        reusableFormDefs: {
          'view-template-repeatable-list': [
            {
              name: 'repeatable-list-template',
              component: {
                class: ContentComponentName,
                config: {
                  template: '{{#if [[rootExpr]]}}<div>{{#each [[rootExpr]]}}<div class="[[itemClass]]">[[itemBodyHtml]]</div>{{/each}}</div>{{/if}}',
                },
              },
            } as never,
          ],
        },
      }
    );

    const template = normalizeTemplate((transformed.component.config as {template?: string}).template ?? '');
    expect(template).to.contain('class="rb-view-repeatable-card rb-view-repeatable-card--leaf"');
    expect(template).to.not.contain('[[itemClass]]');
  });

  it('applies template-only view overrides to repeatable content transforms', () => {
    const formOverride = new FormOverride(createLogger());
    const customTemplate = '<div class="custom">{{#each content}}<span>{{title}}</span>{{/each}}</div>';

    const transformed = formOverride.applyOverrideTransform(
      {
        name: 'resources',
        component: {
          class: RepeatableComponentName,
          config: {
            elementTemplate: {
              name: '',
              component: {
                class: GroupFieldComponentName,
                config: {
                  componentDefinitions: [
                    {
                      name: 'title',
                      component: {
                        class: SimpleInputComponentName,
                        config: { label: 'Title' },
                      },
                    },
                  ],
                },
              },
            },
          },
        },
        model: {
          class: 'RepeatableModel',
          config: {
            value: [
              { title: 'Kept' },
              { title: '' },
              { title: 'Also kept' },
            ],
          },
        },
        overrides: {
          formModeClasses: {
            view: {
              template: customTemplate,
            },
          },
        },
      } as never,
      'view',
      { phase: 'client' }
    );

    expect(transformed.component.class).to.equal(ContentComponentName);
    expect((transformed.component.config as { template?: string }).template).to.equal(customTemplate);
    expect((transformed.component.config as { content?: unknown[] }).content).to.deep.equal([
      { title: 'Kept' },
      { title: 'Also kept' },
    ]);
  });

  it('applies template-only view overrides to leaf simple input content transforms', () => {
    const formOverride = new FormOverride(createLogger());
    const customTemplate = '<strong>{{content}}</strong>';

    const transformed = formOverride.applyOverrideTransform(
      {
        name: 'title',
        component: {
          class: SimpleInputComponentName,
          config: {visible: false},
        },
        layout: {class: 'DefaultLayout', config: {visible: false}},
        model: {
          class: 'SimpleInputModel',
          config: {
            value: 'Project title',
          },
        },
        overrides: {
          formModeClasses: {
            view: {
              template: customTemplate,
            },
          },
        },
      } as never,
      'view',
      { phase: 'client' }
    );

    expect(transformed.component.class).to.equal(ContentComponentName);
    expect((transformed.component.config as { template?: string }).template).to.equal(customTemplate);
    expect((transformed.component.config as { content?: string }).content).to.equal('Project title');
    expect((transformed.component.config as { visible?: boolean }).visible).to.equal(true);
    expect((transformed.layout?.config as { visible?: boolean }).visible).to.equal(true);

    const emptyTransformed = formOverride.applyOverrideTransform(
      {
        name: 'title',
        component: {class: SimpleInputComponentName, config: {visible: false}},
        layout: {class: 'DefaultLayout', config: {visible: false}},
        model: {class: 'SimpleInputModel', config: {value: ''}},
        overrides: {formModeClasses: {view: {template: customTemplate}}},
      } as never,
      'view',
      {phase: 'client'}
    );
    expect((emptyTransformed.component.config as {visible?: boolean}).visible).to.equal(true);
    expect((emptyTransformed.layout?.config as {visible?: boolean}).visible).to.equal(false);
  });

  it('ignores templates on identity view overrides', () => {
    const formOverride = new FormOverride(createLogger());

    const transformed = formOverride.applyOverrideTransform(
      {
        name: 'title',
        component: {
          class: SimpleInputComponentName,
        },
        overrides: {
          formModeClasses: {
            view: {
              component: SimpleInputComponentName,
              template: '<strong>{{content}}</strong>',
            },
          },
        },
      } as never,
      'view',
      { phase: 'client' }
    );

    expect(transformed.component.class).to.equal(SimpleInputComponentName);
    expect((transformed.component.config as { template?: string } | undefined)?.template).to.equal(undefined);
  });

  it('uses reusable view templates for url simple input links', () => {
    const formOverride = new FormOverride(createLogger());

    const transformed = formOverride.applyOverrideTransform(
      {
        name: 'projectUrl',
        component: {
          class: SimpleInputComponentName,
          config: { type: 'url' },
        },
        model: {
          class: 'SimpleInputModel',
          config: {
            value: 'https://example.test/project',
          },
        },
      } as never,
      'view',
      {
        phase: 'client',
        reusableFormDefs: {
          'view-template-leaf-link': [
            {
              name: 'x',
              component: {
                class: ContentComponentName,
                config: {
                  template: '<span class="custom-link">{{[[valueExpr]]}}</span>',
                },
              },
            } as never,
          ],
        },
      }
    );

    expect(transformed.component.class).to.equal(ContentComponentName);
    const template = normalizeTemplate((transformed.component.config as { template?: string }).template ?? '');
    expect(template).to.equal('<span class="custom-link">{{content}}</span>');
    expect(template).to.not.contain('target="_blank"');
  });
});
