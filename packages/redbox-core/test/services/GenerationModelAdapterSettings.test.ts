import { strict as assert } from 'node:assert';
import * as sinon from 'sinon';
import { OpenRouterGenerationProvider } from '../../src/services/generation/providers/OpenRouterGenerationProvider';
import { BedrockGenerationProvider } from '../../src/services/generation/providers/BedrockGenerationProvider';
import { createMockSails } from './testHelper';
import { generation } from '../../src/config/generation.config';
import { GenerationError } from '../../src/model/generation';

describe('Generation model Admin adapter settings', () => {
  let original: unknown;
  beforeEach(() => { original = Reflect.get(globalThis, 'sails'); const mock = createMockSails(); mock.config.generation = structuredClone(generation); Reflect.set(globalThis, 'sails', mock); });
  afterEach(() => { sinon.restore(); Reflect.set(globalThis, 'sails', original); });
  for (const legacy of [false,true]) {
    it(`maps ${legacy ? 'legacy snake_case' : 'SDK'} parameters to OpenRouter and forces required parameters`, async () => {
      const fetchStub = sinon.stub(globalThis, 'fetch').resolves(new Response(JSON.stringify({
        model: 'actual/model', provider: 'actual-provider', choices: [{ finish_reason: 'stop', message: { content: '{"answer":"Hi"}' } }],
        usage: { prompt_tokens: 1, completion_tokens: 2, total_tokens: 3, cost: 0.001 },
      }), { status: 200 }));
      const parameters = legacy ? { temperature: 0.3, max_tokens: 200, top_p: 0.4, stop: ['end'], presence_penalty: -1, frequency_penalty: 1, seed: 42 }
        : { temperature: 0.3, maxOutputTokens: 200, topP: 0.4, stopSequences: ['end'], presencePenalty: -1, frequencyPenalty: 1, seed: 42 };
      const result = await new OpenRouterGenerationProvider().invoke({
        connection: { endpoint: 'https://openrouter.ai/api/v1', secret: 'PRIVATE', timeoutMs: 1000 },
        deployment: { modelId: 'requested/model', parameters, routingPolicy: { require_parameters: false, zdr: true, order: ['a'] } },
        messages: [{ role: 'user', content: 'Hi' }], responseSchema: { type: 'object', properties: { answer: { type: 'string' } }, required: ['answer'], additionalProperties: false }, correlationId: 'test',
      }, new AbortController().signal);
      const body = JSON.parse(String(fetchStub.firstCall.args[1]?.body));
      for (const [name, value] of Object.entries({ temperature: 0.3, max_tokens: 200, top_p: 0.4, stop: ['end'], presence_penalty: -1, frequency_penalty: 1, seed: 42 })) assert.deepEqual(body[name], value);
      assert.deepEqual(body.provider, { require_parameters: true, zdr: true, order: ['a'] });
      assert.equal(body.maxOutputTokens, undefined); assert.equal(body.topP, undefined);
      assert.equal(body.response_format.type, 'json_schema'); assert.equal(result.actualProvider, 'actual-provider'); assert.equal(result.usage?.cost, 0.001);
    });
  }
  it('prefers SDK settings when legacy aliases coexist', () => {
    const adapter: any = new OpenRouterGenerationProvider();
    assert.deepEqual(adapter.pickDeploymentParameters({ max_tokens: 1, maxOutputTokens: 200, top_p: 0.1, topP: 0.7, unknown: true }), { max_tokens: 200, top_p: 0.7 });
  });
  it('returns plain text for a prompt trial without a response format', async () => {
    const fetchStub = sinon.stub(globalThis, 'fetch').resolves(new Response(JSON.stringify({ model: 'actual',
      choices: [{ finish_reason: 'stop', message: { content: 'Plain answer' } }], usage: { prompt_tokens: 1, completion_tokens: 2, total_tokens: 3 } }), { status: 200 }));
    const result = await new OpenRouterGenerationProvider().invoke({
      connection: { endpoint: 'https://openrouter.ai/api/v1', secret: 'PRIVATE', timeoutMs: 1000 }, deployment: { modelId: 'test' },
      messages: [{ role: 'user', content: 'Hi' }], correlationId: 'trial',
    }, new AbortController().signal);
    assert.equal(result.content, 'Plain answer');
    assert.equal(JSON.parse(String(fetchStub.firstCall.args[1]?.body)).response_format, undefined);
  });
  it('checks connections without requiring saved model deployments', async () => {
    for (const [provider, endpoint] of [[new OpenRouterGenerationProvider(), 'https://openrouter.ai/api/v1'],
      [new BedrockGenerationProvider(), 'https://bedrock-runtime.ap-southeast-2.amazonaws.com']] as const) {
      assert.equal((await provider.healthCheck({ endpoint, timeoutMs: 1000 })).ok, true);
      assert.equal((await provider.healthCheck({ endpoint: 'https://unsafe.invalid', timeoutMs: 1000 })).ok, false);
    }
  });
  for (const adapter of ['openrouter', 'bedrock']) for (const status of [400, 404]) {
    it(`maps ${adapter} HTTP ${status} from a minimal call to a safe model error`, async () => {
      const fetchStub = sinon.stub(globalThis, 'fetch').resolves(new Response(JSON.stringify({
        message: 'PRIVATE PROVIDER BODY', error: { message: 'PRIVATE PROVIDER BODY', code: status },
      }), { status, headers: { 'content-type': 'application/json' } }));
      const provider = adapter === 'bedrock' ? new BedrockGenerationProvider() : new OpenRouterGenerationProvider();
      await assert.rejects(provider.invoke({
        connection: { endpoint: adapter === 'bedrock' ? 'https://bedrock-runtime.ap-southeast-2.amazonaws.com' : 'https://openrouter.ai/api/v1', secret: 'PRIVATE', timeoutMs: 1000 },
        deployment: { modelId: 'unavailable-model', parameters: { maxOutputTokens: 1 } },
        messages: [{ role: 'user', content: 'Say OK.' }], correlationId: 'provider-test',
      }, new AbortController().signal), error => error instanceof GenerationError && error.code === 'GENERATION_DEPLOYMENT_INCOMPATIBLE' && !error.message.includes('PRIVATE'));
      assert.equal(fetchStub.callCount, 1);
    });
  }
});
