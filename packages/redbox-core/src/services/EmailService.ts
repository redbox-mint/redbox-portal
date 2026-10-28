// Copyright (c) 2017 Queensland Cyber Infrastructure Foundation (http://www.qcif.edu.au/)
//
// GNU GENERAL PUBLIC LICENSE
//    Version 2, June 1991
//
// This program is free software; you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation; either version 2 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU General Public License for more details.
//
// You should have received a copy of the GNU General Public License along
// with this program; if not, write to the Free Software Foundation, Inc.,
// 51 Franklin Street, Fifth Floor, Boston, MA 02110-1301 USA.

import {
  Observable, defer, from, firstValueFrom
} from 'rxjs';
import { Services as services } from '../CoreService';
// removed deprecated rxjs/add/operator imports; use firstValueFrom instead
import { type TemplateDelegate as HandlebarsTemplateDelegate } from 'handlebars';
import * as fs from 'graceful-fs';
import { join } from 'node:path';
import { EmailTemplateError, readEmailTemplateDefault, safeEmailTemplateError, validateEmailTemplate, emailTemplateContextRoots, validateEmailLength, hardenEmailSubject } from './EmailTemplateService';
import * as nodemailer from 'nodemailer';
import {isObservable} from "rxjs";
import {handlebarsCompile} from "@researchdatabox/sails-ng-common";
import { compileEmailTemplatePreview } from '../utilities/EmailTemplatePreview';
import { emailSyntaxSourcePosition } from '../utilities/EmailTemplateSyntax';


/** Trusted delivery context; never inferred from template data or request bodies. */
export interface EmailRenderContext {
  brandId?: string;
  /** Explicit caller overrides take precedence over the resolved template. */
  subject?: string;
  /** Runtime default for integration notifications; DB subjects still take priority. */
  defaultSubject?: string;
  format?: string;
}

export function emailRecordUrl(brandUrl: unknown, oid: unknown, action: 'view' | 'edit'): string | undefined {
  return typeof brandUrl === 'string' && brandUrl && typeof oid === 'string' && oid
    ? `${brandUrl}/record/${action}/${encodeURIComponent(oid)}` : undefined;
}

export function curateEmailRecordData(data: Record<string, unknown>): Record<string, unknown> {
  const prepared = { ...data };
  const raw = data.record as Record<string, unknown> | undefined;
  if (raw && typeof raw === 'object') {
    // Explicitly construct display data: no authorization, storage, version or form internals.
    const meta = (raw.metaMetadata ?? {}) as Record<string, unknown>;
    const workflow = (raw.workflow ?? {}) as Record<string, unknown>;
    prepared['record'] = {
      oid: data.oid ?? raw.oid ?? raw.redboxOid ?? '',
      metadata: _.cloneDeep(raw.metadata ?? {}),
      lastSaveDate: raw.lastSaveDate,
      dateCreated: raw.dateCreated,
      workflow: _.pick(workflow, ['stage', 'stageLabel']),
      metaMetadata: _.pick(meta, ['type', 'brandId', 'createdBy', 'createdOn', 'lastSaveDate']),
    };
    const record = prepared['record'] as Record<string, unknown>;
    record.redboxOid = record.oid;
    prepared['oid'] = record.oid;
    // Conventional display values are defaults, not aliases: caller edits always win.
    const title = _.get(prepared, 'record.metadata.title');
    if (!Object.hasOwn(data, 'title') && typeof title === 'string') prepared['title'] = title;
    const brandUrl = _.get(data, 'portal.brandUrl');
    const oid = prepared['oid'];
    for (const [key, action] of [['viewUrl', 'view'], ['editUrl', 'edit']] as const) {
      if (typeof raw[key] === 'string') record[key] = raw[key];
      else {
        const url = emailRecordUrl(brandUrl, oid, action);
        if (url !== undefined) record[key] = url;
      }
    }
  }
  // Retain the legacy alias without leaving a second copy of the full record reachable.
  if (data.imports) prepared['imports'] = { record: prepared['record'], oid: prepared['oid'] };
  return prepared;
}

// Content/context overrides exist only for response objects created by this internal
// admin helper. No data/context property, send argument or notification input can select them.
interface EmailAdminPreviewRequest {
  content: { subject: string; body: string; format: 'html' | 'text' }; data: Record<string, unknown>;
  suppliedDefault?: boolean;
  failure?: Pick<EmailTemplateError, 'code' | 'message' | 'diagnostic'>;
  // Content-free markers of which field, and where in it, rendering failed.
  failedField?: 'subject' | 'body';
  failedLine?: number;
  failedColumn?: number;
}
// Mounted hooks can import core through a different package path, just as source
// and compiled copies can coexist. The admin helper and hook's base class must
// share the same response-object registry across those module instances.
const adminPreviewKey = Symbol.for('@researchdatabox/redbox-core/emailAdminPreviewRequests');
const previewState = globalThis as typeof globalThis & {
  [adminPreviewKey]?: WeakMap<Record<string, unknown>, EmailAdminPreviewRequest>;
};
const adminPreviewRequests = (previewState[adminPreviewKey] ??= new WeakMap<Record<string, unknown>, EmailAdminPreviewRequest>());

