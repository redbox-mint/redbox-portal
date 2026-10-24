import _ from 'lodash';
import { firstValueFrom } from 'rxjs';
import type { ILogger } from '@researchdatabox/sails-ng-common';
import type { Services as Email } from './Email';
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
  send(
    payload: IntegrationNotificationPayload,
    ctx: { recipients: string[]; channelConfig: Record<string, unknown> }
  ): Promise<boolean>;
}

type AnyRecord = Record<string, unknown>;
type FailureThrottleState = {
  failedAt?: string;
  expiresAt?: string;
};

export interface IntegrationNotificationInput {
  readonly log: ILogger;
  readonly email: Pick<Email.Email, 'buildFromTemplate' | 'sendMessage'>;
  configuration(brandId?: string): Promise<Record<string, unknown> | null>;
  readonly state: {
    get(key: string): Promise<unknown>;
    set(key: string, value: { failedAt: string; expiresAt: string } | null, expirySeconds: number): Promise<void>;
  };
}

export namespace Services {
  export class IntegrationNotificationService {
    protected readonly logHeader = 'IntegrationNotificationService::';
    constructor(protected readonly input: IntegrationNotificationInput) {}

    public async dispatch(job: AnyRecord): Promise<void> {
      try {
        const jobObj = job as AnyRecord;
        const jobAttrs = (jobObj.attrs ?? {}) as AnyRecord;
        const data = ((jobAttrs.data ?? jobAttrs) as Partial<IntegrationAuditModel>) ?? {};

        if (!data.redboxOid || !data.integrationName || !data.status) {
          this.input.log.warn(`${this.logHeader} Dispatch called with incomplete data, skipping.`);
          return;
        }

        const brandId = data.brandId;
        let brandConfig: Record<string, unknown>;

        try {
          const rawConfig = await this.input.configuration(brandId);
          brandConfig = rawConfig ?? {};
        } catch {
          this.input.log.error(`${this.logHeader} Failed to resolve notification config.`);
          return;
        }

        if (!brandConfig.enabled) {
          this.input.log.verbose(`${this.logHeader} Notification disabled for brand, skipping.`);
          return;
        }

        const integrationName = (data.integrationName || '').toLowerCase();
        const rawPerIntegration =
          (brandConfig.perIntegration as Record<string, Record<string, unknown>> | undefined) ?? {};
        const perIntegration = Object.fromEntries(
          Object.entries(rawPerIntegration).map(([key, val]) => [key.toLowerCase(), val])
        );
        const integrationOverride = perIntegration[integrationName] ?? {};

        const effectiveConfig: Record<string, unknown> = {
          ...brandConfig,
          ..._.pick(integrationOverride, [
            'statuses',
            'recipients',
            'channels',
            'throttle',
            'recoveryAlerts',
            'recordUrlBase',
          ]),
        };

        const statuses = (effectiveConfig.statuses as string[]) ?? ['failed'];
        const recoveryAlerts = (effectiveConfig.recoveryAlerts as boolean) ?? false;

        if (!(data.status === IntegrationAuditStatus.success && recoveryAlerts) && !statuses.includes(data.status)) {
          this.input.log.verbose(
            `${this.logHeader} Status '${data.status}' not in configured notification list, skipping.`
          );
          return;
        }

        if (data.status !== IntegrationAuditStatus.failed && data.status !== IntegrationAuditStatus.success) {
          return;
        }

        const cacheKey = `intnotif:${brandId ?? 'none'}:${data.redboxOid}:${integrationName}`;
        const throttle = (effectiveConfig.throttle as { enabled?: boolean; windowSeconds?: number }) ?? {
          enabled: false,
          windowSeconds: 300,
        };

        if (data.status === IntegrationAuditStatus.failed) {
          let existingState: unknown = null;
          try {
            existingState = await this.input.state.get(cacheKey);
          } catch {
            this.input.log.verbose(`${this.logHeader} Cache lookup failed, proceeding without throttle check.`);
          }

          if (throttle.enabled && existingState != null) {
            if (this.isFailureThrottleActive(existingState, throttle.windowSeconds ?? 300)) {
              this.input.log.verbose(
                `${this.logHeader} Suppressing repeated failure notification (cache key ${cacheKey}).`
              );
              return;
            }
            await this.input.state.set(cacheKey, null, 0);
          }

          const recordUrlBase = effectiveConfig.recordUrlBase as string | undefined;
          const payload = this.buildPayload(data, 'failure', recordUrlBase);
          const delivered = await this.dispatchToChannels(payload, effectiveConfig);

          if (delivered) {
            const windowSeconds = throttle.windowSeconds ?? 300;
            const failedAt = new Date();
            await this.input.state.set(
              cacheKey,
              {
                failedAt: failedAt.toISOString(),
                expiresAt: new Date(failedAt.getTime() + windowSeconds * 1000).toISOString(),
              },
              windowSeconds
            );
          }
        } else if (data.status === IntegrationAuditStatus.success) {
          if (!recoveryAlerts) {
            return;
          }

          let existingState: unknown = null;
          try {
            existingState = await this.input.state.get(cacheKey);
          } catch {
            this.input.log.verbose(`${this.logHeader} Cache lookup failed, treating as no prior failure.`);
          }

          if (existingState == null) {
            this.input.log.verbose(`${this.logHeader} No prior failure state for ${cacheKey}, recovery not needed.`);
            return;
          }

          const recordUrlBase = effectiveConfig.recordUrlBase as string | undefined;
          const payload = this.buildPayload(data, 'recovery', recordUrlBase);
          await this.dispatchToChannels(payload, effectiveConfig);

          await this.input.state.set(cacheKey, null, 0);
        }
      } catch {
        this.input.log.error(`${this.logHeader} Dispatch failed.`);
      }
    }

