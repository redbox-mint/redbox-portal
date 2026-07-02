import type { WorkflowConfig } from '@researchdatabox/redbox-core';

/**
 * Demo workflow stage definitions for the demo record types.
 * Moved out of @researchdatabox/redbox-core; supplied via redbox-hook-dev.
 */
export const workflow: WorkflowConfig = {
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