const adminPreviewBuildKey = Symbol.for('@researchdatabox/redbox-core/emailAdminPreviewBuildRequests');
const previewBuildState = globalThis as typeof globalThis & {
  [adminPreviewBuildKey]?: WeakMap<Record<string, unknown>, EmailAdminPreviewRequest>;
};
const adminPreviewBuildRequests = (previewBuildState[adminPreviewBuildKey] ??= new WeakMap<Record<string, unknown>, EmailAdminPreviewRequest>());

/** Internal service-to-service preview seam, deliberately absent from EmailService.exports(). */
export async function renderEmailAdminPreview(email: Pick<Services.Email, 'buildFromTemplateAsync' | 'buildFromTemplate'>,
  templateId: string, content: { subject: string; body: string; format: 'html' | 'text' }, data: Record<string, unknown>,
  integration?: { context: EmailRenderContext; suppliedDefault: boolean }) {
  const response: Record<string, unknown> = {};
  // Preserve the filtered null-prototype context and use preview-local helpers.
  const request: EmailAdminPreviewRequest = { content: { ...content }, data, suppliedDefault: integration?.suppliedDefault };
  if (integration) adminPreviewBuildRequests.set(data, request);
  else adminPreviewRequests.set(response, request);
  try {
    // Hooks still run, including post-render processing. Their pre-render additions
    // cannot replace edited display values or widen the filtered submitted context.
    const result = integration
      ? await firstValueFrom(email.buildFromTemplate(templateId, data, integration.context))
      : await email.buildFromTemplateAsync(templateId, structuredClone(data), response);
    if (result['status'] !== 200 || typeof result['subject'] !== 'string' || typeof result['body'] !== 'string') {
      // Recreate safe typed failures locally: the hook's core module can have a
      // distinct EmailTemplateError constructor. Only our private registry can
      // supply this marker, never caller-controlled data or an arbitrary error.
      const failure = request.failure
        ? new EmailTemplateError(request.failure.code, request.failure.message, undefined, request.failure.diagnostic)
        : result['ex'] instanceof EmailTemplateError ? result['ex']
        : new EmailTemplateError('RENDER_FAILED', 'Unable to render email preview.');
      if (failure.code === 'RENDER_FAILED' && request.failedField) {
        throw new EmailTemplateError('RENDER_FAILED', failure.message, undefined,
          { field: request.failedField, reason: 'INVALID_SYNTAX',
            line: request.failedLine ?? 1, column: request.failedColumn ?? 1 });
      }
      throw failure;
    }
    return result;
  } finally { adminPreviewRequests.delete(response); adminPreviewBuildRequests.delete(data); }
}

export namespace Services {
  /**
   *
   *
   * @author <a target='_' href='https://github.com/thomcuddihy'>Thom Cuddihy</a>
   *
   */
  export class Email extends services.Core.Service {
    protected override _exportedMethods: string[] = [
      'sendMessage',
      'buildFromTemplate',
      'buildFromTemplateAsync',
      'validateExposedConfig',
      'buildPreviewContext',
      'sendTemplate',
      'sendRecordNotification',
      'evaluateProperties',
      'runTemplate',
    ];

    // Keep the three-argument async hook seam intact. Hooks (including SCU) pass
    // the response object to super after adding display values to data.
    private previewContextRequests = new WeakMap<Record<string, unknown>, EmailRenderContext>();

    private renderContexts = new WeakMap<Record<string, unknown>, EmailRenderContext>();

    // Preserve trusted brand display context during address/string rendering,
    // without reading tenant identifiers from caller-controlled display fields.
    private renderDataContexts = new WeakMap<Record<string, unknown>, EmailRenderContext>();
    private missingExposedPaths = new Set<string>();

    /**
     * Validate emailnotification.settings.exposedConfigPaths eagerly (called at
     * bootstrap), so a bad allowlist fails startup instead of every send.
     */
    public validateExposedConfig(): void {
      emailTemplateContextRoots();
      validateEmailLength('', 'subject');
      validateEmailLength('', 'body');
      this.createRenderData({});
    }