    private isFailureThrottleActive(state: unknown, windowSeconds: number): boolean {
      if (!_.isPlainObject(state)) {
        return state != null;
      }

      const throttleState = state as FailureThrottleState;
      if (typeof throttleState.expiresAt === 'string' && throttleState.expiresAt.trim() !== '') {
        return Date.parse(throttleState.expiresAt) > Date.now();
      }

      if (typeof throttleState.failedAt === 'string' && throttleState.failedAt.trim() !== '') {
        const failedAt = Date.parse(throttleState.failedAt);
        return Number.isFinite(failedAt) && failedAt + windowSeconds * 1000 > Date.now();
      }

      return true;
    }

    private buildPayload(
      entry: Partial<IntegrationAuditModel>,
      kind: 'failure' | 'recovery',
      recordUrlBase?: string
    ): IntegrationNotificationPayload {
      const severity = kind === 'failure' ? 'error' : 'info';
      const timestamp = new Date().toISOString();
      const integrationName = entry.integrationName ?? '';
      const integrationAction = entry.integrationAction ?? '';
      const redboxOid = entry.redboxOid ?? '';

      const title =
        kind === 'failure'
          ? `Integration Failure: ${integrationName} - ${integrationAction}`
          : `Integration Recovery: ${integrationName} - ${integrationAction}`;

      const summary =
        kind === 'failure'
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

    private async dispatchToChannels(
      payload: IntegrationNotificationPayload,
      config: Record<string, unknown>
    ): Promise<boolean> {
      const channels = (config.channels as Array<Record<string, unknown>>) ?? [];
      const defaultRecipients = (config.recipients as string[]) ?? [];

      if (channels.length === 0) {
        this.input.log.warn(`${this.logHeader} No channels configured, notification not sent.`);
        return false;
      }

      let delivered = false;
      const results = await Promise.allSettled(
        channels.map(async channelCfg => {
          if (channelCfg.enabled === false) {
            return;
          }

          const channelType = channelCfg.type as string;
          const channel = this.getChannel(channelType);
          if (channel == null) {
            this.input.log.warn(`${this.logHeader} Unknown channel type '${channelType}', skipping.`);
            return;
          }

          const recipients = (channelCfg.recipients as string[]) ?? defaultRecipients;
          if (recipients.length === 0) {
            this.input.log.warn(`${this.logHeader} No recipients for channel '${channelType}', skipping.`);
            return;
          }

          try {
            const sent = await channel.send(payload, { recipients, channelConfig: channelCfg });
            if (sent) {
              delivered = true;
            }
          } catch {
            this.input.log.error(`${this.logHeader} Channel '${channelType}' send failed.`);
          }
        })
      );

      const rejected = results.filter(r => r.status === 'rejected');
      if (rejected.length > 0) {
        this.input.log.error(`${this.logHeader} ${rejected.length} channel(s) failed to send notification.`);
      }

      return delivered;
    }

    private _channels: Map<string, IntegrationNotificationChannel> | null = null;

    private getChannel(type: string): IntegrationNotificationChannel | undefined {
      if (this._channels == null) {
        this._channels = new Map<string, IntegrationNotificationChannel>();
        this._channels.set('email', new EmailChannel({ email: this.input.email, log: this.input.log }));
      }
      return this._channels.get(type);
    }
  }
}

export class EmailChannel implements IntegrationNotificationChannel {
  readonly type = 'email';
  constructor(protected readonly input: Pick<IntegrationNotificationInput, 'email' | 'log'>) {}

  async send(
    payload: IntegrationNotificationPayload,
    ctx: { recipients: string[]; channelConfig: Record<string, unknown> }
  ): Promise<boolean> {
    const recipients = ctx.recipients;
    if (recipients.length === 0) {
      this.input.log.warn(`EmailChannel:: No recipients, skipping notification.`);
      return false;
    }

    const templateName =
      (ctx.channelConfig?.template as string | undefined) ??
      (payload.kind === 'failure' ? 'integrationFailure' : 'integrationRecovery');

    const subject = payload.title;

    const templateData = { ...payload } as unknown as Record<string, unknown>;

    let buildResult: Record<string, unknown>;
    try {
      buildResult = await firstValueFrom(this.input.email.buildFromTemplate(templateName, templateData));
    } catch {
      this.input.log.error(`EmailChannel:: Failed to build template '${templateName}'.`);
      return false;
    }

    if (buildResult['status'] !== 200) {
      this.input.log.error('EmailChannel:: Template did not render successfully.');
      return false;
    }

    const body = buildResult['body'] as string;
    try {
      const sendResult = (await firstValueFrom(this.input.email.sendMessage(recipients.join(','), body, subject))) as {
        success: boolean;
        msg: string;
      };
      if (!sendResult.success) {
        this.input.log.error('EmailChannel:: Failed to send email.');
        return false;
      }
      return true;
    } catch {
      this.input.log.error(`EmailChannel:: Email send failed.`);
      return false;
    }
  }
}
