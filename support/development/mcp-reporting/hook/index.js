'use strict';
const { defineRedboxHook, Config } = require('@researchdatabox/redbox-core');
const { seed } = require('./seed');
const formName = 'rdmp-reporting-demo';
const fields = [
  {
    id: 'created',
    label: 'Created date',
    description: 'Original creation date. Use UTC ranges with inclusive start and exclusive end.',
    path: 'metaMetadata.createdOn',
    type: 'date',
    operations: ['filter', 'histogram', 'read'],
  },
  {
    id: 'faculty',
    label: 'Faculty',
    description: 'Arts and Humanities, Engineering, Medicine, or Science.',
    path: 'metadata.faculty',
    type: 'category',
    operations: ['filter', 'group', 'read'],
  },
  {
    id: 'workflowStage',
    label: 'Workflow stage',
    description: 'Current stage: draft, review, approved, or archived.',
    path: 'workflow.stage',
    type: 'category',
    operations: ['filter', 'group', 'read'],
  },
  {
    id: 'sensitiveData',
    label: 'Sensitive data involved',
    description: 'True when the plan involves sensitive research data.',
    path: 'metadata.sensitiveData',
    type: 'boolean',
    operations: ['filter', 'group', 'read'],
  },
  {
    id: 'title',
    label: 'Project title',
    description: 'Human-readable research project title.',
    path: 'metadata.title',
    type: 'text',
    operations: ['read'],
  },
  {
    id: 'description',
    label: 'Project summary',
    description: 'Short fictional summary describing the research and data.',
    path: 'metadata.description',
    type: 'text',
    operations: ['read'],
  },
];
const form = {
  name: formName,
  type: 'rdmp',
  domElementType: 'form',
  defaultComponentConfig: { defaultComponentCssClasses: 'row' },
  viewCssClasses: 'redbox-form form',
  editCssClasses: 'redbox-form form',
  componentDefinitions: ['title', 'description', 'faculty', 'sensitiveData'].map(name => ({
    name,
    constraints: { allowModes: ['view', 'edit'] },
    layout: { class: 'DefaultLayout', config: { label: fields.find(field => field.id === name).label } },
    component: {
      class: name === 'sensitiveData' ? 'CheckboxInputComponent' : 'SimpleInputComponent',
      config: { label: fields.find(field => field.id === name).label },
    },
    model: {
      class: name === 'sensitiveData' ? 'CheckboxInputModel' : 'SimpleInputModel',
      config: { defaultValue: name === 'sensitiveData' ? false : '' },
    },
  })),
};
function configuration() {
  const base = process.env.REDBOX_DEMO_URL;
  if (!base) throw new Error('Set REDBOX_DEMO_URL with prepare.js before launching the demo');
  const issuer = `${base}/auth/realms/redbox-reporting`;
  return {
    appUrl: base,
    enableNewForm: true,
    reporting: { ...Config.reporting, enabled: true },
    recordtype: {
      rdmp: {
        reporting: {
          enabled: true,
          allowedRoles: ['Researcher', 'Librarians', 'Admin'],
          forms: [formName],
          searchCore: 'default',
          searchFullTextVisibleToAllReportingRoles: true,
          fields,
        },
      },
    },
    workflow: {
      rdmp: Object.fromEntries(
        ['draft', 'review', 'approved', 'archived'].map(stage => [
          stage,
          {
            starting: stage === 'draft',
            config: {
              form: formName,
              workflow: { stage, stageLabel: stage[0].toUpperCase() + stage.slice(1) },
              authorization: { viewRoles: ['Researcher', 'Librarians', 'Admin'], editRoles: ['Librarians', 'Admin'] },
            },
          },
        ])
      ),
    },
    brandingConfigurationDefaults: {
      mcpSetup: {
        clients: {
          codex: {
            clientId: 'redbox-reporting-work',
            callbackUrl: 'http://127.0.0.1:52344/callback',
            callbackPort: 52344,
          },
        },
      },
      mcp: {
        enabled: true,
        resourceUrl: `${base}/default/mcp`,
        issuer,
        jwksUrl: `${issuer}/protocol/openid-connect/certs`,
        brand: 'default',
        scope: 'redbox.reporting',
        identityClaim: 'preferred_username',
        usernameToLowercase: true,
        identityBindings: [{ issuer, subject: 'reporting-demo-researcher', username: 'reporting-researcher' }],
        algorithms: ['RS256'],
        allowedOrigins: [],
        maxRequestBytes: 16000,
      },
      auth: {
        active: ['local', 'oidc'],
        local: {
          default: {
            adminUser: 'admin',
            adminPw: process.env.REDBOX_DEMO_ADMIN_PASSWORD,
            email: 'admin@example.invalid',
          },
        },
        oidc: {
          debugMode: false,
          discoverAttemptsMax: 12,
          discoverFailureSleep: 5000,
          defaultRole: 'Researcher',
          postLoginRedir: 'researcher/home',
          userInfoSource: 'tokenset_claims',
          claimMappings: {
            username: 'preferred_username',
            name: 'name',
            email: 'email',
            givenname: 'given_name',
            surname: 'family_name',
            cn: 'name',
            displayName: 'name',
          },
          claimMappingOptions: { usernameToLowercase: true },
          opts: {
            issuer,
            client: {
              client_id: 'redbox-portal-demo',
              client_secret: process.env.REDBOX_DEMO_OIDC_SECRET,
              redirect_uris: [`${base}/user/login_oidc`],
              post_logout_redirect_uris: [`${base}/default/rdmp/user/logout`],
            },
            params: { scope: 'openid email profile' },
          },
          templatePath: 'openidconnect.ejs',
        },
      },
    },
  };
}
module.exports = defineRedboxHook({
  registerRedboxConfig: configuration,
  registerRedboxFormConfigs: () => ({ [formName]: form }),
  additionalExports: { registerRedboxBootstrap: () => () => seed(form) },
});