    /** Construct reserved display values; never merge caller data into these objects. */
    private createRenderData(data: Record<string, unknown>, context = this.renderDataContexts.get(data) ?? {}, curateRecord = true): Record<string, unknown> {
      // Minimal hook/test apps may lift without email settings; use the default allowlist.
      const configuredPaths = sails.config.emailnotification?.settings?.exposedConfigPaths;
      const paths = configuredPaths === undefined ? ['appUrl'] : configuredPaths;
      const unsafeSegment = (segment: string) => ['__proto__', 'constructor', 'prototype'].includes(segment);
      if (!Array.isArray(paths)) {
        throw new Error('emailnotification.settings.exposedConfigPaths must be an array of dotted paths.');
      }
      paths.forEach((path: unknown, index: number) => {
        if (typeof path !== 'string' ||
          path.split('.').some(segment => !segment.trim() || segment !== segment.trim() || unsafeSegment(segment))) {
          throw new Error(`emailnotification.settings.exposedConfigPaths entry ${index} (${JSON.stringify(path)}) ` +
            'must be a non-empty dotted path without prototype segments.');
        }
      });

      // Only plain, acyclic data may cross this boundary. Do not retain functions,
      // accessors, class instances or references to any live configuration object.
      const clone = (value: unknown, ancestors = new Set<object>()): unknown => {
        if (value === null || ['string', 'number', 'boolean', 'undefined'].includes(typeof value)) return value;
        if ((!Array.isArray(value) && !_.isPlainObject(value)) || ancestors.has(value as object)) {
          throw new Error('Email exposed config values must be plain, acyclic data.');
        }
        const nextAncestors = new Set(ancestors).add(value as object);
        const copy: Record<string, unknown> | unknown[] = Array.isArray(value) ? new Array(value.length) : {};
        for (const key of Object.keys(value as object)) {
          const descriptor = Object.getOwnPropertyDescriptor(value, key)!;
          if (unsafeSegment(key) || !Object.hasOwn(descriptor, 'value')) {
            throw new Error('Email exposed config values must not contain prototype keys or accessors.');
          }
          Object.defineProperty(copy, key, {
            value: clone(descriptor.value, nextAncestors), enumerable: true, writable: true, configurable: true,
          });
        }
        return copy;
      };

      const appUrl = typeof sails.config.appUrl === 'string' ? sails.config.appUrl : '';
      const sailsConfig: Record<string, unknown> = { appUrl };
      for (const path of paths) {
        // appUrl is always present as a string, even on installations without a configured URL.
        if (path === 'appUrl') continue;
        try {
          const segments = path.split('.');
          let value: unknown = sails.config;
          for (const segment of segments) {
            const descriptor = value != null ? Object.getOwnPropertyDescriptor(value, segment) : undefined;
            if (descriptor && !Object.hasOwn(descriptor, 'value')) {
              throw new Error('Email exposed config paths must not reference accessors.');
            }
            value = descriptor?.value;
          }
          if (value === undefined) {
            if (!this.missingExposedPaths.has(path)) {
              this.missingExposedPaths.add(path);
              this.updateChronicle({ emailMissingExposedConfigPath: path }, [], 'warn');
            }
            continue;
          }
          let target = sailsConfig;
          for (const segment of segments.slice(0, -1)) {
            if (!Object.hasOwn(target, segment)) target[segment] = {};
            if (!_.isPlainObject(target[segment]) && !Array.isArray(target[segment])) {
              throw new Error('Conflicting email exposed config paths.');
            }
            target = target[segment] as Record<string, unknown>;
          }
          target[segments[segments.length - 1]] = clone(value);
        } catch (error) {
          throw new Error(`emailnotification.settings.exposedConfigPaths entry '${path}': ${(error as Error).message}`, { cause: error });
        }
      }

      const brand = context.brandId !== undefined && typeof BrandingService !== 'undefined'
        ? BrandingService.getBrandById?.(context.brandId) : undefined;
      const brandName = typeof brand?.name === 'string' ? brand.name : '';
      const portalName = typeof sails.config.auth?.defaultPortal === 'string' ? sails.config.auth.defaultPortal : '';
      const rootContext = sails.config.http?.rootContext;
      // Same shape as BrandingService.getFullPath: appUrl[/rootContext]/brand/portal.
      const brandPath = [typeof rootContext === 'string' ? rootContext.replace(/^\/+|\/+$/g, '') : '', brandName, portalName]
        .filter(Boolean).join('/');
      const portal = {
        appUrl,
        brandName,
        brandUrl: appUrl && brandName && portalName ? `${appUrl.replace(/\/+$/, '')}/${brandPath}` : '',
        portalName,
      };
      const prepared: Record<string, unknown> = { ...data, sailsConfig, portal };
      if (curateRecord) Object.assign(prepared, curateEmailRecordData({ ...data, sailsConfig, portal }));
      this.renderDataContexts.set(prepared, { ...context });
      return prepared;
    }

    private compiledTemplates: Map<string, HandlebarsTemplateDelegate> = new Map();

    /**
     * Compile (and cache) a Handlebars template from its source string.
     * @param templateName The Handlebars template source.
     * @return The compiled template delegate.
     * @private
     */
    private getCompiledTemplate(templateName: string): HandlebarsTemplateDelegate {
      if (!this.compiledTemplates.has(templateName)) {
        const filePath = join(sails.config.emailnotification.settings.templateDir, templateName + '.hbs');
        const source = fs.readFileSync(filePath, 'utf-8') || '';
        this.compiledTemplates.set(templateName, handlebarsCompile(source, { strict: true }));
      }
      return this.compiledTemplates.get(templateName)!;
    }

