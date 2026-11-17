import { accepts, clone, connectionDraft, modelDraft, sdkCode, slug, validateConnection, validateModel, validKey } from './model-settings';
import { bedrock, model, openrouter, overview } from './test-fixtures';
import { OPENROUTER_SNAPSHOT, BEDROCK_SNAPSHOT } from './sdk-code.snapshots';

describe('AI model draft validation and SDK code', () => {
  it('derives bounded slug keys', () => {
    expect(slug(' Nova Lite for RDMPs! ')).toBe('nova-lite-for-rdmps');
    expect(slug('a'.repeat(101))).toHaveSize(100);
    expect(validKey('some--key')).toBeFalse(); expect(validKey('Some-key')).toBeFalse();
  });
  it('strips database and health fields and never round trips dataPolicy', () => {
    expect(connectionDraft({ ...openrouter, dataPolicy: { keep: true } } as any)).toEqual({
      key: 'openrouter', name: 'OpenRouter', adapterId: 'openrouter', enabled: true, authStrategy: 'bearer',
      secretRef: 'env:OPENROUTER_API_KEY', timeoutMs: 90000, nonSecretHeaders: { 'X-Title': 'ReDBox' },
    });
    expect(modelDraft(model) as any).not.toEqual(jasmine.objectContaining({ contentHash: model.contentHash }));
  });
  it('preserves the fake fixture in model drafts', () => {
    const fixture = { answer: 'synthetic' };
    expect(modelDraft({ ...model, parameters: { fixtureResponse: fixture } }).parameters?.fixtureResponse).toEqual(fixture);
  });
  it('validates credential references without demanding a resolved secret', () => {
    expect(validateConnection({ ...openrouter, secretRef: 'env:NOT_SET' }, overview)).toEqual({});
    expect(validateConnection({ ...openrouter, secretRef: 'sk-raw-key' }, overview)['secretRef']).toBeTruthy();
    expect(validateConnection({ ...openrouter, secretRef: 'vault:missing' }, overview)['secretRef']).toBeTruthy();
  });
  it('validates provider limits, installed adapters and regions', () => {
    expect(validateConnection({ ...openrouter, timeoutMs: 90001 }, overview)['timeoutMs']).toBeTruthy();
    expect(validateConnection({ ...openrouter, timeoutMs: 0.5 }, overview)['timeoutMs']).toBeTruthy();
    expect(validateConnection({ ...openrouter, adapterId: 'new' }, overview)['adapterId']).toBeTruthy();
    expect(validateConnection({ ...bedrock, region: 'unknown' }, overview)['region']).toBeTruthy();
  });
  for (const header of ['Authorization', 'x-api-key', 'x-secret', 'cookie', 'Host', 'password', 'bad name']) {
    it('rejects unsafe header ' + header, () => expect(validateConnection({ ...openrouter, nonSecretHeaders: { [header]: 'value' } }, overview)['headers']).toBeTruthy());
  }
  it('rejects header line breaks and excessive values', () => {
    expect(validateConnection({ ...openrouter, nonSecretHeaders: { 'X-Title': 'bad\r\nvalue' } }, overview)['headers']).toBeTruthy();
    expect(validateConnection({ ...openrouter, nonSecretHeaders: { 'X-Title': 'a'.repeat(2001) } }, overview)['headers']).toBeTruthy();
  });
  for (const [setting, value] of Object.entries({ temperature: 2.1, maxOutputTokens: 0, topP: -0.1, seed: 1.5, presencePenalty: -2.1, frequencyPenalty: 2.1 })) {
    it('validates range for ' + setting, () => expect(validateModel({ ...model, parameters: { [setting]: value } }, openrouter)[setting]).toBeTruthy());
  }
  it('handles bounds, optional values, Bedrock temperature and stop sequences', () => {
    expect(validateModel(model, openrouter)).toEqual({});
    expect(validateModel({ ...model, parameters: {} }, openrouter)).toEqual({});
    expect(validateModel({ ...model, parameters: { temperature: 1.1 } }, bedrock)['temperature']).toBeTruthy();
    expect(validateModel({ ...model, parameters: { stopSequences: [' '] } }, openrouter)['stopSequences']).toBeTruthy();
    expect(validateModel({ ...model, parameters: { stopSequences: ['a', 'b', 'c', 'd', 'e'] } }, openrouter)['stopSequences']).toBeTruthy();
    expect(validateModel(model, { ...openrouter, enabled: false })['connectionId']).toBeTruthy();
  });
  it('bounds routing IDs', () => expect(validateModel({ ...model, routingPolicy: { only: ['a'.repeat(201)] } }, openrouter)['only']).toBeTruthy());
  it('identifies adapter support precisely', () => {
    expect(accepts('bedrock', 'seed')).toBeFalse(); expect(accepts('bedrock', 'topP')).toBeTrue();
    expect(accepts('openrouter', 'frequencyPenalty')).toBeTrue(); expect(accepts('fake', 'temperature')).toBeFalse();
  });
  it('matches the reviewed OpenRouter adapter code snapshot', () => {
    expect(sdkCode(model, openrouter)).toEqual(OPENROUTER_SNAPSHOT);
    const code = sdkCode(model, openrouter);
    expect(code).toContain('process.env.OPENROUTER_API_KEY'); expect(code).toContain('"require_parameters": true');
    expect(code).toContain('"max_tokens": 4096'); expect(code).toContain('strictJsonSchema: true');
    expect(code).not.toContain('"maxOutputTokens"'); expect(code).toContain('maxRetries: 0');
  });
  it('matches the reviewed Bedrock adapter code snapshot', () => {
    expect(sdkCode({ ...model, connectionId: bedrock.id, modelId: 'amazon.nova-lite-v1:0', routingPolicy: {} }, bedrock)).toEqual(BEDROCK_SNAPSHOT);
    const code = sdkCode(model, bedrock);
    expect(code).not.toContain('seed'); expect(code).not.toContain('Penalty'); expect(code).not.toContain('providerOptions');
    expect(code).toContain('"maxOutputTokens": 4096'); expect(code).toContain('credentialProvider: defaultProvider()');
  });
  it('does not generate SDK code or expose fixed sample answers for the demo adapter', () => {
    expect(sdkCode({ ...model, parameters: { fixtureResponse: { answers: { private: 'sample' } } } }, { ...openrouter, adapterId: 'fake' })).toBe('');
  });
  it('uses a Bedrock bearer ref safely and strips dropped headers', () => {
    const code = sdkCode(model, { ...bedrock, authStrategy: 'bearer', secretRef: 'env:BEDROCK_KEY', nonSecretHeaders: { 'Content-Type': 'discard', 'X-Title': 'ReDBox' } });
    expect(code).toContain('process.env.BEDROCK_KEY || process.env.AWS_BEARER_TOKEN_BEDROCK');
    expect(code).not.toContain('Content-Type'); expect(code).not.toContain('discard');
  });
  it('shows a resolver variable for non-env references and never emits the reference as a value', () => {
    const code = sdkCode(model, { ...openrouter, secretRef: 'vault:private/location' });
    expect(code).toContain('apiKey: resolvedSecret'); expect(code).not.toContain('private/location');
    const changed = clone(model); changed.routingPolicy = { ...changed.routingPolicy, zdr: false };
    expect(sdkCode(changed, openrouter)).toContain('"zdr": false');
  });
});
