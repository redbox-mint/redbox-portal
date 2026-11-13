import { expect } from 'chai';
import * as sinon from 'sinon';
import { generation } from '../../src/config/generation.config';
import { GenerationError } from '../../src/model/generation';
import { BedrockGenerationProvider } from '../../src/services/generation/providers/BedrockGenerationProvider';
import { OpenRouterGenerationProvider } from '../../src/services/generation/providers/OpenRouterGenerationProvider';

// Exercise guarded fetch through the real AI SDK adapters with actual Web response streams.
for (const adapter of ['bedrock', 'openrouter'] as const) {
  describe(`${adapter} provider response bounds`, () => {
    let originalSails: unknown;
    const provider = () => adapter === 'bedrock' ? new BedrockGenerationProvider() : new OpenRouterGenerationProvider();
    const request = () => ({
      connection: { endpoint: adapter === 'bedrock' ? 'https://bedrock-runtime.ap-southeast-2.amazonaws.com/' : 'https://openrouter.ai/api/v1',
        secret: 'test-token', timeoutMs: 1000 },
      deployment: { modelId: adapter === 'bedrock' ? 'amazon.nova-lite-v1:0' : 'provider/model' },
      messages: [{ role: 'user' as const, content: 'Synthetic input' }], responseSchema: { type: 'object' }, correlationId: 'bounded-run',
    });
    beforeEach(() => {
      originalSails = Reflect.get(globalThis, 'sails');
      Reflect.set(globalThis, 'sails', { config: { generation: structuredClone(generation) } });
    });
    afterEach(() => { sinon.restore(); Reflect.set(globalThis, 'sails', originalSails); });
    async function reject(promise: Promise<unknown>): Promise<GenerationError> {
      try { await promise; } catch (error) {
        expect(error).to.be.instanceOf(GenerationError); return error as GenerationError;
      }
      throw new Error('Expected provider rejection');
    }
    it('cancels an oversized body without Content-Length before draining it', async () => {
      sails.config.generation.provider.maxResponseBytes = 64;
      let reads = 0;
      const cancel = sinon.spy();
      const response = new Response(new ReadableStream<Uint8Array>({
        pull(controller) {
          reads++;
          controller.enqueue(new TextEncoder().encode('éééé')); // Eight bytes, four characters.
          if (reads === 200) controller.close();
        }, cancel,
      }, { highWaterMark: 0 }));
      expect(response.headers.has('content-length')).to.equal(false);
      sinon.stub(globalThis, 'fetch').resolves(response);
      const error = await reject(provider().invoke(request(), new AbortController().signal));
      expect(error.code).to.equal('GENERATION_OUTPUT_PARSE_FAILED');
      expect(reads).to.equal(9);
      expect(cancel.calledOnce).to.equal(true);
    });
    it('cancels a declared oversized response without reading it', async () => {
      sails.config.generation.provider.maxResponseBytes = 64;
      const pull = sinon.spy(); const cancel = sinon.spy();
      sinon.stub(globalThis, 'fetch').resolves(new Response(new ReadableStream({ pull, cancel }, { highWaterMark: 0 }),
        { headers: { 'content-length': '65' } }));
      const error = await reject(provider().invoke(request(), new AbortController().signal));
      expect(error.code).to.equal('GENERATION_OUTPUT_PARSE_FAILED');
      expect(pull.called).to.equal(false); expect(cancel.calledOnce).to.equal(true);
    });
    it('preserves UTF-8 characters split across byte chunks at the exact size limit', async () => {
      const output = { title: 'Coastal café 🌊' };
      const body = adapter === 'bedrock' ? {
        output: { message: { role: 'assistant', content: [{ toolUse: { toolUseId: 'tool-1', name: 'json', input: output } }] } },
        stopReason: 'tool_use', usage: { inputTokens: 1, outputTokens: 2, totalTokens: 3 },
      } : {
        model: 'provider/model', choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(output) } }],
        usage: { total_tokens: 3 },
      };
      const bytes = new TextEncoder().encode(JSON.stringify(body)); let offset = 0;
      sails.config.generation.provider.maxResponseBytes = bytes.byteLength;
      sinon.stub(globalThis, 'fetch').resolves(new Response(new ReadableStream<Uint8Array>({
        pull(controller) {
          if (offset === bytes.length) { controller.close(); return; }
          controller.enqueue(bytes.slice(offset, ++offset));
        },
      }, { highWaterMark: 0 })));
      const result = await provider().invoke(request(), new AbortController().signal);
      expect(JSON.parse(result.content)).to.deep.equal(output);
    });
    it('preserves transport failure classification while reading the body', async () => {
      sinon.stub(globalThis, 'fetch').resolves(new Response(new ReadableStream<Uint8Array>({
        pull(controller) { controller.error(new Error('connection dropped')); },
      }, { highWaterMark: 0 })));
      const error = await reject(provider().invoke(request(), new AbortController().signal));
      expect(error.code).to.equal('GENERATION_PROVIDER_UNAVAILABLE'); expect(error.retryable).to.equal(true);
    });
    it('cancels a pending body read when the caller aborts', async () => {
      const abort = new AbortController(); const cancel = sinon.spy();
      sinon.stub(globalThis, 'fetch').resolves(new Response(new ReadableStream<Uint8Array>({
        pull() { setTimeout(() => abort.abort(), 0); }, cancel,
      }, { highWaterMark: 0 })));
      const error = await reject(provider().invoke(request(), abort.signal));
      expect(error.code).to.equal('GENERATION_PROVIDER_TIMEOUT'); expect(error.retryable).to.equal(true);
      expect(cancel.calledOnce).to.equal(true);
    });
  });
}