    /**
     * Simple API service to POST a message queue to Redbox.
     * Base email sending method.
     *
     * The email address properties are a nodemailer address object.
     * In practice this is a single string, so only the 'plain', 'formatted name',
     * and 'comma separated list' within a string should be used.
     * See: https://nodemailer.com/message/addresses/
     *
     * @param msgTo Email address(es) of recipients for 'to' field.
     * @param msgBody The message content in the format set by 'msgFormat'.
     * @param msgSubject The email subject.
     * @param msgFrom Email address of the sender.
     * @param msgFormat The body format, either 'html' or 'text'.
     * @param cc Email address(es) of recipients for 'cc' field.
     * @param bcc Email address(es) of recipients for 'bcc' field.
     * @param otherSendOptions Additional sending options.
     * @return A promise that evaluates to the result of sending the email.
     */
    public sendMessage(
      msgTo: string,
      msgBody: string,
      msgSubject: string = sails.config.emailnotification.defaults.subject,
      msgFrom: string = sails.config.emailnotification.defaults.from,
      msgFormat: string = sails.config.emailnotification.defaults.format,
      cc: string = _.get(sails.config.emailnotification.defaults, 'cc', ''),
      bcc: string = _.get(sails.config.emailnotification.defaults, 'bcc', ''),
      otherSendOptions: Record<string, unknown> = _.get(sails.config.emailnotification.defaults, 'otherSendOptions', {}),
    ): Observable<{ success: boolean, msg: string }> {
  return from(this.sendMessageAsync(msgTo, msgBody, msgSubject, msgFrom, msgFormat, cc, bcc, otherSendOptions));
    }

    /**
     * Send an email asynchronously.
     *
     * The email address properties are a nodemailer address object.
     * In practice this is a single string, so only the 'plain', 'formatted name',
     * and 'comma separated list' within a string should be used.
     * See: https://nodemailer.com/message/addresses/
     *
     * @param msgTo Email address(es) of recipients for 'to' field.
     * @param msgBody The message content in the format set by 'msgFormat'.
     * @param msgSubject The email subject.
     * @param msgFrom Email address of the sender.
     * @param msgFormat The body format, either 'html' or 'text'.
     * @param cc Email address(es) of recipients for 'cc' field.
     * @param bcc Email address(es) of recipients for 'bcc' field.
     * @param otherSendOptions Additional sending options.
     * @return The result of sending the email.
     * @private
     */
    private async sendMessageAsync(
      msgTo: string,
      msgBody: string,
      msgSubject: string,
      msgFrom: string,
      msgFormat: string,
      cc: string,
      bcc: string,
      otherSendOptions: Record<string, unknown> = {},
    ): Promise<{ success: boolean, msg: string }> {
      if (!sails.config.emailnotification.settings.enabled) {
        this.updateChronicle({ emailSendOutcome: 'disabled' });
        return {
          'success': true,
          'msg': 'Email services disabled.'
        };
      }
      this.updateChronicle({ emailSendOutcome: 'processing' });

      // This also covers callers supplying already-rendered strings to sendMessage.
      try {
        msgSubject = hardenEmailSubject(msgSubject);
        validateEmailLength(msgBody, 'body');
        if (!['html', 'text'].includes(msgFormat)) throw new EmailTemplateError('INVALID_TEMPLATE', 'Invalid email format.');
        if (msgFormat === 'html') {
          // Never let getDOMPurifyConfig silently fall back to a different profile.
          if (!sails.config.dompurify?.profiles?.email) {
            throw new EmailTemplateError('SANITISATION_FAILED', 'DOMPurify email profile is required.');
          }
          try {
            const result = DomSanitizerService.sanitizeEmail(msgBody);
            msgBody = result.sanitized;
            if (result.removed) this.updateChronicle({ emailSanitisationRemovedMarkup: true });
          } catch {
            // Do not retain sanitizer exceptions: they can embed the email content.
            throw new EmailTemplateError('SANITISATION_FAILED', 'Unable to sanitise email HTML.');
          }
          validateEmailLength(msgBody, 'body');
        }
      } catch (error) {
        this.updateChronicle({ emailSendOutcome: 'validation-failed',
          emailErrorCode: error instanceof EmailTemplateError ? error.code : 'RENDER_FAILED' });
        throw error;
      }

      let transport;
      try {
        transport = nodemailer.createTransport(sails.config.emailnotification.settings.serverOptions);
      } catch {
        this.updateChronicle({ emailSendOutcome: 'transport-failed' }, [new Error('Email transport creation failed.')]);
        return {
          'success': false,
          'msg': 'Failed to establish mail transport connection.'
        };
      }

      const message = _.merge({}, otherSendOptions, {
        "to": msgTo,
        "subject": msgSubject,
        "from": msgFrom,
        "cc": cc,
        "bcc": bcc,
      });

      message[msgFormat] = msgBody;
      const response = {
        success: false,
        msg: "",
      };
      this.updateChronicle({ emailFormat: msgFormat });
      try {
        const sendResult = await transport.sendMail(message);
        response.msg = `Email sent successfully. Message Id: ${sendResult.messageId}`;
        response.success = true;
        this.updateChronicle({ emailSendOutcome: 'sent' }, [], 'info');
      } catch {
        response.msg = 'Email unable to be submitted';
        response.success = false;
        this.updateChronicle({ emailSendOutcome: 'failed' }, [new Error('Email transport submission failed.')]);
      }

      return response;
    }

