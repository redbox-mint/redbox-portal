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
        form: 'dataPublication-1.0-draft'
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
        form: 'dataPublication-1.0-queued'
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
        form: 'dataPublication-1.0-embargoed'
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
          editRoles: ['Admin']
        },
        form: 'dataPublication-1.0-reviewing'
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
          editRoles: ['Admin', 'Librarians']
        },
        form: 'dataPublication-1.0-publishing'
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
        form: 'dataPublication-1.0-published'
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
        form: 'dataPublication-1.0-retired'
      }
    }

  }
};
