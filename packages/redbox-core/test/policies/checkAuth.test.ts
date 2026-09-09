let expect: Chai.ExpectStatic;
import('chai').then(mod => (expect = mod.expect));
import { checkAuth, checkRecordSchemaAuth } from '../../src/policies/checkAuth';
import {
  RECORD_SCHEMA_PROBLEM_MEDIA_TYPE,
  RECORD_SCHEMA_RESPONSE_CACHE_CONTROL,
  RECORD_SCHEMA_RESPONSE_VARY,
} from '../../src/api-routes/record-schema-response';

// Mock globals

(global as any).sails = {
  config: {
    auth: {
      defaultBrand: 'default',
      defaultPortal: 'portal',
    },
  },
  log: {
    verbose: () => {},
  },
  getActions: () => ({
    'user/redirlogin': (req: any, res: any) => {
      res._redirectedToLogin = true;
    },
  }),
};

(global as any).BrandingService = {
  getBrand: (name: string) => (name ? { name } : null),
};

(global as any).RolesService = {
  getDefUnathenticatedRole: (brand: any) => 'guest',
};

(global as any).PathRulesService = {
  getRulesFromPath: (path: string, brand: any) => null,
  canRead: (rules: any, roles: string[], brandName: string) => true,
};

describe('checkAuth policy', function () {
  let originalSails: any;
  let originalBrandingService: any;
  let originalRolesService: any;
  let originalPathRulesService: any;

  beforeEach(function () {
    originalSails = (global as any).sails;
    originalBrandingService = (global as any).BrandingService;
    originalRolesService = (global as any).RolesService;
    originalPathRulesService = (global as any).PathRulesService;

    (global as any).sails = {
      config: {
        auth: {
          defaultBrand: 'default',
          defaultPortal: 'portal',
        },
      },
      log: {
        verbose: () => {},
      },
      getActions: () => ({
        'user/redirlogin': (req: any, res: any) => {
          res._redirectedToLogin = true;
        },
      }),
    };

    (global as any).BrandingService = {
      getBrand: (name: string) => (name ? { name } : null),
    };

    (global as any).RolesService = {
      getDefUnathenticatedRole: (brand: any) => 'guest',
    };

    (global as any).PathRulesService = {
      getRulesFromPath: (path: string, brand: any) => null,
      canRead: (rules: any, roles: string[], brandName: string) => true,
    };
  });

  afterEach(function () {
    (global as any).sails = originalSails;
    (global as any).BrandingService = originalBrandingService;
    (global as any).RolesService = originalRolesService;
    (global as any).PathRulesService = originalPathRulesService;
  });

  function createMockReqRes(options: {
    authenticated?: boolean;
    roles?: string[];
    branding?: string;
    path?: string;
    contentType?: string;
  }) {
    const req: any = {
      path: options.path || '/test',
      headers: {
        'content-type': options.contentType || '',
      },
      session: { branding: options.branding || 'default' },
      isAuthenticated: () => options.authenticated ?? false,
      user: options.authenticated ? { roles: options.roles || ['admin'] } : undefined,
    };
    let statusCode: number | undefined;
    let jsonBody: any;
    const responseHeaders: Record<string, string> = {};
    const res: any = {
      status: (code: number) => {
        statusCode = code;
        return res;
      },
      set: (headers: Record<string, string>) => {
        Object.assign(responseHeaders, headers);
        return res;
      },
      send: () => res,
      json: (body: any) => {
        jsonBody = body;
        return res;
      },
      _redirectedToLogin: false,
    };
    return {
      req,
      res,
      getStatus: () => statusCode,
      getJson: () => jsonBody,
      getHeaders: () => responseHeaders,
    };
  }

  it('should return 404 when branding is not found', function () {
    (global as any).BrandingService.getBrand = () => null;

    const { req, res, getStatus, getJson } = createMockReqRes({ branding: 'invalid' });
    let nextCalled = false;

    checkAuth(req, res, () => {
      nextCalled = true;
    });

    expect(nextCalled).to.be.false;
    expect(getStatus()).to.equal(404);
    expect(getJson().branding).to.equal('default');
  });

  it('should call next when no path rules exist', function () {
    const { req, res, getStatus } = createMockReqRes({ authenticated: true });
    let nextCalled = false;

    checkAuth(req, res, () => {
      nextCalled = true;
    });

    expect(nextCalled).to.be.true;
    expect(getStatus()).to.be.undefined;
  });

  it('should call next when user can read path', function () {
    (global as any).PathRulesService.getRulesFromPath = () => ({ someRule: true });
    (global as any).PathRulesService.canRead = () => true;

    const { req, res, getStatus } = createMockReqRes({ authenticated: true, roles: ['admin'] });
    let nextCalled = false;

    checkAuth(req, res, () => {
      nextCalled = true;
    });

    expect(nextCalled).to.be.true;
    expect(getStatus()).to.be.undefined;
  });

  it('should return 403 when authenticated user cannot read', function () {
    (global as any).PathRulesService.getRulesFromPath = () => ({ someRule: true });
    (global as any).PathRulesService.canRead = () => false;

    const { req, res, getStatus } = createMockReqRes({ authenticated: true, roles: ['user'] });
    let nextCalled = false;

    checkAuth(req, res, () => {
      nextCalled = true;
    });

    expect(nextCalled).to.be.false;
    expect(getStatus()).to.equal(403);
  });

  it('should return 403 JSON for unauthenticated JSON request', function () {
    (global as any).PathRulesService.getRulesFromPath = () => ({ someRule: true });
    (global as any).PathRulesService.canRead = () => false;

    const { req, res, getStatus, getJson } = createMockReqRes({
      authenticated: false,
      contentType: 'application/json',
    });
    let nextCalled = false;

    checkAuth(req, res, () => {
      nextCalled = true;
    });

    expect(nextCalled).to.be.false;
    expect(getStatus()).to.equal(403);
    expect(getJson()).to.deep.equal({ message: 'Access Denied' });
  });

  it('should redirect to login for unauthenticated HTML request', function () {
    (global as any).PathRulesService.getRulesFromPath = () => ({ someRule: true });
    (global as any).PathRulesService.canRead = () => false;

    const { req, res } = createMockReqRes({ authenticated: false, contentType: 'text/html' });
    let nextCalled = false;

    checkAuth(req, res, () => {
      nextCalled = true;
    });

    expect(nextCalled).to.be.false;
    expect(res._redirectedToLogin).to.be.true;
  });

  for (const authenticated of [true, false]) {
    it(`should return the schema Problem Details response when ${authenticated ? '' : 'un'}authenticated path ACL is denied`, function () {
      (global as any).PathRulesService.getRulesFromPath = () => ({ someRule: true });
      (global as any).PathRulesService.canRead = () => false;

      const path = '/default/portal/api/records/schemas/create/dataset';
      const { req, res, getStatus, getJson, getHeaders } = createMockReqRes({
        authenticated,
        path,
        contentType: authenticated ? 'application/json' : 'text/html',
      });
      let nextCalled = false;

      checkRecordSchemaAuth(req, res, () => {
        nextCalled = true;
      });

      expect(nextCalled).to.be.false;
      expect(res._redirectedToLogin).to.be.false;
      expect(getStatus()).to.equal(403);
      expect(getHeaders()).to.deep.equal({
        'Cache-Control': RECORD_SCHEMA_RESPONSE_CACHE_CONTROL,
        Vary: RECORD_SCHEMA_RESPONSE_VARY,
        'Content-Type': RECORD_SCHEMA_PROBLEM_MEDIA_TYPE,
      });
      expect(getJson()).to.deep.equal({
        type: 'https://redboxresearchdata.com/problems/record-schema-forbidden',
        title: 'Record schema request is not authorized',
        status: 403,
        detail: 'The record schema request is not authorized.',
        instance: path,
        code: 'record-schema.forbidden',
      });
    });
  }

  it('should use guest role for unauthenticated users', function () {
    let usedRoles: string[] | undefined;
    (global as any).PathRulesService.getRulesFromPath = () => ({ someRule: true });
    (global as any).PathRulesService.canRead = (rules: any, roles: string[]) => {
      usedRoles = roles;
      return true;
    };

    const { req, res } = createMockReqRes({ authenticated: false });

    checkAuth(req, res, () => {});

    expect(usedRoles).to.deep.equal(['guest']);
  });

  it('should bypass checkAuth when companion upload auth has already authorized request', function () {
    let getBrandCalled = false;
    (global as any).BrandingService.getBrand = () => {
      getBrandCalled = true;
      return { name: 'default' };
    };

    const { req, res, getStatus } = createMockReqRes({ authenticated: false });
    req.companionAttachmentUploadAuthorized = true;
    let nextCalled = false;

    checkAuth(req, res, () => {
      nextCalled = true;
    });

    expect(nextCalled).to.be.true;
    expect(getStatus()).to.be.undefined;
    expect(getBrandCalled).to.be.false;
  });
});
