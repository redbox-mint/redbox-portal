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

import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
/**
 * Package that contains all Controllers.
 */
import type { ExportJobRequest } from '@researchdatabox/sails-ng-common';
import { BrandingModel, UserModel } from '../model';
import { Controllers as controllers } from '../CoreController';
import { EXPORT_CONTENT_TYPES } from '../constants/export';
import { ExportRequestContext, ExportServiceError } from '../services/ExportService';
import { getRouteParam } from '../utilities/RequestParamUtils';

export namespace Controllers {
  /**
   * Responsible for all things related to exporting anything
   *
   * Author: <a href='https://github.com/shilob' target='_blank'>Shilo Banihit</a>
   */
  export class Export extends controllers.Core.Controller {
    /**
     * Exported methods, accessible from internet.
     */
    protected override _exportedMethods: string[] = [
      'index',
      'downloadRecs',
      'createJob',
      'listJobs',
      'getJob',
      'deleteJob',
      'downloadJob',
    ];

    /**
     * *************************************************************************************************
     * **************************************** Add custom methods **************************************
     * *************************************************************************************************
     */
    public override index(req: Sails.Req, res: Sails.Res) {
      return this.sendView(req, res, 'export/index');
    }

    public async createJob(req: Sails.Req, res: Sails.Res) {
      try {
        const context = this.getExportContext(req);
        const input = this.getJobRequest(req.body);
        const filename = `${TranslationService.t(`${input.recType}-title`)} - Exported Records.csv`;
        const job = await ExportService.createJob(context, input, filename);
        const location = `${req.originalUrl.split('?')[0].replace(/\/$/, '')}/${encodeURIComponent(job.id)}`;
        return this.sendResp(req, res, {
          status: 202,
          data: job,
          headers: { ...this.getExportHeaders(), Location: location },
        });
      } catch (error: unknown) {
        return this.sendExportError(req, res, error);
      }
    }

    public async listJobs(req: Sails.Req, res: Sails.Res) {
      try {
        const jobs = await ExportService.listJobs(this.getExportContext(req));
        return this.sendResp(req, res, { data: jobs, headers: this.getExportHeaders() });
      } catch (error: unknown) {
        return this.sendExportError(req, res, error);
      }
    }

    public async getJob(req: Sails.Req, res: Sails.Res) {
      try {
        const job = await ExportService.getJob(this.getExportContext(req), getRouteParam(req, 'id'));
        return this.sendResp(req, res, { data: job, headers: this.getExportHeaders() });
      } catch (error: unknown) {
        return this.sendExportError(req, res, error);
      }
    }

    public async deleteJob(req: Sails.Req, res: Sails.Res) {
      try {
        await ExportService.deleteJob(this.getExportContext(req), getRouteParam(req, 'id'));
        return this.sendResp(req, res, { status: 204, headers: this.getExportHeaders() });
      } catch (error: unknown) {
        return this.sendExportError(req, res, error);
      }
    }

    public async downloadJob(req: Sails.Req, res: Sails.Res) {
      let stream: Readable | undefined;
      const closeStream = () => stream?.destroy();
      try {
        const artifact = await ExportService.openDownload(this.getExportContext(req), getRouteParam(req, 'id'));
        stream = artifact.stream;
        res.once('close', closeStream);
        if (res.destroyed) {
          stream.destroy();
          return res;
        }
        // Read failures before the first byte must still return a normal API error response.
        // Once pipeline owns the response, any source failure destroys its HTTP connection.
        const chunks = stream[Symbol.asyncIterator]();
        const firstChunk = await chunks.next();
        const source = Readable.from(
          (async function* () {
            try {
              if (!firstChunk.done) yield firstChunk.value;
              for await (const chunk of chunks) yield chunk;
            } finally {
              await chunks.return?.();
            }
          })()
        );
        res.set(this.getExportHeaders());
        res.attachment(artifact.filename);
        res.set('Content-Type', EXPORT_CONTENT_TYPES.csv);
        res.set('Content-Length', String(artifact.byteLength));
        await pipeline(source, res);
        return res;
      } catch (error: unknown) {
        stream?.destroy();
        // pipeline destroys the response on a stream failure; it cannot accept a JSON error body.
        if (res.headersSent || res.destroyed) {
          this.updateChronicle(req, { exportDownloadFailed: true }, [error]);
          if (!res.destroyed) res.destroy();
          return res;
        }
        res.removeHeader('Content-Disposition');
        res.removeHeader('Content-Length');
        res.removeHeader('Content-Type');
        return this.sendExportError(req, res, error);
      } finally {
        res.off('close', closeStream);
      }
    }

