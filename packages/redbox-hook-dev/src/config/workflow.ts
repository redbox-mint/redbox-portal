import { manualWorkflows } from '../form-config/pw-remaining-manual';
import type { WorkflowConfig } from '@researchdatabox/redbox-core';

/**
 * Demo workflow stage definitions for the demo record types.
 * Moved out of @researchdatabox/redbox-core; supplied via redbox-hook-dev.
 */
export const workflow: WorkflowConfig = {
  ...manualWorkflows,

    'pw-12-conflict-resolution': {
        draft: {
            config: {
                workflow: { stage: 'draft', stageLabel: 'Draft' },
                authorization: { viewRoles: ['Admin'], editRoles: ['Admin'] },
                form: 'pw-12-conflict-resolution-1.0-draft'
            },
            starting: true
        }
    },
    'pw-11-transport-validation': {
        draft: {
            config: {
                workflow: { stage: 'draft', stageLabel: 'Draft' },
                authorization: { viewRoles: ['Admin'], editRoles: ['Admin'] },
                form: 'pw-11-transport-validation-1.0-draft'
            },
            starting: true
        }
    },
    'pw-10-save-completions': {
        draft: {
            config: {
                workflow: { stage: 'draft', stageLabel: 'Draft' },
                authorization: { viewRoles: ['Admin'], editRoles: ['Admin'] },
                form: 'pw-10-save-completions-1.0-draft'
            },
            starting: true
        }
    },
    'pw-09-rapid-save-retry': {
        draft: {
            config: {
                workflow: { stage: 'draft', stageLabel: 'Draft' },
                authorization: { viewRoles: ['Admin'], editRoles: ['Admin'] },
                form: 'pw-09-rapid-save-retry-1.0-draft'
            },
            starting: true
        }
    },
    'pw-08-save-busy': {
        draft: {
            config: {
                workflow: { stage: 'draft', stageLabel: 'Draft' },
                authorization: { viewRoles: ['Admin'], editRoles: ['Admin'] },
                form: 'pw-08-save-busy-1.0-draft'
            },
            starting: true
        }
    },
    'pw-07-date-control': {
        draft: {
            config: {
                workflow: { stage: 'draft', stageLabel: 'Draft' },
                authorization: { viewRoles: ['Admin'], editRoles: ['Admin'] },
                form: 'pw-07-date-control-1.0-draft'
            },
            starting: true
        }
    },
    'pw-07-date-writeback': {
        draft: {
            config: {
                workflow: { stage: 'draft', stageLabel: 'Draft' },
                authorization: { viewRoles: ['Admin'], editRoles: ['Admin'] },
                form: 'pw-07-date-writeback-1.0-draft'
            },
            starting: true
        }
    },
    'pw-06-accordion': {
        draft: {
            config: {
                workflow: { stage: 'draft', stageLabel: 'Draft' },
                authorization: { viewRoles: ['Admin'], editRoles: ['Admin'] },
                form: 'pw-06-accordion-1.0-draft'
            },
            starting: true
        }
    },
    'pw-05-validation-focus': {
        draft: {
            config: {
                workflow: { stage: 'draft', stageLabel: 'Draft' },
                authorization: { viewRoles: ['Admin'], editRoles: ['Admin'] },
                form: 'pw-05-validation-focus-1.0-draft'
            },
            starting: true
        }
    },
    'pw-05-nested-focus': {
        draft: {
            config: {
                workflow: { stage: 'draft', stageLabel: 'Draft' },
                authorization: { viewRoles: ['Admin'], editRoles: ['Admin'] },
                form: 'pw-05-nested-focus-1.0-draft'
            },
            starting: true
        }
    },
    'pw-04-early-lookup': {
        draft: {
            config: {
                workflow: { stage: 'draft', stageLabel: 'Draft' },
                authorization: { viewRoles: ['Admin'], editRoles: ['Admin'] },
                form: 'pw-04-early-lookup-1.0-draft'
            },
            starting: true
        }
    },
    'pw-03-source': {
        draft: {
            config: {
                workflow: { stage: 'draft', stageLabel: 'Draft' },
                authorization: { viewRoles: ['Admin'], editRoles: ['Admin'] },
                form: 'pw-03-source-1.0-draft'
            },
            starting: true
        }
    },
    'pw-03-logical-row': {
        draft: {
            config: {
                workflow: { stage: 'draft', stageLabel: 'Draft' },
                authorization: { viewRoles: ['Admin'], editRoles: ['Admin'] },
                form: 'pw-03-logical-row-1.0-draft'
            },
            starting: true
        }
    },
    'pw-02-calculations': {
        draft: {
            config: {
                workflow: { stage: 'draft', stageLabel: 'Draft' },
                authorization: { viewRoles: ['Admin'], editRoles: ['Admin'] },
                form: 'pw-02-calculations-1.0-draft'
            },
            starting: true
        }
    },
    'pw-02-validation': {
        draft: {
            config: {
                workflow: { stage: 'draft', stageLabel: 'Draft' },
                authorization: { viewRoles: ['Admin'], editRoles: ['Admin'] },
                form: 'pw-02-validation-1.0-draft'
            },
            starting: true
        }
    },
    'pw-02-nested': {
        draft: {
            config: {
                workflow: { stage: 'draft', stageLabel: 'Draft' },
                authorization: { viewRoles: ['Admin'], editRoles: ['Admin'] },
                form: 'pw-02-nested-1.0-draft'
            },
            starting: true
        }
    },
    'pw-01-expression-chaining': {
        draft: {
            config: {
                workflow: { stage: 'draft', stageLabel: 'Draft' },
                authorization: { viewRoles: ['Admin'], editRoles: ['Admin'] },
                form: 'pw-01-expression-chaining-1.0-draft'
            },
            starting: true
        }
    },
    "rdmp": {
        "draft": {
            config: {
                workflow: {
                    stage: 'draft',
                    stageLabel: 'Draft',
                },
                authorization: {
                    viewRoles: ['Admin', 'Librarians'],
                    editRoles: ['Admin', 'Librarians']
                },
                form: 'default-1.0-draft'
            },
            starting: true
        }
    },
    "dataRecord": {
        "draft": {
            config: {
                workflow: {
                    stage: 'draft',
                    stageLabel: 'Draft',
                },
                authorization: {
                    viewRoles: ['Admin', 'Librarians'],
                    editRoles: ['Admin', 'Librarians']
                },
                form: 'dataRecord-1.0-draft'
            },
            starting: true
        }
    },
    "dataPublication": {
        "draft": {
            config: {
                workflow: {
                    stage: 'draft',
                    stageLabel: 'Draft',
                },
                authorization: {
                    viewRoles: ['Admin', 'Librarians'],
                    editRoles: ['Admin', 'Librarians']
                },
                form: 'dataPublication-1.0-draft',
                displayIndex: 1
            },
            starting: true
        },
        "queued": {
            config: {
                workflow: {
                    stage: 'queued',
                    stageLabel: 'Queued For Review',
                },
                authorization: {
                    viewRoles: ['Admin', 'Librarians'],
                    editRoles: ['Admin', 'Librarians']
                },
                form: 'dataPublication-1.0-queued',
                displayIndex: 2
            }
        },
        "embargoed": {
            config: {
                workflow: {
                    stage: 'embargoed',
                    stageLabel: 'Embargoed',
                },
                authorization: {
                    viewRoles: ['Admin', 'Librarians'],
                    editRoles: ['Admin', 'Librarians']
                },
                form: 'dataPublication-1.0-embargoed',
                displayIndex: 3
            }
        },
        "published": {
            config: {
                workflow: {
                    stage: 'published',
                    stageLabel: 'Published',
                },
                authorization: {
                    viewRoles: ['Admin', 'Librarians'],
                    editRoles: ['Admin']
                },
                form: 'dataPublication-1.0-published',
                displayIndex: 6
            }
        },
        "retired": {
            config: {
                workflow: {
                    stage: 'retired',
                    stageLabel: 'Retired',
                },
                authorization: {
                    viewRoles: ['Admin', 'Librarians'],
                    editRoles: ['Admin']
                },
                form: 'dataPublication-1.0-retired',
                displayIndex: 7
            }
        }
    },
    "existing-locations": {
        "existing-locations-draft": {
            config: {
                workflow: {
                    stage: 'existing-locations-draft',
                    stageLabel: 'Draft',
                },
                authorization: {
                    viewRoles: ['Admin', 'Librarians'],
                    editRoles: ['Admin', 'Librarians']
                },
                form: 'existing-locations-1.0-draft',

                dashboard: {
                    table: {
                        rowConfig: [
                            {
                                title: '@workspace-name',
                                variable: 'metadata.title',
                                template: "{{metadata.title}}",
                                initialSort: 'desc'
                            },
                            {
                                title: '@workspace-type',
                                variable: 'metadata.storage_type',
                                template: "{{metadata.storage_type}}"
                            },
                            {
                                title: '@related-rdmp-title',
                                variable: 'metadata.rdmpOid',
                                template: "<a href='{{rootContext}}/{{branding}}/{{portal}}/record/view/{{metadata.rdmpOid}}'>{{metadata.rdmpTitle}}</a>"
                            }
                        ]
                    }
                }
            },
            starting: true
        }
    },
    "concurrencyTest": {
        "draft": {
            config: {
                workflow: {
                    stage: 'draft',
                    stageLabel: 'Draft',
                },
                authorization: {
                    viewRoles: ['Admin'],
                    editRoles: ['Admin']
                },
                form: 'generated-view-only'
            },
            starting: true
        }
    },
    "party": {
        "draft": {
            config: {
                workflow: {
                    stage: 'draft',
                    stageLabel: 'Draft',
                },
                authorization: {
                    viewRoles: ['Admin', 'Librarians'],
                    editRoles: ['Admin', 'Librarians']
                },
                form: 'generated-view-only',
                dashboard: {
                    table: {
                        rowConfig: [
                            {
                                title: 'Party Name',
                                variable: 'metadata.fullName',
                                template: `<a href='{{rootContext}}/{{branding}}/{{portal}}/record/view/{{oid}}'>{{metadata.fullName}}</a>`,
                                initialSort: 'desc'
                            },
                            {
                                title: 'Party Email',
                                variable: 'metadata.email',
                                template: '{{metadata.email}}',
                                initialSort: 'desc'
                            },
                            {
                                title: 'header-created',
                                variable: 'metaMetadata.createdOn',
                                template: '{{formatDateLocale dateCreated "DATETIME_MED"}}',
                                initialSort: 'desc'
                            },
                            {
                                title: 'header-modified',
                                variable: 'metaMetadata.lastSaveDate',
                                template: '{{formatDateLocale dateModified "DATETIME_MED"}}',
                                initialSort: 'desc'
                            }
                        ]
                    }
                }
            },
            starting: true
        }
    }
};
