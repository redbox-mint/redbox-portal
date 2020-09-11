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
        form: 'default-1.0-draft',
        dashboard: {
          table: {
            rowConfig: [{
                title: 'Plan',
                variable: 'metadata.title',
                template: '<a href=\'/<%= branding %>/<%= portal %>/record/view/<%= oid %>\'><%= metadata.title %></a> \
                <span class="dashboard-controls"> \
                <% if(hasEditAccess) { %> \
                    <a href=\'/<%= branding %>/<%= portal %>/record/edit/<%= oid %>\' aria-label=\'<%= translationService.t(\'edit-link-label\') %>\'><i class="fa fa-pencil" aria-hidden="true"></i></a> \
                  <% } %> \
                </span>',
                initialSort: 'desc'
              },
              {
                title: 'header-ci',
                variable: 'metadata.contributor_ci.text_full_name',
                template: '<%= metadata.contributor_ci.text_full_name %>'
              },
              {
                title: 'header-data-manager',
                variable: 'metadata.contributor_data_manager.text_full_name',
                template: '<%= metadata.contributor_data_manager.text_full_name %>'
              },
              {
                title: 'header-created',
                variable: 'date_object_created',
                template: '<%= dateCreated %>'
              },
              {
                title: 'header-modified',
                variable: 'date_object_modified',
                template: '<%= dateModified %>'
              }
            ]
          }
        }
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
        form: 'dataRecord-1.0-draft',
        starting: true
      }
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
          stageLabel: 'Queued',
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
    "reviewing": {
      config: {
        workflow: {
          stage: 'reviewing',
          stageLabel: 'Reviewing',
        },
        authorization: {
          viewRoles: ['Admin', 'Librarians'],
          editRoles: ['Admin'],

        },
        form: 'dataPublication-1.0-reviewing',
        displayIndex: 4
      }
    },
    "publishing": {
      config: {
        workflow: {
          stage: 'publishing',
          stageLabel: 'Publishing',
        },
        authorization: {
          viewRoles: ['Admin', 'Librarians'],
          editRoles: ['Admin', 'Librarians'],
          transitionRoles: ['Admin']
        },
        form: 'dataPublication-1.0-publishing',
        displayIndex: 5
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
          stage: 'draft',
          stageLabel: 'Draft',
        },
        authorization: {
          viewRoles: ['Admin', 'Librarians'],
          editRoles: ['Admin', 'Librarians']
        },
        form: 'existing-locations-1.0-draft'
      },
      starting: true
    }
  }
};