    private getExportContext(req: Sails.Req): ExportRequestContext {
      if (!req.user || typeof req.user.id !== 'string' || typeof req.user.username !== 'string') {
        throw new ExportServiceError(401, 'export-authentication-required', 'Sign in to prepare or download exports.');
      }
      const brand = BrandingService.getBrand(getRouteParam(req, 'branding', req.session.branding ?? ''));
      const portal = getRouteParam(req, 'portal', req.session.portal ?? '');
      if (!brand || !portal) {
        throw new ExportServiceError(404, 'export-not-found', 'Export not found.');
      }
      return { brand, portal, user: Object.assign(new UserModel(), req.user) };
    }

    private getJobRequest(body: unknown): ExportJobRequest {
      if (
        body === null ||
        typeof body !== 'object' ||
        Array.isArray(body) ||
        !('format' in body) ||
        body.format !== 'csv' ||
        !('recType' in body) ||
        typeof body.recType !== 'string' ||
        ('before' in body && body.before !== undefined && typeof body.before !== 'string') ||
        ('after' in body && body.after !== undefined && typeof body.after !== 'string')
      ) {
        throw new ExportServiceError(
          400,
          'export-invalid-request',
          'Select a record type, CSV format, and valid date bounds.'
        );
      }
      return {
        format: 'csv',
        recType: body.recType,
        ...('before' in body && typeof body.before === 'string' ? { before: body.before } : {}),
        ...('after' in body && typeof body.after === 'string' ? { after: body.after } : {}),
      };
    }

    private getExportHeaders(): Record<string, string> {
      return { 'Cache-Control': 'private, no-store', Pragma: 'no-cache', Expires: '0' };
    }

    private sendExportError(req: Sails.Req, res: Sails.Res, error: unknown) {
      const known = error instanceof ExportServiceError;
      this.updateChronicle(req, { exportRequestFailed: true }, [error]);
      return this.sendResp(req, res, {
        status: known ? error.status : 500,
        displayErrors: [
          {
            code: known ? error.code : 'export-request-failed',
            detail: known ? error.message : 'The export request could not be completed. Please try again.',
          },
        ],
        headers: this.getExportHeaders(),
      });
    }

    public async downloadRecs(req: Sails.Req, res: Sails.Res) {
      const brand: BrandingModel = BrandingService.getBrand(req.session.branding as string);
      const format = req.param('format');
      const recType = req.param('recType');
      const before = _.isEmpty(req.query.before) ? null : req.query.before;
      const after = _.isEmpty(req.query.after) ? null : req.query.after;
      const filename = `${TranslationService.t(`${recType}-title`)} - Exported Records.${format}`;
      if (format == 'csv' || format == 'json') {
        res.attachment(filename);
        res.set('Content-Type', EXPORT_CONTENT_TYPES[format]);
        sails.log.verbose('filename ' + filename);
        await pipeline(
          RecordsService.exportAllPlans(
            req.user!.username,
            req.user!.roles as globalThis.Record<string, unknown>[],
            brand,
            format,
            before,
            after,
            recType
          ),
          res
        );
        return res;
      } else {
        return res.status(500).send('Unsupported export format');
      }
    }
    /**
     * *************************************************************************************************
     * **************************************** Override magic methods **********************************
     * *************************************************************************************************
     */
  }
}
