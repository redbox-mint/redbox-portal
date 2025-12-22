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

declare var module;
declare var sails;
declare var BrandingService;
declare var SupportAgreementService;
declare var _;

import { APIActionResponse, APIErrorResponse, BrandingModel } from '@researchdatabox/redbox-core-types';
import { Controllers as controllers } from '@researchdatabox/redbox-core-types';
import { firstValueFrom } from 'rxjs';

export module Controllers {
  /**
   * Support Agreement REST API Controller
   *
   * Provides admin-only REST endpoints for managing support agreements.
   */
  export class SupportAgreementController extends controllers.Core.Controller {

    protected _exportedMethods: any = [
      'list',
      'get',
      'create',
      'update',
      'remove'
    ];

    /**
     * GET /:branding/:portal/api/support-agreements
     * Lists support agreements for the current brand.
     * Query params:
     *   - yearsOnly=true: returns only { years: number[] }
     */
    public async list(req, res) {
      try {
        const brandName: string = BrandingService.getBrandFromReq(req);
        const brand: BrandingModel = BrandingService.getBrand(brandName);

        if (!brand || !brand.id) {
          return this.apiFail(req, res, 404, new APIErrorResponse('Brand not found'));
        }

        const yearsOnly = req.query.yearsOnly === 'true';

        if (yearsOnly) {
          const years = await firstValueFrom(SupportAgreementService.getAvailableYears(brand.id));
          return this.apiRespond(req, res, { years: years || [] }, 200);
        }

        const agreements = await firstValueFrom(SupportAgreementService.getByBrand(brand.id));
        return this.apiRespond(req, res, agreements || [], 200);
      } catch (error) {
        sails.log.error('SupportAgreementController.list error:', error);
        return this.apiFail(req, res, 500, new APIErrorResponse(error.message));
      }
    }

    /**
     * GET /:branding/:portal/api/support-agreements/:year
     * Retrieves a single support agreement by year.
     */
    public async get(req, res) {
      try {
        const brandName: string = BrandingService.getBrandFromReq(req);
        const brand: BrandingModel = BrandingService.getBrand(brandName);

        if (!brand || !brand.id) {
          return this.apiFail(req, res, 404, new APIErrorResponse('Brand not found'));
        }

        const year = parseInt(req.param('year'), 10);
        if (isNaN(year)) {
          return this.apiFail(req, res, 400, new APIErrorResponse('Invalid year parameter'));
        }

        const agreement = await firstValueFrom(SupportAgreementService.getByBrandAndYear(brand.id, year));

        if (!agreement) {
          return this.apiFail(req, res, 404, new APIErrorResponse(`Support agreement not found for year ${year}`));
        }

        return this.apiRespond(req, res, agreement, 200);
      } catch (error) {
        sails.log.error('SupportAgreementController.get error:', error);
        return this.apiFail(req, res, 500, new APIErrorResponse(error.message));
      }
    }

    /**
     * POST /:branding/:portal/api/support-agreements/:year
     * Creates a new support agreement for the given year.
     * Body: { agreedSupportDays: number, releaseNotes?: array, timesheetSummary?: array }
     */
    public async create(req, res) {
      try {
        const brandName: string = BrandingService.getBrandFromReq(req);
        const brand: BrandingModel = BrandingService.getBrand(brandName);

        if (!brand || !brand.id) {
          return this.apiFail(req, res, 404, new APIErrorResponse('Brand not found'));
        }

        const year = parseInt(req.param('year'), 10);
        if (isNaN(year)) {
          return this.apiFail(req, res, 400, new APIErrorResponse('Invalid year parameter'));
        }

        const body = req.body || {};
        const agreedSupportDays = body.agreedSupportDays;

        if (agreedSupportDays === undefined || typeof agreedSupportDays !== 'number') {
          return this.apiFail(req, res, 400, new APIErrorResponse('agreedSupportDays is required and must be a number'));
        }

        // Check if agreement already exists
        const existing = await firstValueFrom(SupportAgreementService.getByBrandAndYear(brand.id, year));
        if (existing) {
          return this.apiFail(req, res, 409, new APIErrorResponse(`Support agreement already exists for year ${year}. Use PUT to update.`));
        }

        const agreement = await firstValueFrom(SupportAgreementService.create(brand.id, year, {
          agreedSupportDays: agreedSupportDays,
          releaseNotes: body.releaseNotes,
          timesheetSummary: body.timesheetSummary
        }));

        const response = new APIActionResponse('Support agreement created successfully');
        (response as any).data = agreement;

        return this.apiRespond(req, res, response, 201);
      } catch (error) {
        sails.log.error('SupportAgreementController.create error:', error);
        return this.apiFail(req, res, 500, new APIErrorResponse(error.message));
      }
    }