    /**
     * Build Email Body from a Handlebars Template.
     * Templates are defined in sails config.
     *
     * @param templateName The file name without extension.
     * @param data The variables to use when rendering the template.
     * @param res The response object. Will contain 'status', 'body', might contain 'ex'.
     * @return The response object with 'status', 'body', and maybe 'ex' set.
     */
    public async buildFromTemplateAsync(templateName: string, data: Record<string, unknown> = {}, res: Record<string, unknown> = {}) {
      try {
        const preview = adminPreviewRequests.get(res);
        const capture = this.previewContextRequests.get(res);
        const context = capture ?? this.renderContexts.get(res);
        data = preview ? preview.data : this.createRenderData(data, context);
        if (capture) {
          // This branch runs AFTER hook overrides inject display values, before any compile or send.
          res['context'] = data;
          res['status'] = 200;
          return res;
        }
        const template = preview ? { ...preview.content, source: preview.suppliedDefault ? 'default' as const : 'override' as const, fileName: undefined, revision: undefined } : context?.brandId !== undefined
          ? await EmailTemplateService.resolve(templateName, context.brandId)
          : readEmailTemplateDefault(templateName);
        const selected = {
          ...template,
          subject: context?.subject ?? (template.source === 'default' ? context?.defaultSubject : undefined) ?? template.subject,
          format: context?.format ?? template.format,
        };
        validateEmailTemplate(selected as Parameters<typeof validateEmailTemplate>[0], false);
        // DB compilation is deliberately uncached. Every send queries storage;
        // revision updates and delete/recreate cycles are visible on all workers.
        if (preview) preview.failedField = 'body';
        const body = preview ? compileEmailTemplatePreview(template.body)(data) : template.source === 'override'
          ? handlebarsCompile(template.body, { strict: true })(data)
          : this.getCompiledTemplate(template.fileName ?? templateName)(data);

        validateEmailLength(body, 'body');
        res['status'] = 200;
        res['body'] = body;
        // Direct legacy body-only calls need not supply subject display values.
        if (preview) preview.failedField = 'subject';
        if (context || preview) res['subject'] = hardenEmailSubject(preview ? compileEmailTemplatePreview(selected.subject)(data) : this.runTemplate(selected.subject, data));
        if (preview) preview.failedField = undefined;
        res['format'] = selected.format;
        res['source'] = template.source;
        res['revision'] = template.revision;
        return res;
      } catch (err) {
        const preview = adminPreviewRequests.get(res);
        if (preview?.failedField) {
          const at = (err ?? {}) as { lineNumber?: unknown; column?: unknown };
          const position = emailSyntaxSourcePosition(preview.content[preview.failedField], {
            line: Number.isSafeInteger(at.lineNumber) && Number(at.lineNumber) >= 1 ? Number(at.lineNumber) : 1,
            column: Number.isSafeInteger(at.column) && Number(at.column) >= 0 ? Number(at.column) + 1 : 1,
          });
          preview.failedLine = position.line;
          preview.failedColumn = position.column;
        }
        // Record and propagate one safe typed instance; render errors may quote template text.
        const failure = err instanceof EmailTemplateError ? err
          : safeEmailTemplateError('RENDER_FAILED', `Unable to render email template '${templateName}'.`, err);
        if (preview) preview.failure = { code: failure.code, message: failure.message, diagnostic: failure.diagnostic };
        this.updateChronicle({ emailTemplate: templateName, emailTemplateOutcome: 'failed', emailErrorCode: failure.code },
          [failure]);
        res['status'] = 500;
        res['body'] = 'Templating error.';
        res['ex'] = failure;
        return res;
      }
    }

    /**
     * Build Email Body from Template.
     * Templates are defined in sails config.
     *
     * @param template The file name without extension.
     * @param data The variables to use when rendering the template.
     * @return A promise that evaluates to the response object with 'status', 'body', and maybe 'ex' set.
     */
    public async buildPreviewContext(templateName: string, data: Record<string, unknown>, brandId: string): Promise<Record<string, unknown>> {
      const response: Record<string, unknown> = {};
      this.previewContextRequests.set(response, { brandId });
      // Same virtual method dispatch and pre-curation as buildFromTemplate; SCU's override runs here.
      const result = await this.buildFromTemplateAsync(templateName, this.createRenderData(data, { brandId }), response);
      if (result['status'] !== 200) throw result['ex'] ?? new EmailTemplateError('RENDER_FAILED', 'Unable to prepare preview context.');
      return result['context'] as Record<string, unknown>;
    }

