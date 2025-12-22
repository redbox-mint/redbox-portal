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

import { Observable, from } from 'rxjs';
import { map, switchMap } from 'rxjs/operators';
import { Services as services, SupportAgreementModel, ReleaseNoteItem, TimesheetSummaryItem, calculateUsedSupportDays, validateUsedSupportDays, sanitizeUrl, sanitizeReleaseNotes } from '@researchdatabox/redbox-core-types';
import { Sails, Model } from 'sails';

declare var sails: Sails;
declare var SupportAgreement: Model;
declare var _;

export module Services {
  /**
   * Support Agreement Service
   *
   * Provides CRUD operations for SupportAgreement records and computes derived fields.
   */
  export class SupportAgreementService extends services.Core.Service {

    protected _exportedMethods: any = [
      'getByBrandAndYear',
      'getByBrand',
      'getAvailableYears',
      'create',
      'update',
      'remove',
      'withDerivedTotals',
      'computeUsedDays',
      'validateAgreement'
    ];

    /**
     * Fetches a single support agreement by brand ID and year.
     * @param brandId The brand ID (foreign key to BrandingConfig).
     * @param year The agreement year.
     * @returns Observable resolving to the agreement record with derived totals, or null if not found.
     */
    public getByBrandAndYear(brandId: string, year: number): Observable<SupportAgreementModel | null> {
      return from(
        SupportAgreement.findOne({ branding: brandId, year: year })
      ).pipe(
        map((record: any) => record ? this.withDerivedTotals(record) : null)
      );
    }

    /**
     * Fetches all support agreements for a given brand.
     * @param brandId The brand ID.
     * @returns Observable resolving to an array of agreement records with derived totals.
     */
    public getByBrand(brandId: string): Observable<SupportAgreementModel[]> {
      return from(
        SupportAgreement.find({ branding: brandId }).sort('year DESC')
      ).pipe(
        map((records: any[]) => records.map((r: any) => this.withDerivedTotals(r)))
      );
    }

    /**
     * Returns an array of distinct years for which agreements exist for a given brand.
     * @param brandId The brand ID.
     * @returns Observable resolving to a sorted array of years (descending).
     */
    public getAvailableYears(brandId: string): Observable<number[]> {
      return from(
        SupportAgreement.find({ branding: brandId }).sort('year DESC')
      ).pipe(
        map((records: any[]) => records.map((r: any) => r.year))
      );
    }

    /**
     * Creates a new support agreement record.
     * @param brandId The brand ID.
     * @param year The agreement year.
     * @param data Object containing agreedSupportDays, releaseNotes, timesheetSummary.
     * @returns Observable resolving to the created record with derived totals.
     */
    public create(
      brandId: string,
      year: number,
      data: {
        agreedSupportDays: number;
        releaseNotes?: ReleaseNoteItem[];
        timesheetSummary?: TimesheetSummaryItem[];
        usedSupportDays?: number;
      }
    ): Observable<SupportAgreementModel> {
      const validationError = this.validateAgreement(year, data.agreedSupportDays, data.timesheetSummary, data.usedSupportDays);
      if (validationError) {
        return new Observable(subscriber => {
          subscriber.error(new Error(validationError));
        });
      }

      return from(
        SupportAgreement.findOne({ branding: brandId, year: year })
      ).pipe(
        map((existing: any) => {
          if (existing) {
            throw new Error(`Support agreement already exists for brand ${brandId} and year ${year}`);
          }
          return existing;
        }),
        switchMap(() => {
          const record = {
            branding: brandId,
            year: year,
            agreedSupportDays: data.agreedSupportDays,
            releaseNotes: sanitizeReleaseNotes(data.releaseNotes),
            timesheetSummary: data.timesheetSummary || []
          };

          return from(SupportAgreement.create(record).fetch()).pipe(
            map((created: any) => this.withDerivedTotals(created))
          );
        })
      );
    }

