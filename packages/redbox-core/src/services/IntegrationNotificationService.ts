import _ from 'lodash';
import { firstValueFrom } from 'rxjs';
import { Services as services } from '../CoreService';
import { IntegrationAuditModel, IntegrationAuditStatus } from '../model/storage/IntegrationAuditModel';

export interface IntegrationNotificationPayload {
  kind: 'failure' | 'recovery';
  title: string;
  summary: string;
  severity: 'info' | 'warning' | 'error';
  redboxOid: string;
  brandId?: string;
  integrationName: string;
  integrationAction: string;
  status: string;
  triggeredBy?: string;
  message?: string;
  errorDetail?: string;
  httpStatusCode?: number;
  traceId: string;
  spanId: string;
  startedAt: string;
  completedAt?: string;
  durationMs?: number;
  recordUrl?: string;
  timestamp: string;
}

export interface IntegrationNotificationChannel {
  readonly type: string;
  send(payload: IntegrationNotificationPayload, ctx: { recipients: string[]; channelConfig: Record<string, unknown> }): Promise<void>;
}

type AnyRecord = Record<string, unknown>;

export namespace Services {
  export class IntegrationNotificationService extends services.Core.Service {
    protected override _exportedMethods: string[] = [
      'dispatch',
    ];

    constructor() {
      super();
      this.logHeader = 'IntegrationNotificationService::';
    }

    public async dispatch(job: AnyRecord): Promise<void> {
      try {
        const jobObj = job as AnyRecord;
        const jobAttrs = (jobObj.attrs ?? {}) as AnyRecord;
        const data = ((jobAttrs.data ?? jobAttrs) as Partial<IntegrationAuditModel>) ?? {};

        if (!data.redboxOid || !data.integrationName || !data.status) {
          sails.log.warn(`${this.logHeader} Dispatch called with incomplete data, skipping.`);
          return;
        }

        const brandId = data.brandId;
        let brandConfig: Record<string, unknown>;

        try {
          let resolvedBrandId = brandId ? BrandingService.getBrandById(brandId)?.id : undefined;
          if (!resolvedBrandId) {
            resolvedBrandId = BrandingService.getDefault()?.id;
          }
          if (!resolvedBrandId) {
            sails.log.error(`${this.logHeader} Could not resolve a brand id for notification config; skipping.`);
            return;
          }
          const rawConfig = await AppConfigService.getAppConfigByBrandAndKey(resolvedBrandId, 'integrationNotification') as Record<string, unknown> | null;
          brandConfig = rawConfig ?? {};
        } catch (err) {
          sails.log.error(`${this.logHeader} Failed to resolve notification config.`);
          sails.log.error(err);
          return;
        }

        if (!brandConfig.enabled) {
          sails.log.verbose(`${this.logHeader} Notification disabled for brand, skipping.`);
          return;
        }

        const integrationName = (data.integrationName || '').toLowerCase();
        const perIntegration = (brandConfig.perIntegration as Record<string, Record<string, unknown>> | undefined) ?? {};
        const integrationOverride = perIntegration[integrationName] ?? {};

        const effectiveConfig: Record<string, unknown> = {
          ...brandConfig,
          ..._.pick(integrationOverride, ['statuses', 'recipients', 'channels', 'throttle', 'recoveryAlerts', 'recordUrlBase']),
        };

        const statuses = (effectiveConfig.statuses as string[]) ?? ['failed'];
        const recoveryAlerts = (effectiveConfig.recoveryAlerts as boolean) ?? false;

        if (!statuses.includes(data.status)) {
          sails.log.verbose(`${this.logHeader} Status '${data.status}' not in configured notification list, skipping.`);
          return;
        }

        if (data.status !== IntegrationAuditStatus.failed && data.status !== IntegrationAuditStatus.success) {
          return;
        }

        const cacheKey = `intnotif:${brandId ?? 'none'}:${data.redboxOid}:${integrationName}`;
        const throttle = (effectiveConfig.throttle as { enabled?: boolean; windowSeconds?: number }) ?? { enabled: false, windowSeconds: 300 };

        if (data.status === IntegrationAuditStatus.failed) {
          let existingState: unknown = null;
          try {
            existingState = await firstValueFrom(CacheService.get(cacheKey));
          } catch (_cacheErr) {
            sails.log.verbose(`${this.logHeader} Cache lookup failed, proceeding without throttle check.`);
          }

          if (throttle.enabled && existingState != null) {
            sails.log.verbose(`${this.logHeader} Suppressing repeated failure notification (cache key ${cacheKey}).`);
            return;
          }

          const recordUrlBase = effectiveConfig.recordUrlBase as string | undefined;
          const payload = this.buildPayload(data, 'failure', recordUrlBase);
          await this.dispatchToChannels(payload, effectiveConfig);

          CacheService.set(cacheKey, { failedAt: new Date().toISOString() }, throttle.windowSeconds ?? 300);
        } else if (data.status === IntegrationAuditStatus.success) {
          if (!recoveryAlerts) {
            return;
          }

          let existingState: unknown = null;
          try {
            existingState = await firstValueFrom(CacheService.get(cacheKey));
          } catch (_cacheErr) {
            sails.log.verbose(`${this.logHeader} Cache lookup failed, treating as no prior failure.`);
          }

          if (existingState == null) {
            sails.log.verbose(`${this.logHeader} No prior failure state for ${cacheKey}, recovery not needed.`);
            return;
          }

          const recordUrlBase = effectiveConfig.recordUrlBase as string | undefined;
          const payload = this.buildPayload(data, 'recovery', recordUrlBase);
          await this.dispatchToChannels(payload, effectiveConfig);

          CacheService.set(cacheKey, null, 0);
        }
      } catch (err) {
        sails.log.error(`${this.logHeader} Dispatch failed.`);
        sails.log.error(err);
      }
    }

