module.exports.workflow = {
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
  // The "Existing Locations" workflow...
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
                template: "<%= metadata.title %>",
                initialSort: 'desc'
              },
              {
                title: '@workspace-type',
                variable: 'metadata.storage_type',
                template: "<%= metadata.storage_type %>"
              },
              {
                title: '@related-rdmp-title',
                variable: 'metadata.rdmpOid',
                template: "<a href='/<%= branding %>/<%= portal %>/record/view/<%= metadata.rdmpOid %>'><%= metadata.rdmpTitle %></a>"
              }
            ]
          }
        }
      },
      starting: true
    }
  },
  "consolidated": {
    "consolidated": {
      config: {
        workflow: {
          stage: 'consolidated',
          stageLabel: 'Consolidated',
        },
        authorization: {
          viewRoles: ['Admin', 'Librarians'],
          editRoles: ['Admin', 'Librarians']
        },
        form: 'default-1.0-draft',
        baseRecordType: 'rdmp',
        dashboard: {
          table: {
            rowConfig: [
              {
                title: 'header-record-type',
                variable: 'metaMetadata.type',
                template: '<%= metaMetadata.type %>',
                
              },
              {
                title: 'Record Title',
                variable: 'metadata.title',
                template: `<a href='<%=rootContext%>/<%= branding %>/<%= portal %>/record/view/<%= oid %>'><%= metadata.title %></a>
                            <span class="dashboard-controls">
                              <% if(hasEditAccess) { %>
                                <a href='<%=rootContext%>/<%= branding %>/<%= portal %>/record/edit/<%= oid %>' aria-label='<%= translationService.t('edit-link-label') %>'><i class="fa fa-pencil" aria-hidden="true"></i></a>
                              <% } %>
                            </span>
                          `
              },
              {
                title: 'header-ci',
                variable: 'metadata.contributor_ci.text_full_name',
                template: '<%= metadata.contributor_ci != undefined ? metadata.contributor_ci.text_full_name : "" %>',
                
              },
              {
                title: 'header-created',
                variable: 'metaMetadata.createdOn',
                template: '<%= dateCreated %>',
                
              },
              {
                title: 'header-modified',
                variable: 'metaMetadata.lastSaveDate',
                template: '<%= dateModified %>'
              },
              {
                title: 'Actions',
                variable: '',
                template: `<%= rulesService.evaluateRowLevelRules(rulesConfig, metadata, metaMetadata, workflow, oid, 'dashboardActionsPerRow') %>`
              }
            ],
            formatRules: {
              filterBy: {filterBase: 'user', filterBaseFieldOrValue: 'user.email', filterField: 'metadata.contributor_ci.email', filterMode: 'equal' }, //filterBase can only have two values user or record
              sortBy: '',
              groupBy: 'groupedByRecordType', //values: empty (not grouped any order), groupedByRecordType, groupedByRelationships 
              sortGroupBy: [{ rowLevel: 0, compareFieldValue: 'rdmp' }, 
                            { rowLevel: 1, compareFieldValue: 'dataRecord' }, 
                            { rowLevel: 2, compareFieldValue: 'dataPublication'}] //values: as many levels as required
            },
            rowRulesConfig: [
              {
                ruleSetName: 'dashboardActionsPerRow',
                applyRuleSet: true, //easy way to enable or desable the whole rule set
                type: 'multi-item-rendering',
                separator: ' | ',
                rules: [ 
                    {
                      name: 'Edit', 
                      action: 'show', //options show / hide
                      renderItemTemplate: `<a href='<%=rootContext%>/<%= branding %>/<%= portal %>/record/edit/<%= oid %>'><%= name %></a>`,
                      evaluateRulesTemplate: `<%= _.get(workflow, 'stage') == 'draft' %>`  
                    },
                    {
                      name: 'Create dataset from this plan', 
                      action: 'show', //options show / hide
                      renderItemTemplate: '<%= name %>',
                      evaluateRulesTemplate: `<%= _.get(workflow, 'stage') == 'draft' && _.get(metaMetadata, 'type') == 'rdmp' %>`
                    },
                    {
                      name: 'Close data plan', 
                      action: 'show', //options show / hide
                      renderItemTemplate: '<%= name %>',
                      evaluateRulesTemplate: `<%= _.get(workflow, 'stage') == 'draft' && _.get(metaMetadata, 'type') == 'rdmp' %>`
                    },
                    {
                      name: 'Create a publication record from this dataset', 
                      action: 'show', //options show / hide
                      renderItemTemplate: '<%= name %>',
                      evaluateRulesTemplate: `<%= _.get(workflow, 'stage') == 'draft' && _.get(metaMetadata, 'type') == 'dataRecord' %>`
                    },
                    {
                      name: 'Close dataset info', 
                      action: 'show', //options show / hide
                      renderItemTemplate: '<%= name %>',
                      evaluateRulesTemplate: `<%= _.get(workflow, 'stage') == 'draft' && _.get(metaMetadata, 'type') == 'dataRecord' %>`
                    },
                    {
                      name: 'Submit for library review', 
                      action: 'show', //options show / hide
                      renderItemTemplate: '<%= name %>',
                      evaluateRulesTemplate: `<%= _.get(workflow, 'stage') == 'draft' && _.get(metaMetadata, 'type') == 'dataPublication' %>`
                    }
                  ]
                }
              ],
              groupRowConfig: [
                {
                  title: 'Actions',
                  variable: '',
                  template: `<%= rulesService.evaluateGroupRowRules(groupRulesConfig, groupedItems, 'dashboardActionsPerGroupRow') %>`
                }
              ],
              groupRowRulesConfig: [
                {
                  ruleSetName: 'dashboardActionsPerGroupRow',
                  applyRuleSet: true, //easy way to enable or desable the whole rule set
                  rules: [ 
                    {
                      name: 'Send for Conferral', 
                      action: 'show', //options show / hide
                      mode: 'alo', //options 'all' members of the group pass the rule or 'alo' at least one member of the group row passes the rule
                      renderItemTemplate: `<%= name %>`,
                      evaluateRulesTemplate: `<%= _.get(workflow, 'stage') == 'draft' %>`
                    }
                  ]
                }
              ]
          }
        }
      },
      starting: false,
      consolidated: true
    }
  }
};
