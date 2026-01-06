"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const { describe, it, beforeEach, before } = require('mocha');
// Minimal sails stub required by FigshareService
global.sails = {
    config: {
        figshareAPIEnv: {
            overrideArtifacts: {
                mapping: {
                    artifacts: {}
                }
            }
        },
        figshareAPI: {
            APIToken: 'test-token',
            baseURL: 'https://api.figshare.test.localhost',
            frontEndURL: 'https://figshare.test.localhost',
            mapping: {
                upload: {
                    fileListPageSize: 2,
                    override: {}
                },
                figshareOnlyPublishSelectedAttachmentFiles: false,
                recordAllFilesUploaded: false,
                targetState: {},
                response: {
                    article: {}
                }
            },
            diskSpaceThreshold: 0
        },
        figshareReDBoxFORMapping: {
            FORMapping: []
        },
        record: {
            createUpdateFigshareArticleLogLevel: 'verbose'
        },
        queue: {
            serviceName: ''
        }
    },
    log: {
        verbose: () => { },
        info: () => { },
        error: () => { },
        warn: () => { },
        debug: () => { }
    },
    services: {},
    on: () => { }
};
// axios is required at module load in FigshareService, so we must set the stub before importing it
const axiosCalls = [];
let axiosResponses = [];
const axiosStub = (config) => {
    axiosCalls.push(config);
    if (!axiosResponses.length) {
        return Promise.reject(new Error('No axios mock response available'));
    }
    return Promise.resolve(axiosResponses.shift());
};
require.cache[require.resolve('axios')] = { exports: axiosStub };
const { Services } = require('../../../services/FigshareService');
const FigshareService = Services.FigshareService;
describe('FigshareService - getArticleFileList pagination', () => {
    let service;
    let expect;
    before(async () => {
        // @ts-ignore
        const chai = await import('chai');
        expect = chai.expect;
    });
    beforeEach(() => {
        axiosCalls.length = 0;
        axiosResponses = [];
        service = new FigshareService();
        // Set required properties that are private in TS but accessible at runtime
        service.baseURL = 'https://api.figshare.test.localhost';
        service.APIToken = 'test-token';
        global.sails.config.figshareAPI.mapping.upload.fileListPageSize = 2;
    });
    it('aggregates multiple pages until a partial page is returned', async () => {
        axiosResponses = [
            { status: 200, statusText: 'OK', data: [{ id: 1 }, { id: 2 }] },
            { status: 200, statusText: 'OK', data: [{ id: 3 }] }
        ];
        const files = await service.getArticleFileList('123');
        expect(files.map((f) => f.id)).to.deep.equal([1, 2, 3]);
        expect(axiosCalls).to.have.length(2);
        expect(axiosCalls[0].url).to.contain('/account/articles/123/files?page_size=2&page=1');
        expect(axiosCalls[1].url).to.contain('/account/articles/123/files?page_size=2&page=2');
    });
    it('falls back to the default page size when the config value is invalid', async () => {
        global.sails.config.figshareAPI.mapping.upload.fileListPageSize = 'invalid';
        const expectedDefault = 20;
        axiosResponses = [
            { status: 200, statusText: 'OK', data: [{ id: 'a' }] }
        ];
        const files = await service.getArticleFileList('abc');
        expect(files.map((f) => f.id)).to.deep.equal(['a']);
        expect(axiosCalls).to.have.length(1);
        expect(axiosCalls[0].url).to.contain(`/account/articles/abc/files?page_size=${expectedDefault}&page=1`);
    });
    it('returns an empty list when no files are found', async () => {
        axiosResponses = [
            { status: 200, statusText: 'OK', data: [] }
        ];
        const files = await service.getArticleFileList('empty');
        expect(files).to.deep.equal([]);
        expect(axiosCalls).to.have.length(1);
        expect(axiosCalls[0].url).to.contain('/account/articles/empty/files?page_size=2&page=1');
    });
});
describe('FigshareService - isFileUploadInProgress', () => {
    let service;
    let expect;
    before(async () => {
        // @ts-ignore
        const chai = await import('chai');
        expect = chai.expect;
    });
    beforeEach(() => {
        service = new FigshareService();
        service.baseURL = 'https://api.figshare.test.localhost';
        service.APIToken = 'test-token';
    });
    it('returns true when any file has status "created"', async () => {
        const mockFileList = [{ id: 1, status: 'available' }, { id: 2, status: 'created' }];
        const inProgress = await service.isFileUploadInProgress('article-1', mockFileList);
        expect(inProgress).to.equal(true);
    });
    it('returns false when no files are in progress', async () => {
        const mockFileList = [{ id: 1, status: 'available' }];
        const inProgress = await service.isFileUploadInProgress('article-2', mockFileList);
        expect(inProgress).to.equal(false);
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiRmlnc2hhcmVTZXJ2aWNlLnRlc3QuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi8uLi8uLi90eXBlc2NyaXB0L2FwaS90ZXN0L3VuaXQvc2VydmljZXMvRmlnc2hhcmVTZXJ2aWNlLnRlc3QudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7QUFBQSxNQUFNLEVBQUUsUUFBUSxFQUFFLEVBQUUsRUFBRSxVQUFVLEVBQUUsTUFBTSxFQUFFLEdBQUcsT0FBTyxDQUFDLE9BQU8sQ0FBQyxDQUFDO0FBRTlELGlEQUFpRDtBQUNoRCxNQUFjLENBQUMsS0FBSyxHQUFHO0lBQ3RCLE1BQU0sRUFBRTtRQUNOLGNBQWMsRUFBRTtZQUNkLGlCQUFpQixFQUFFO2dCQUNqQixPQUFPLEVBQUU7b0JBQ1AsU0FBUyxFQUFFLEVBQUU7aUJBQ2Q7YUFDRjtTQUNGO1FBQ0QsV0FBVyxFQUFFO1lBQ1gsUUFBUSxFQUFFLFlBQVk7WUFDdEIsT0FBTyxFQUFFLHFDQUFxQztZQUM5QyxXQUFXLEVBQUUsaUNBQWlDO1lBQzlDLE9BQU8sRUFBRTtnQkFDUCxNQUFNLEVBQUU7b0JBQ04sZ0JBQWdCLEVBQUUsQ0FBQztvQkFDbkIsUUFBUSxFQUFFLEVBQUU7aUJBQ2I7Z0JBQ0QsMENBQTBDLEVBQUUsS0FBSztnQkFDakQsc0JBQXNCLEVBQUUsS0FBSztnQkFDN0IsV0FBVyxFQUFFLEVBQUU7Z0JBQ2YsUUFBUSxFQUFFO29CQUNSLE9BQU8sRUFBRSxFQUFFO2lCQUNaO2FBQ0Y7WUFDRCxrQkFBa0IsRUFBRSxDQUFDO1NBQ3RCO1FBQ0Qsd0JBQXdCLEVBQUU7WUFDeEIsVUFBVSxFQUFFLEVBQUU7U0FDZjtRQUNELE1BQU0sRUFBRTtZQUNOLG1DQUFtQyxFQUFFLFNBQVM7U0FDL0M7UUFDRCxLQUFLLEVBQUU7WUFDTCxXQUFXLEVBQUUsRUFBRTtTQUNoQjtLQUNGO0lBQ0QsR0FBRyxFQUFFO1FBQ0gsT0FBTyxFQUFFLEdBQUcsRUFBRSxHQUFFLENBQUM7UUFDakIsSUFBSSxF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