    private buildPayload(entry: Partial<IntegrationAuditModel>, kind: 'failure' | 'recovery', recordUrlBase?: string): IntegrationNotificationPayload {
      const severity = kind === 'failure' ? 'error' : 'info';
      const timestamp = new Date().toISOString();
      const integrationName = entry.integrationName ?? '';
      const integrationAction = entry.integrationAction ?? '';
      const redboxOid = entry.redboxOid ?? '';

      const title = kind === 'failure'
        ? `Integration Failure: ${integrationName} - ${integrationAction}`
        : `Integration Recovery: ${integrationName} - ${integrationAction}`;

      const summary = kind === 'failure'
        ? `Integration '${integrationName}' failed during '${integrationAction}' for record '${redboxOid}'.`
        : `Integration '${integrationName}' recovered during '${integrationAction}' for record '${redboxOid}'.`;

      let recordUrl: string | undefined;
      if (recordUrlBase) {
        recordUrl = `${recordUrlBase.replace(/\/+$/, '')}/${redboxOid}`;
      }

      return {
        kind,
        title,
        summary,
        severity,
        redboxOid,
        brandId: entry.brandId,
        integrationName,
        integrationAction,
        status: entry.status ?? '',
        triggeredBy: entry.triggeredBy,
        message: entry.message,
        errorDetail: entry.errorDetail,
        httpStatusCode: entry.httpStatusCode,
        traceId: entry.traceId ?? '',
        spanId: entry.spanId ?? '',
        startedAt: entry.startedAt ?? '',
        completedAt: entry.completedAt,
        durationMs: entry.durationMs,
        recordUrl,
        timestamp,
      };
    }

    private async dispatchToChannels(payload: IntegrationNotificationPayload, config: Record<string, unknown>): Promise<void> {
      const channels = (config.channels as Array<Record<string, unknown>>) ?? [];
      const defaultRecipients = (config.recipients as string[]) ?? [];

      if (channels.length === 0) {
        sails.log.warn(`${this.logHeader} No channels configured, notification not sent.`);
        return;
      }

      const results = await Promise.allSettled(
        channels.map(async (channelCfg) => {
          if (channelCfg.enabled === false) {
            return;
          }

          const channelType = channelCfg.type as string;
          const channel = this.getChannel(channelType);
          if (channel == null) {
            sails.log.warn(`${this.logHeader} Unknown channel type '${channelType}', skipping.`);
            return;
          }

          const recipients = (channelCfg.recipients as string[]) ?? defaultRecipients;
          if (recipients.length === 0) {
            sails.log.warn(`${this.logHeader} No recipients for channel '${channelType}', skipping.`);
            return;
          }

          try {
            await channel.send(payload, { recipients, channelConfig: channelCfg });
          } catch (err) {
            sails.log.error(`${this.logHeader} Channel '${channelType}' send failed.`);
            sails.log.error(err);
          }
        })
      );

      const rejected = results.filter(r => r.status === 'rejected');
      if (rejected.length > 0) {
        sails.log.error(`${this.logHeader} ${rejected.length} channel(s) failed to send notification.`);
      }
    }

    private _channels: Map<string, IntegrationNotificationChannel> | null = null;

    private getChannel(type: string): IntegrationNotificationChannel | undefined {
      if (this._channels == null) {
        this._channels = new Map<string, IntegrationNotificationChannel>();
        this._channels.set('email', new EmailChannel());
      }
      return this._channels.get(type);
    }
  }
}

export class EmailChannel implements IntegrationNotificationChannel {
  readonly type = 'email';

  async send(payload: IntegrationNotificationPayload, ctx: { recipients: string[]; channelConfig: Record<string, unknown> }): Promise<void> {
    const recipients = ctx.recipients;
    if (recipients.length === 0) {
      sails.log.warn(`EmailChannel:: No recipients, skipping notification.`);
      return;
    }

    const templateName = (ctx.channelConfig?.template as string | undefined)
      ?? (payload.kind === 'failure' ? 'integrationFailure' : 'integrationRecovery');

    const subject = payload.title;

    const templateData = { ...payload } as unknown as Record<string, unknown>;

    let buildResult: Record<string, unknown>;
    try {
      buildResult = await firstValueFrom(EmailService.buildFromTemplate(templateName, templateData));
    } catch (err) {
      sails.log.error(`EmailChannel:: Failed to build template '${templateName}'.`);
      sails.log.error(err);
      return;
    }

    if (buildResult['status'] !== 200) {
      sails.log.error(`EmailChannel:: Template '${templateName}' returned status ${buildResult['status']}.`);
      return;
    }

    const body = buildResult['body'] as string;
    try {
      const sendResult = await firstValueFrom(EmailService.sendMessage(recipients.join(','), body, subject));
      if (!sendResult.success) {
        sails.log.error(`EmailChannel:: Failed to send email: ${sendResult.msg}`);
      }
    } catch (err) {
      sails.log.error(`EmailChannel:: Email send failed.`);
      sails.log.error(err);
    }
  }
}

declare global {
  let IntegrationNotificationService: Services.IntegrationNotificationService;
}