    public buildFromTemplate(template: string, data: Record<string, unknown> = {}, context?: EmailRenderContext): Observable<Record<string, unknown>> {
      // Deferred so render-data errors surface through the Observable, not
      // synchronously. Each subscription renders into its own response object.
      return defer(() => {
        const response: Record<string, unknown> = {};
        // Legacy two-argument callers get body-only rendering (defaults only), as
        // before; supplying a context opts into coherent subject/body/format output.
        if (context !== undefined) this.renderContexts.set(response, { ...context });
        const prepared = this.createRenderData(data, context);
        const preview = adminPreviewBuildRequests.get(data);
        if (preview) {
          preview.data = prepared;
          adminPreviewRequests.set(response, preview);
        }
        // Hooks may mutate their input in place. Keep the submitted preview snapshot independent.
        return this.buildFromTemplateAsync(template, preview ? structuredClone(prepared) : prepared, response)
          .finally(() => adminPreviewRequests.delete(response));
      });
    }

    /**
     * Send Email from Template.
     * Templates are defined in sails config.
     *
     * No return. The email is sent after the built template promise is evaluated.
     *
     * @param to Email address(es) of recipients for 'to' field.
     * @param subject The email subject.
     * @param template The file name without extension.
     * @param data The variables to use when rendering the template.
     */
    public async sendTemplate(to: string, subject: string | undefined, template: string, data: Record<string, unknown>, context: EmailRenderContext = {}) {
      this.updateChronicle({ emailTemplate: template });
      const buildResult = await firstValueFrom(this.buildFromTemplate(template, data, { ...context, subject: subject ?? context.subject }));
      if (buildResult['status'] !== 200) throw buildResult['ex'] ?? new EmailTemplateError('RENDER_FAILED', 'Invalid email body.');
      return firstValueFrom(this.sendMessage(to, buildResult['body'] as string, buildResult['subject'] as string,
        undefined, buildResult['format'] as string));
    }

    /**
     * Render a Handlebars template from a string.
     * @param template The template string.
     * @param variables The variables to use when rendering the template.
     * @return The rendered template string.
     * @protected
     */
    public runTemplate(template: string, variables: Record<string, unknown>) {
      if (template && template.indexOf('{{') !== -1) {
        const compiled = handlebarsCompile(template, { strict: true })
        return compiled(this.createRenderData(variables));
      }
      return template;
    }

    private runAddressTemplate(template: string, variables: Record<string, unknown>) {
      return template?.includes('{{')
        ? handlebarsCompile(template, { strict: true })(this.createRenderData(variables, undefined, false)) : template;
    }