    /**
     * Updates an existing support agreement record.
     * @param brandId The brand ID.
     * @param year The agreement year.
     * @param data Object containing fields to update.
     * @returns Observable resolving to the updated record with derived totals.
     */
    public update(
      brandId: string,
      year: number,
      data: {
        agreedSupportDays?: number;
        releaseNotes?: ReleaseNoteItem[];
        timesheetSummary?: TimesheetSummaryItem[];
        usedSupportDays?: number;
      }
    ): Observable<SupportAgreementModel> {
      const validationError = this.validateAgreement(year, data.agreedSupportDays, data.timesheetSummary, data.usedSupportDays);
      if (validationError) {
        return new Observable(subscriber => {
          subscriber.error(new Error(validationError));
        });
      }

      const updateData: any = {};
      if (data.agreedSupportDays !== undefined) {
        updateData.agreedSupportDays = data.agreedSupportDays;
      }
      if (data.releaseNotes !== undefined) {
        updateData.releaseNotes = sanitizeReleaseNotes(data.releaseNotes);
      }
      if (data.timesheetSummary !== undefined) {
        updateData.timesheetSummary = data.timesheetSummary;
      }

      return from(
        SupportAgreement.updateOne({ branding: brandId, year: year }).set(updateData)
      ).pipe(
        map((updated: any) => {
          if (!updated) {
            throw new Error(`Support agreement not found for brand ${brandId} and year ${year}`);
          }
          return this.withDerivedTotals(updated);
        })
      );
    }

    /**
     * Removes a support agreement record.
     * @param brandId The brand ID.
     * @param year The agreement year.
     * @returns Observable resolving to the deleted record, or undefined if not found.
     */
    public remove(brandId: string, year: number): Observable<SupportAgreementModel | undefined> {
      return from(
        SupportAgreement.destroyOne({ branding: brandId, year: year })
      ).pipe(
        map((deleted: any) => deleted ? this.withDerivedTotals(deleted) : undefined)
      );
    }

    /**
     * Adds the derived usedSupportDays field to a record based on timesheetSummary totals.
     * @param record The raw support agreement record.
     * @returns The record with usedSupportDays computed.
     */
    public withDerivedTotals(record: any): SupportAgreementModel {
      const usedDays = calculateUsedSupportDays(record.timesheetSummary);
      return {
        id: record.id,
        branding: record.branding,
        year: record.year,
        agreedSupportDays: record.agreedSupportDays,
        releaseNotes: record.releaseNotes || [],
        timesheetSummary: record.timesheetSummary || [],
        usedSupportDays: usedDays,
        createdAt: record.createdAt,
        updatedAt: record.updatedAt
      };
    }

    /**
     * Computes the total used days from a timesheet summary.
     * @param timesheetSummary Array of timesheet summary items.
     * @returns The total number of days.
     */
    public computeUsedDays(timesheetSummary: TimesheetSummaryItem[]): number {
      return calculateUsedSupportDays(timesheetSummary);
    }

    /**
     * Validates agreement data.
     * @param year The year (must be a positive integer).
     * @param agreedSupportDays The agreed days (must be non-negative if provided).
     * @param timesheetSummary Optional timesheet summary (each days value must be non-negative).
     * @param usedSupportDays Optional computed total (must match sum of timesheetSummary if provided).
     * @returns An error message string if invalid, or null if valid.
     */
    public validateAgreement(
      year: number,
      agreedSupportDays?: number,
      timesheetSummary?: TimesheetSummaryItem[],
      usedSupportDays?: number
    ): string | null {
      if (!Number.isInteger(year) || year < 1900 || year > 2200) {
        return 'Year must be a valid integer between 1900 and 2200.';
      }
      if (agreedSupportDays !== undefined && (typeof agreedSupportDays !== 'number' || agreedSupportDays < 0)) {
        return 'agreedSupportDays must be a non-negative number.';
      }
      if (timesheetSummary) {
        for (const item of timesheetSummary) {
          if (typeof item.days !== 'number' || item.days < 0) {
            return 'Each timesheetSummary item must have a non-negative days value.';
          }
        }
      }
      if (usedSupportDays !== undefined && usedSupportDays !== null) {
        if (!validateUsedSupportDays({ timesheetSummary, usedSupportDays } as any)) {
          return 'usedSupportDays must match the sum of days in timesheetSummary.';
        }
      }
      return null;
    }
  }
}

module.exports = new Services.SupportAgreementService().exports();
