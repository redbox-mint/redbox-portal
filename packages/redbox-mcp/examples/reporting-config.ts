import { reporting, type RecordTypeReportingConfig } from '@researchdatabox/redbox-core';
import type { FormConfigFrame } from '@researchdatabox/sails-ng-common';

/** Merge into the customer's existing rdmp record type; align paths and forms with its workflow. */
export const rdmpReporting: RecordTypeReportingConfig = {
  enabled: true,
  allowedRoles: ['Researcher', 'Librarians', 'Admin'],
  forms: ['rdmp-reporting-view'],
  // Search stays disabled until the index is verified safe for every allowed reporting role.
  fields: [
    {
      id: 'created',
      label: 'Created date',
      description: 'Date the RDMP was created. UTC ranges include start and exclude end.',
      path: 'metaMetadata.createdOn',
      type: 'date',
      operations: ['filter', 'histogram', 'read'],
    },
    {
      id: 'faculty',
      label: 'Faculty',
      description: 'Faculty responsible for the RDMP.',
      path: 'metadata.faculty',
      type: 'category',
      operations: ['filter', 'group', 'read'],
    },
    {
      id: 'workflowStage',
      label: 'Workflow stage',
      description: 'Current workflow stage, for example draft or published.',
      path: 'workflow.stage',
      type: 'category',
      operations: ['filter', 'group', 'read'],
    },
    {
      id: 'sensitiveData',
      label: 'Sensitive data involved',
      description: 'Whether the RDMP declares sensitive data.',
      path: 'metadata.sensitiveData',
      type: 'boolean',
      operations: ['filter', 'group', 'read'],
    },
  ],
};
export const reportingConfig = { ...reporting, enabled: true };

/** Illustrates fields retained in the effective view metadata contract. Register through the customer hook. */
export const rdmpReportingView: FormConfigFrame = {
  name: 'rdmp-reporting-view',
  type: 'rdmp',
  componentDefinitions: [
    {
      name: 'faculty',
      constraints: { allowModes: ['view', 'edit'] },
      component: { class: 'SimpleInputComponent', config: { label: 'Faculty' } },
      model: { class: 'SimpleInputModel', config: { defaultValue: '' } },
    },
    {
      name: 'sensitiveData',
      constraints: { allowModes: ['view', 'edit'] },
      component: { class: 'CheckboxInputComponent', config: { label: 'Sensitive data involved' } },
      model: { class: 'CheckboxInputModel', config: { defaultValue: false } },
    },
  ],
};
// Export this AppConfig object from branded-config/default/override/mcp.js in the customer hook.
// The portal process also requires REDBOX_MCP_ENABLED=true; both switches are required.
export const mcpConfig = {
  enabled: true,
  resourceUrl: 'https://redbox.customer.edu.au/default/mcp',
  issuer: 'https://identity.customer.edu.au/realms/research',
  jwksUrl: 'https://identity.customer.edu.au/realms/research/protocol/openid-connect/certs',
  brand: 'default',
  scope: 'redbox.reporting',
  identityClaim: 'preferred_username',
  usernameToLowercase: true,
  identityBindings: [
    {
      issuer: 'https://identity.customer.edu.au/realms/research',
      subject: 'replace-with-verified-institution-subject',
      username: 'replace-with-existing-redbox-oidc-username',
    },
  ],
  algorithms: ['RS256'],
  allowedOrigins: [],
  maxRequestBytes: 16_000,
};