    /**
     * Send an email build from the given record data.
     *
     * @param oid The record identifier.
     * @param record The record data.
     * @param options The email options.
     * @param user The optional user.
     * @param response The optional response to return.
     * @return The response if provided or the record data.
     */
    public async sendRecordNotification(oid: string, record: Record<string, unknown>, options: Record<string, unknown>, user: Record<string, unknown>, response: Record<string, unknown>) {
      this.updateChronicle({ emailRecordOid: oid, emailTemplate: options.template });
      const isSailsEmailConfigDisabled = String(_.get(sails.config, 'services.email.disabled', false)) === 'true';
      if (isSailsEmailConfigDisabled) {
        this.updateChronicle({ emailNotificationOutcome: 'disabled' });
        if (!_.isEmpty(response)) {
          options.returnType = 'response';
          return response;
        }
        return record;
      } else if (this.metTriggerCondition(oid, record, options, user) == "true") {
        const variables = {
          imports: {
            record: record,
            oid: oid,
          },
          record: record,
          oid: oid,
        };
        this.updateChronicle({ emailNotificationOutcome: 'processing' });
        // send record notification
        const optionsEvaluated = this.evaluateProperties(options, {}, variables, {
          brandId: _.get(record, 'metaMetadata.brandId') as string | undefined,
        });

        if (!optionsEvaluated.toRendered) {
          const error = new Error('Invalid email address.');
          this.updateChronicle({ emailNotificationOutcome: 'invalid-recipient' }, [error]);
          throw error;
        }

        const templateRendered = optionsEvaluated.templateRendered ?? from(Promise.resolve({ status: 500, body: 'Templating error.' }));
        const buildResult: Record<string, unknown> = await firstValueFrom(templateRendered);

        if (buildResult['status'] != 200) {
          const error = (buildResult['ex'] as Error | undefined) ?? new EmailTemplateError('RENDER_FAILED', 'Invalid email body.');
          this.updateChronicle({ emailNotificationOutcome: 'invalid-body',
            emailErrorCode: error instanceof EmailTemplateError ? error.code : 'RENDER_FAILED' });
          throw error;
        }
        const sendResult = await firstValueFrom(this.sendMessage(
          optionsEvaluated.toRendered,
          buildResult['body'] as string,
          (buildResult['subject'] as string | undefined) ?? optionsEvaluated.subjectRendered,
          optionsEvaluated.fromRendered,
          (buildResult['format'] as string | undefined) ?? optionsEvaluated.formatRendered,
          optionsEvaluated.ccRendered,
          optionsEvaluated.bccRendered,
          _.get(options, 'otherSendOptions', {}) as Record<string, unknown>,
        ));

        if (sendResult.success) {
          this.updateChronicle({ emailNotificationOutcome: 'sent' });
          const postSendHooks = _.get(options, "onNotifySuccess", null);
          if (Array.isArray(postSendHooks)) {
            this.updateChronicle({ emailNotificationHookOutcome: 'processing' });
            for (const postSendHook of postSendHooks) {
              const postSendHookFnName = _.get(postSendHook, 'function', null);
              if (typeof postSendHookFnName === 'string' && postSendHookFnName.length > 0) {
                this.updateChronicle({ emailNotificationHookOutcome: 'processing' });
                const postSendHookFn = eval(postSendHookFnName);
                const postSendHookOpts = _.get(postSendHook, 'options', null);
                let postSendHookResult = postSendHookFn(oid, record, postSendHookOpts, user, response);

                if (isObservable(postSendHookResult)) {
                  postSendHookResult = firstValueFrom(postSendHookResult);
                } else {
                  postSendHookResult = Promise.resolve(postSendHookResult);
                }

                try {
                  await postSendHookResult;
                  this.updateChronicle({ emailNotificationHookOutcome: 'success' });
                } catch {
                  this.updateChronicle({ emailNotificationHookOutcome: 'failure' }, [new Error('Email notification hook failed.')]);
                }
              }
            }
          }
        }
        if (!_.isEmpty(response)) {
          options.returnType = 'response';
          return response;
        } else {
          return record;
        }
      } else {
        this.updateChronicle({ emailNotificationOutcome: 'condition-not-met' });
      }
      if (!_.isEmpty(response)) {
        options.returnType = 'response';
        return response;
      } else {
        return record;
      }
    }

    /**
     *
     * @param options
     * @param config
     * @param templateData
     */
    public evaluateProperties(options: Record<string, unknown>, config: Record<string, unknown> = {}, templateData: Record<string, unknown> = {}, context: EmailRenderContext = {}): {
      format: string, formatRendered: string,
      from: string, fromRendered: string,
      to: string, toRendered: string,
      cc: string, ccRendered: string,
      bcc: string, bccRendered: string,
      subject: string, subjectRendered: string,
      template: string | null, templateRendered: Observable<Record<string, unknown>> | null,
    } {
      let result = {
        format: "", formatRendered: "",
        from: "", fromRendered: "",
        to: "", toRendered: "",
        cc: "", ccRendered: "",
        bcc: "", bccRendered: "",
        subject: "", subjectRendered: "",
        template: null, templateRendered: null,
      };

      if (_.isNil(options)) {
        this.updateChronicle({ emailOptionsProvided: false });
        return result;
      }

      const mergedConfig = _.merge({
        format: {
          names: ["msgFormat", "format",],
          defaultKey: "format",
          templatesKey: "format",
        },
        from: {
          names: ["msgFrom", "from"],
          defaultKey: "from",
          templateFunc: this.runAddressTemplate,
        },
        to: {
          names: ["msgTo", "to"],
          templateFunc: this.runAddressTemplate,
        },
        cc: {
          names: ["cc"],
          defaultKey: "cc",
          templateFunc: this.runAddressTemplate,
        },
        bcc: {
          names: ["bcc"],
          defaultKey: "bcc",
          templateFunc: this.runAddressTemplate,
        },
        subject: {
          names: ["subject"],
          defaultKey: "subject",
          templatesKey: "subject",
          templateFunc: (value: string, data: Record<string, unknown>) => hardenEmailSubject(this.runTemplate(value, data)),
        },
        template: {
          names: ["template"],
          templateFunc: (name: string, data: Record<string, unknown>) => this.buildFromTemplate(name, data, {
            ...context,
            subject: options.subject as string | undefined,
            format: (options.msgFormat ?? options.format) as string | undefined,
          }),
        }
      }, config) as Record<string, Record<string, unknown>>;

      templateData = this.createRenderData(templateData, context, false);

      // Get the template name first, so it is available for the other properties.
      let templateName = null;
      templateName = this.evaluatePropertyOptions(options, templateName, mergedConfig.template);
      templateName = this.evaluatePropertyDefault(templateName, mergedConfig.template);

      // Evaluate each property.
      for (const prop in mergedConfig) {
        const propConfig = { ...mergedConfig[prop] } as Record<string, unknown>;
        // A default subject may require data absent from an override. Render the
        // selected subject inside the async hook seam, after source resolution.
        if (prop === 'subject' && context.brandId !== undefined) delete propConfig.templateFunc;

        result = _.merge(
          result,
          this.evaluateProperty(options, prop, propConfig, templateData, templateName)
        );
      }

      const fallbackTemplate = from(Promise.resolve({ status: 500, body: 'Templating error.' }));
      const templateRendered = !_.isNil(result.template)
        ? (result.templateRendered as Observable<Record<string, unknown>> | null) ?? fallbackTemplate
        : null;
      return {
        ...result,
        templateRendered,
      };
    }

