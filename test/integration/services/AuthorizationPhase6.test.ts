import {
  asScopeKey,
  freezeAuthorizationContext,
  type AuthorizationContext,
} from '../../../packages/redbox-core/src/authorization';
import { Services } from '../../../packages/redbox-core/src/services/AuthorizationRolloutService';

describe('Authorization Phase 6 route enforcement and rollout wiring', function () {
  this.timeout(60_000);

  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const requestId = `phase6-shadow-${suffix}`;

  after(async () => {
    await AuthorizationShadowMismatch.destroy({ sampleRequestId: requestId });
  });

  it('starts with a valid rollout mode and a complete merged route declaration inventory', async () => {
    await AuthorizationScopeService.bootstrap();
    expect(['legacy', 'shadow', 'enforce']).to.include(sails.config.authorization.mode);
    expect(() => AuthorizationRolloutService.validateRouteConfiguration()).not.to.throw();

    const routeTargets = Object.values(sails.config.routes) as Array<{
      authorization?: { kind?: string };
      routeId?: string;
    }>;
    expect(routeTargets.length).to.be.greaterThan(0);
    expect(
      routeTargets.every(target => ['scope', 'public', 'pre-auth'].includes(target.authorization?.kind ?? ''))
    ).to.equal(true);
    expect(routeTargets.every(target => typeof target.routeId === 'string' && target.routeId.length > 0)).to.equal(
      true
    );
  });

  it('atomically persists a bounded shadow discrepancy without delaying the legacy result', async () => {
    const context: AuthorizationContext = freezeAuthorizationContext({
      contextType: 'brand',
      principal: { category: 'authenticated', authMethod: 'session', active: true, userId: 'phase6-user' },
      brand: { id: 'phase6-brand', name: 'phase6', exists: true, authorized: true },
    });
    const routeId = 'GET /:branding/:portal/api/phase6 (test/Phase6Controller#show)';
    const service = new Services.AuthorizationRolloutService({
      getMode: () => 'shadow',
      collectLegacyEvidenceInEnforce: () => true,
      evaluateLegacy: () => true,
      authorizeScope: () => ({
        allowed: false,
        reasonCode: 'scope-missing',
        requiredScope: asScopeKey('record.read'),
        brandId: 'phase6-brand',
      }),
    });

    const input = {
      req: { path: '/phase6/raw-resource-value' } as unknown as Sails.Req,
      context,
      authorization: { kind: 'scope', scope: asScopeKey('record.read') },
      routeId,
      requestId,
    } as const;
    const firstResult = service.evaluateRequest(input);
    const concurrentResult = service.evaluateRequest(input);
    expect(firstResult.allowed).to.equal(true);
    expect(firstResult.enforcedBy).to.equal('legacy');
    expect(concurrentResult.allowed).to.equal(true);

    let persisted:
      | {
          count: number;
          routeId: string;
          brandId?: string;
          sampleRequestId?: string;
        }
      | undefined;
    for (let attempt = 0; attempt < 40 && persisted?.count !== 2; attempt += 1) {
      persisted = await AuthorizationShadowMismatch.findOne({ sampleRequestId: requestId });
      if (persisted?.count !== 2) await new Promise(resolve => setTimeout(resolve, 50));
    }

    expect(persisted).to.exist;
    expect(persisted?.count).to.equal(2);
    expect(persisted?.routeId).to.equal(routeId);
    expect(persisted?.brandId).to.equal('phase6-brand');
    expect(JSON.stringify(persisted)).not.to.include('raw-resource-value');
    expect(JSON.stringify(persisted)).not.to.include('phase6-user');
  });
});
