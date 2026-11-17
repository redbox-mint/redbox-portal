import type { EmailContextSchema } from '@researchdatabox/sails-ng-common';

/** A small curated context schema shared by the schema-assistance specs. */
export function contextSchemaFixture(): EmailContextSchema {
  return {
    type: 'object',
    properties: {
      oid: { type: 'string', title: 'Record ID' },
      record: {
        type: 'object',
        required: ['metadata'],
        properties: {
          metadata: {
            type: 'object',
            required: ['title'],
            additionalProperties: false,
            properties: {
              title: { type: 'string', title: 'Title', description: 'The record title' },
              description: { type: 'string', title: 'Description' },
              authors: {
                type: 'array',
                title: 'Authors',
                items: {
                  type: 'object',
                  required: ['name'],
                  properties: { name: { type: 'string', title: 'Name' }, email: { type: 'string' } },
                },
              },
              keywords: { type: 'array', items: { type: 'string' } },
            },
          },
          workflow: {
            type: 'object',
            properties: { stage: { type: 'string' }, stageLabel: { type: 'string' } },
          },
        },
      },
      portal: { type: 'object', properties: { url: { type: 'string', title: 'Portal URL' } } },
    },
  };
}