    /**
     * Evaluate a property.
     *
     * @param options Object containing one of the keys in the property configuration.
     * @param prop The property name.
     * @param propConfig The property configuration.
     * @param templateData The template variables to render.
     * @param templateName The name of the template.
     * @return An object with the un-rendered property value with the property name as the key,
     *         and the rendered value with the property name + 'Rendered' as the key.
     * @private
     */
    private evaluateProperty(options: Record<string, unknown>, prop: string, propConfig: Record<string, unknown>, templateData: Record<string, unknown>, templateName: string | null) {
      const result: Record<string, unknown> = {};
      let propValue = null;

      propValue = this.evaluatePropertyOptions(options, propValue, propConfig);
      propValue = this.evaluatePropertyTemplateConfig(prop, propValue, propConfig, templateName);
      propValue = this.evaluatePropertyDefault(propValue, propConfig);

      result[prop] = propValue;

      const propRendered = this.evaluatePropertyTemplate(propValue, propConfig, templateData);
      result[`${prop}Rendered`] = _.isNil(propRendered) ? propValue : propRendered;

      return result;
    }

    /**
     * Get the property value from the provided options.
     *
     * @param options Object containing one of the keys in the property configuration.
     * @param propValue The value of the property obtained from the provided options or defaults.
     * @param propConfig The property configuration.
     * @return The property value if it is in options, otherwise null.
     * @private
     */
    private evaluatePropertyOptions(options: Record<string, unknown>, propValue: string | null, propConfig: Record<string, unknown>) {
      //
      const propNames = _.get(propConfig, "names", []) as string[];
      if (!_.isNil(propNames)) {
        for (const propName of propNames) {
          propValue = _.get(options, propName, null) as string | null;
          if (!_.isNil(propValue)) {
            break;
          }
        }
      }

      return propValue;
    }

    /**
     * Get a property default value from the emailnotification defaults configuration.
     *
     * @param propValue The value of the property obtained from the provided options or defaults.
     * @param propConfig The property configuration.
     * @return The default value from the defaults configuration, or the property value.
     * @private
     */
    private evaluatePropertyDefault(propValue: string | null, propConfig: Record<string, unknown>) {
      const propDefaultKey = _.get(propConfig, "defaultKey", null) as string | null;
      if (_.isNil(propValue) && !_.isNil(propDefaultKey)) {
        propValue = _.get(sails.config.emailnotification.defaults, propDefaultKey, null) as string | null;
      }
      return propValue;
    }

    /**
     * Get a property default value from the emailnotification templates configuration.
     *
     * @param prop The property name.
     * @param propValue The value of the property obtained from the provided options or defaults.
     * @param propConfig The property configuration.
     * @param templateName The name of the template.
     * @return The default value from the templates configuration, or the property value.
     * @private
     */
    private evaluatePropertyTemplateConfig(prop: string, propValue: string | null, propConfig: Record<string, unknown>, templateName: string | null) {
      const propTemplateConfigKey = _.get(propConfig, "templatesKey", null);
      if (!_.isNil(propValue) || _.isNil(propTemplateConfigKey) || _.isNil(templateName)) {
        return propValue;
      }

      const templatesConfigItem = _.get(sails.config.emailnotification.templates, templateName);
      if (!_.isNil(templatesConfigItem)) {
        propValue = _.get(templatesConfigItem, prop, null);
      }

      return propValue;
    }

    /**
     * Render the property using the template function.
     *
     * @param propValue The value of the property obtained from the provided options or defaults.
     * @param propConfig The property configuration.
     * @param templateData The template variables to render.
     * @return The result of rendering the template function with the data, or the property value if there is no template function.
     * @private
     */
    private evaluatePropertyTemplate(propValue: string | null, propConfig: Record<string, unknown>, templateData: Record<string, unknown>) {
      const templateFunc = _.get(propConfig, 'templateFunc', null) as ((value: string | null, data: Record<string, unknown>) => unknown) | null;
      if (!_.isNil(propValue) && !_.isNil(templateFunc)) {
        // Handlebars reads the template context directly (record/oid are already
        // top-level keys), so no lodash-style 'imports' wrapping is required.
        const func = templateFunc.bind(this);
        return func(propValue, templateData);
      }
      return propValue;
    }
  }
}

declare global {
  let EmailService: Services.Email;
}
