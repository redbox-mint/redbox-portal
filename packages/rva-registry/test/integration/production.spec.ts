
import { UtilitiesApi, ServicesApi, ResourcesApi } from '../../dist/index.js';
import assert from 'assert';

describe('Integration Tests - Production API', () => {
    // Increase timeout because production API calls might be slow
    const TIMEOUT = 10000;

    describe('UtilitiesApi', () => {
        it('should generate a slug from a string', async function() {
            this.timeout(TIMEOUT);
            const api = new UtilitiesApi();
            const input = 'Test String Value';
            const response = await api.generateSlug(input, { headers: { 'Accept': 'application/json' } });
            
            assert.strictEqual(response.status, 200);
            assert.ok(response.data);
            assert.strictEqual(response.data.stringValue, 'test-string-value');
        });

        it('should parse a valid language tag', async function() {
            this.timeout(TIMEOUT);
            const api = new UtilitiesApi();
            const tag = 'en';
            const response = await api.parseLanguageTag(tag, { headers: { 'Accept': 'application/json' } });

            assert.strictEqual(response.status, 200);
            assert.ok(response.data);
            assert.strictEqual(response.data.tag, 'en');
        });
    });

    describe('ServicesApi', () => {
        it('should search for vocabularies', async function() {
            this.timeout(TIMEOUT);
            const api = new ServicesApi();
            const filters = JSON.stringify({ q: 'science', pp: 5 });
            const response = await api.search(filters, { headers: { 'Accept': 'application/json' } });

            const data = response.data as any;
            assert.strictEqual(response.status, 200);
            
            // Verify Solr response structure
            assert.ok(data.responseHeader);
            assert.strictEqual(data.responseHeader.status, 0);
            
            assert.ok(data.response);
            assert.ok(typeof data.response.numFound === 'number');
            assert.ok(Array.isArray(data.response.docs));
            
            // We requested pp=5, so docs should be <= 5
            assert.ok(data.response.docs.length <= 5);
        });

        it('should search for resources', async function() {
            this.timeout(TIMEOUT);
            const api = new ServicesApi();
            const filters = JSON.stringify({ q: 'science', pp: 5 });
            const response = await api.searchResources(filters, { headers: { 'Accept': 'application/json' } });

            const data = response.data as any;
            assert.strictEqual(response.status, 200);

            // Verify Solr response structure
            assert.ok(data.responseHeader);
            assert.strictEqual(data.responseHeader.status, 0);

            assert.ok(data.response);
            assert.ok(typeof data.response.numFound === 'number');
            assert.ok(Array.isArray(data.response.docs));
            
            // We requested pp=5, so docs should be <= 5
            assert.ok(data.response.docs.length <= 5);
        });
    });

    describe('ResourcesApi', () => {
        it('should fetch vocabulary 316 from production', async function() {
            this.timeout(TIMEOUT);
            const api = new ResourcesApi();
            const response = await api.getVocabularyById(
                316,
                true,
                true,
                true,
                true,
                { headers: { 'Accept': 'application/json' } }
            );

            assert.strictEqual(response.status, 200);
            assert.ok(response.data);
            assert.strictEqual(response.data.id, 316);
            assert.ok(typeof response.data.title === 'string' && response.data.title.length > 0);
            assert.ok(Array.isArray(response.data.version));
        });
    });
});
