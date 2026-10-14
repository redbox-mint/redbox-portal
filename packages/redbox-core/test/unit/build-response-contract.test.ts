import { expect } from 'chai';

import type { BuildResponseType } from '../../src';

function assertRawResponseRestrictionsTypeCheck(): void {
  const unsupportedMedia = {
    format: 'raw-json' as const,
    mediaType: 'text/plain' as const,
    data: { type: 'object' },
  };
  // @ts-expect-error Raw responses allow only schema and Problem Details media types.
  const invalidMediaResponse: BuildResponseType = unsupportedMedia;

  const stringBody = {
    format: 'raw-json' as const,
    mediaType: 'application/schema+json' as const,
    data: 'not-an-object',
  };
  // @ts-expect-error Raw responses require a JSON object body, not a string.
  const invalidStringResponse: BuildResponseType = stringBody;

  const envelopedRawResponse = {
    format: 'raw-json' as const,
    mediaType: 'application/problem+json' as const,
    data: { status: 404 },
    meta: { page: 1 },
  };
  // @ts-expect-error Raw responses cannot opt back into API envelope fields.
  const invalidEnvelopeResponse: BuildResponseType = envelopedRawResponse;

  void [invalidMediaResponse, invalidStringResponse, invalidEnvelopeResponse];
}

describe('BuildResponse raw JSON contract', function () {
  it('accepts only the two object-bodied raw response variants', function () {
    const schema: BuildResponseType = {
      format: 'raw-json',
      mediaType: 'application/schema+json',
      data: { type: 'object' },
    };
    const problem: BuildResponseType = {
      format: 'raw-json',
      mediaType: 'application/problem+json',
      status: 404,
      data: { type: 'about:blank', title: 'Not found', status: 404 },
    };

    assertRawResponseRestrictionsTypeCheck();
    expect([schema.format, problem.format]).to.deep.equal(['raw-json', 'raw-json']);
  });
});
