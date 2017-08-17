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
          viewRoles: ['Admin'],
          editRoles: ['Admin']
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
          next: 'retired',
          back: 'draft'
        },
        authorization: {
          viewRoles: ['Admin'],
          editRoles: ['Admin']
        },
        form: 'default-1.0-active'
      }
    },
    "retired": {
      config: {
        workflow: {
          stage: 'retired',
          stageLabel: 'Retired',
          back: 'active'
        },
        authorization: {
          viewRoles: ['Admin'],
          editRoles: ['Admin']
        },
        form: 'default-1.0-retired'
      }
    }
  }
};