    /**
     * PUT /:branding/:portal/api/support-agreements/:year
     * Updates an existing support agreement for the given year.
     * Body: { agreedSupportDays?: number, releaseNotes?: array, timesheetSummary?: array }
     */
    public async update(req, res) {
      try {
        const brandName: string = BrandingService.getBrandFromReq(req);
        const brand: BrandingModel = BrandingService.getBrand(brandName);

        if (!brand || !brand.id) {
          return this.apiFail(req, res, 404, new APIErrorResponse('Brand not found'));
        }

        const year = parseInt(req.param('year'), 10);
        if (isNaN(year)) {
          return this.apiFail(req, res, 400, new APIErrorResponse('Invalid year parameter'));
        }

        // Check if agreement exists
        const existing = await firstValueFrom(SupportAgreementService.getByBrandAndYear(brand.id, year));
        if (!existing) {
          return this.apiFail(req, res, 404, new APIErrorResponse(`Support agreement not found for year ${year}`));
        }

        const body = req.body || {};
        const updateData: any = {};

        if (body.agreedSupportDays !== undefined) {
          updateData.agreedSupportDays = body.agreedSupportDays;
        }
        if (body.releaseNotes !== undefined) {
          updateData.releaseNotes = body.releaseNotes;
        }
        if (body.timesheetSummary !== undefined) {
          updateData.timesheetSummary = body.timesheetSummary;
        }

        const agreement = await firstValueFrom(SupportAgreementService.update(brand.id, year, updateData));

        const response = new APIActionResponse('Support agreement updated successfully');
        (response as any).data = agreement;

        return this.apiRespond(req, res, response, 200);
      } catch (error) {
        sails.log.error('SupportAgreementController.update error:', error);
        return this.apiFail(req, res, 500, new APIErrorResponse(error.message));
      }
    }

    /**
     * DELETE /:branding/:portal/api/support-agreements/:year
     * Removes a support agreement for the given year.
     */
    public async remove(req, res) {
      try {
        const brandName: string = BrandingService.getBrandFromReq(req);
        const brand: BrandingModel = BrandingService.getBrand(brandName);

        if (!brand || !brand.id) {
          return this.apiFail(req, res, 404, new APIErrorResponse('Brand not found'));
        }

        const year = parseInt(req.param('year'), 10);
        if (isNaN(year)) {
          return this.apiFail(req, res, 400, new APIErrorResponse('Invalid year parameter'));
        }

        const deleted = await firstValueFrom(SupportAgreementService.remove(brand.id, year));

        if (!deleted) {
          return this.apiFail(req, res, 404, new APIErrorResponse(`Support agreement not found for year ${year}`));
        }

        const response = new APIActionResponse('Support agreement deleted successfully');
        return this.apiRespond(req, res, response, 200);
      } catch (error) {
        sails.log.error('SupportAgreementController.remove error:', error);
        return this.apiFail(req, res, 500, new APIErrorResponse(error.message));
      }
    }
  }
}

module.exports = new Controllers.SupportAgreementController().exports();
