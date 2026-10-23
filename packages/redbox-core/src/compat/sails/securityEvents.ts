import { Services as Owned } from '../../integrations/SecurityEvents';
import { getSiemRepository } from '../../persistence/siem/runtime';
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Only the comparison boundary translates request shapes, globals and shutdown. */
export class LegacySecurityEventService extends Owned.SecurityEventService {
  constructor() {
    super({
      get repository() {
        return getSiemRepository();
      },
      get log() {
        return sails.log;
      },
      brand: value => BrandingService.getBrandById(value) ?? BrandingService.getBrand(value),
      configuration: name => Reflect.get(AppConfigService.getAppConfigurationForBrand(name), 'siem'),
      enqueue: (name, data) => AgendaQueueService.now(name, data),
      record: oid => RecordsService.getMeta(oid),
    });
  }
  protected _exportedMethods: string[] = [
    'emitSecurityEvent',
    'requestContext',
    'emitRequestFailure',
    'emitFromUserAudit',
    'emitFromRecordAudit',
    'emitFromIntegrationAudit',
    'emitFromAttachmentAudit',
    'storeSecurityEvent',
    'init',
    'drain',
    'queryEvents',
  ];

  private shutdownRegistered = false;
  async init(): Promise<void> {
    if (this.shutdownRegistered) return;
    this.shutdownRegistered = true;
    const previous = sails.config.beforeShutdown;
    sails.config.beforeShutdown = callback => {
      void this.drain().then(() => {
        try {
          if (previous) previous(callback);
          else callback();
        } catch (error) {
          callback(error);
        }
      }, callback);
    };
  }
  /** Selected request fields only: never include body, cookies, headers or session. */
  public requestContext(req: Sails.Req): Record<string, unknown> {
    const brand = BrandingService.getBrandFromReq(req);
    return {
      brandId: brand?.id,
      portalId: BrandingService.getPortalFromReq(req),
      method: req.method,
      path: req.path,
      ip: req.ip,
      userAgent: req.headers?.['user-agent'],
    };
  }

  public async emitRequestFailure(
    req: Sails.Req,
    eventType: 'authentication.login.failure' | 'authorization.failure',
    source: string,
    subject?: Record<string, unknown>
  ): Promise<void> {
    try {
      const context = this.requestContext(req);
      if (typeof context.brandId !== 'string' || !context.brandId) return;
      await this.emitSecurityEvent({
        brandId: context.brandId,
        portalId: typeof context.portalId === 'string' ? context.portalId : undefined,
        eventType,
        category: eventType === 'authorization.failure' ? 'authorization' : 'authentication',
        severity: 'warning',
        source,
        actor: isRecord(req.user) ? { id: req.user.id, username: req.user.username, email: req.user.email } : undefined,
        subject,
        requestContext: context,
      });
    } catch {
      sails.log.error(`${this.logHeader} Failed to capture request security event`);
    }
  }

  exports(): Record<string, unknown> {
    return Object.fromEntries(
      this._exportedMethods.map(name => {
        const method: unknown = Reflect.get(this, name);
        if (typeof method !== 'function') throw new Error('Missing security-event operation: ' + name);
        return [name, method.bind(this)];
      })
    );
  }
}
