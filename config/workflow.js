module.exports.workflow = {
  "default": {
    "draft": {
      config: {
        workflow: {
          stage: 'draft',
          stageLabel: 'Draft',
          next: 'active',
        },
        authorization: {
          viewRoles: ['Admin','Librarians'],
          editRoles: ['Admin','Librarians']
        },
        form: 'default-1.0-draft'
      },
      starting: true
    },
    "active": {
      config: {
        workflow: {
          stage: 'active',
          stageLabel: 'Active',
          back: 'draft'
        },
        authorization: {
          viewRoles: ['Admin','Librarians'],
          editRoles: ['Admin','Librarians']
        },
        form: 'default-1.0-active'
      }
    }
  }
};
