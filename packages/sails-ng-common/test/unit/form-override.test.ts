import { FormOverride } from '../../src/config/form-override.model';
import { ContentComponentName } from '../../src/config/component/content.outline';
import {
  RepeatableComponentName,
  RepeatableFieldComponentDefinitionFrame,
} from '../../src/config/component/repeatable.outline';
import { ReusableComponentName } from '../../src/config/component/reusable.outline';
import { SimpleInputComponentName } from '../../src/config/component/simple-input.outline';
import { GroupFieldComponentName } from '../../src/config/component/group.outline';
import { DropdownInputComponentName } from '../../src/config/component/dropdown-input.outline';
import { CheckboxInputComponentName } from '../../src/config/component/checkbox-input.outline';
import { TypeaheadInputComponentName } from '../../src/config/component/typeahead-input.outline';
import { FileUploadComponentName } from '../../src/config/component/file-upload.outline';
import { isTypeFieldDefinitionName } from '../../src/config/form-types.outline';
import { ILogger } from '../../src/logger.interface';

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
});
