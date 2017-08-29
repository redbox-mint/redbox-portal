module.exports.workflow = {
  "default": {
    "draft": {
      config: {
        workflow: {
          stage: 'draft',
          stageLabel: 'Draft',
        },
        authorization: {
          viewRoles: ['Admin','Librarians'],
          editRoles: ['Admin','Librarians']
        },
        form: 'default-1.0-draft'
      },
      starting: true
    }
};
