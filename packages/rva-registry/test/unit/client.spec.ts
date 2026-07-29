import assert from 'assert';
import axios, { AxiosRequestConfig, AxiosResponse } from 'axios';
import { ResourcesApi, ServicesApi, UtilitiesApi } from '../../dist/index.js';

type RecordedRequest = {
    url?: string;
    method?: string;
    data?: unknown;
};

function createMockClient(data: unknown, requests: RecordedRequest[]) {
    return axios.create({
        adapter: async (config: AxiosRequestConfig): Promise<AxiosResponse> => {
            requests.push({
                url: config.url,
                method: config.method,
                data: config.data
            });

            return {
                data,
                status: 200,
                statusText: 'OK',
                headers: {},
                config
            } as AxiosResponse;
        }
    });
}

describe('RVA registry generated client', () => {
    const basePath = 'https://registry.test';

    it('constructs utility requests and returns the response', async () => {
        const requests: RecordedRequest[] = [];
        const client = createMockClient({ stringValue: 'test-string-value' }, requests);
        const response = await new UtilitiesApi(undefined, basePath, client).generateSlug('Test String Value');

        assert.strictEqual(response.status, 200);
        assert.deepStrictEqual(response.data, { stringValue: 'test-string-value' });
        assert.deepStrictEqual(requests, [{
            url: 'https://registry.test/api/utilities/generateSlug?input=Test+String+Value',
            method: 'get',
            data: undefined
        }]);
    });

    it('constructs service search requests without using the network', async () => {
        const requests: RecordedRequest[] = [];
        const client = createMockClient({ response: { numFound: 0, docs: [] } }, requests);
        const filters = JSON.stringify({ q: 'science', pp: 5 });
        const response = await new ServicesApi(undefined, basePath, client).search(filters);

        assert.strictEqual(response.status, 200);
        assert.deepStrictEqual(requests, [{
            url: 'https://registry.test/api/services/search',
            method: 'post',
            data: `filtersJson=${encodeURIComponent(filters)}`
        }]);
    });

    it('constructs vocabulary requests without relying on production data', async () => {
        const requests: RecordedRequest[] = [];
        const client = createMockClient({ id: 316, title: 'Vocabulary' }, requests);
        const response = await new ResourcesApi(undefined, basePath, client).getVocabularyById(
            316,
            true,
            true,
            true,
            true
        );

        assert.deepStrictEqual(response.data, { id: 316, title: 'Vocabulary' });
        assert.deepStrictEqual(requests, [{
            url: 'https://registry.test/api/resource/vocabularies/316?includeVersions=true&includeAccessPoints=true&includeRelatedEntitiesAndVocabularies=true&includeLanguageList=true',
            method: 'get',
            data: undefined
        }]);
    });
});
