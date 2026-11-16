import { z } from '../zod-openapi';
import { apiRoute } from '../route-factory';

const result = z
  .object({
    data: z.record(z.string(), z.unknown()).nullable().optional(),
    errors: z.array(z.object({ message: z.string() }).passthrough()).optional(),
  })
  .passthrough();

export const recordGraphqlApiRoutes = [
  apiRoute(
    'post',
    '/:branding/:portal/api/graphql',
    'webservice/RecordGraphqlController',
    'execute',
    {
      params: z.object({ branding: z.string().min(1), portal: z.string().min(1) }),
      body: {
        required: true,
        content: {
          'application/json': {
            schema: z
              .object({
                query: z.string().min(1).max(65_536),
                operationName: z.string().nullable().optional(),
                variables: z.record(z.string(), z.unknown()).nullable().optional(),
                extensions: z.record(z.string(), z.unknown()).optional(),
              })
              .strict(),
          },
        },
      },
    },
    {
      tags: ['Records'],
      summary: 'Query workflow-specific record metadata',
      description:
        'Read-only authenticated GraphQL. Requires a matching path read rule and existing record read permissions. Disabled by default; no public discovery.',
      includeDefaultResponses: false,
      responses: Object.fromEntries(
        [200, 400, 401, 403, 413, 503].map(status => [
          status,
          {
            description:
              status === 200
                ? 'GraphQL result; field errors may accompany partial data'
                : 'Request denied, invalid, bounded or unavailable',
            content: { 'application/graphql-response+json': { schema: result } },
          },
        ])
      ),
    }
  ),
];
