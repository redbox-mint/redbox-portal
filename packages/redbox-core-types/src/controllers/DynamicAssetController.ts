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

//<reference path='./../../typings/loader.d.ts'/>

import { BrandingModel } from '../model/storage/BrandingModel';
import { Controllers as controllers } from '../CoreController';
import { TemplateCompileInput, FormConfigFrame } from "@researchdatabox/sails-ng-common";
import { firstValueFrom } from "rxjs";
import { FormAttributes } from '../waterline-models';


/**
 * Package that contains all Controllers.
 */
export namespace Controllers {
  /**
   * DynamicAssetController - returns all dynamic client-side elements
   *
   * Author: <a href='https://github.com/shilob' target='_blank'>Shilo Banihit</a>
   */
  export class DynamicAsset extends controllers.Core.Controller {
    private asError(err: unknown): Error {
      return err instanceof Error ? err : new Error(String(err));
    }

    /**
     * Exported methods, accessible from internet.
     */
    protected override _exportedMethods: string[] = [
      'get',
      'getFormCompiledItems',
      'getFormStructureValidations',
      'getFormDataValidations',
      'getFormExpressions',
      'getAdminReportTemplates',
      'getRecordDashboardTemplates',
    ];

    private _recordTypeAuto = "auto";

    /**
     **************************************************************************************************
     **************************************** Override default methods ********************************
     **************************************************************************************************
     */

    /**
     **************************************************************************************************
     **************************************** Add custom methods **************************************
     **************************************************************************************************
     */

    public get(req: Sails.Req, res: Sails.Res) {
      let assetId = req.param("asset");
      if (!assetId) assetId = 'apiClientConfig.json'
      sails.log.verbose(`Geting asset: ${assetId}`);
      this.sendAssetView(res, assetId, { layout: false });
    }

    public async getFormCompiledItems(req: Sails.Req, res: Sails.Res) {
      const brand: BrandingModel = BrandingService.getBrand(req.session.branding as string);
      const editMode = req.query.edit == "true";
      const formMode = editMode ? "edit" : "view";
      const recordType = req.param("recordType") || this._recordTypeAuto;
      const oid = req.param("oid") || "";
      const reusableFormDefs = sails.config.reusableFormDefinitions;

      try {
        // TODO: this block is very similar to RecordController.getForm - refactor to service?
        const userRoles = ((req.user?.roles ?? []) as globalThis.Record<string, unknown>[]).map((role) => role?.name as string).filter((name) => !!name);
        let form: FormAttributes | null, recordMetadata;
        if (!oid) {
          recordMetadata = null;
          form = await firstValueFrom<FormAttributes>(FormsService.getFormByStartingWorkflowStep(brand, recordType, editMode));
        } else {
          const record = await RecordsService.getMeta(oid);
          const recordAny = record as unknown as Record<string, unknown>;
          let hasAccess: boolean = false;
          if (editMode) {
            //find form to edit a record
            hasAccess = await RecordsService.hasEditAccess(brand, req.user!, (req.user!.roles ?? []) as globalThis.Record<string, unknown>[], recordAny);
          } else {
            //find form to view a record
            hasAccess = await RecordsService.hasViewAccess(brand, req.user!, (req.user!.roles ?? []) as globalThis.Record<string, unknown>[], recordAny);
          }
          if (!hasAccess) {
            return this.sendResp(req, res, {
              status: 403,
              displayErrors: [{ code: 'view-error-no-permissions' }],
              v1: { message: TranslationService.t('view-error-no-permissions') }
            });
          }
          recordMetadata = record?.metadata ?? {};
          form = await FormsService.getForm(brand, "", editMode, "", record);
        }

        const formConfig = form?.configuration;
        if (!formConfig) {
          return this.sendResp(req, res, {
            status: 500,
            displayErrors: [{ detail: "Form configuration not found." }],
          });
        }
        const entries: TemplateCompileInput[] = await FormRecordConsistencyService.extractRawTemplates(formConfig, formMode, userRoles, recordMetadata, reusableFormDefs) || [];
        return this.sendClientMappingJavascript(res, entries);
      } catch (error) {
        return this.sendResp(req, res, {
          status: 500,
          errors: [this.asError(error)],
          displayErrors: [{ detail: "Could not get form data." }],
        });
      }
    }

    /**
    * Provide the client script that can validate the form data model matches the form config.
    * @param req
    * @param res
    */
    public getFormStructureValidations(req: Sails.Req, res: Sails.Res) {
      // TODO:
      //  Similar to FormRecordConsistency.validateRecordSchema.
      const entries: TemplateCompileInput[] = [];
      return this.sendClientMappingJavascript(res, entries);
    }

    /**
    * Provide the client script that can validate the form data model values match the form config types.
    * Similar to FormRecordConsistency.validateRecordValues.
    * @param req
    * @param res
    */
    public getFormDataValidations(req: Sails.Req, res: Sails.Res) {
      // TODO:
      const entries: TemplateCompileInput[] = [];
      return this.sendClientMappingJavascript(res, entries);
    }

    /**
    * Provide the client script that can run the form expressions as jsonata expressions.
    * @param req
    * @param res
    */
    public getFormExpressions(req: Sails.Req, res: Sails.Res) {
      // TODO:
      const entries: TemplateCompileInput[] = [];
      return this.sendClientMappingJavascript(res, entries);
    }

    /**
    * Provide the client script that can run the report expressions as jsonata expressions.
    * @param req
    * @param res
    */
    public async getAdminReportTemplates(req: Sails.Req, res: Sails.Res) {
      const brand: BrandingModel = BrandingService.getBrand(req.session.branding as string);
      const reportName = req.param("reportName") || "";

      try {
        const entries = await ReportsService.extractReportTemplates(brand, reportName);
        return this.sendClientMappingJavascript(res, entries);
      } catch (error) {
        sails.log.error("Could not build report templates:", error);
        return res.serverError();
      }
    }

    /**
    * Provide the client script that can run the dashboard expressions as jsonata expressions.
    * @param req
    * @param res
    */
    public async getRecordDashboardTemplates(req: Sails.Req, res: Sails.Res) {
      const brand: BrandingModel = BrandingService.getBrand(req.session.branding as string);
      const recordType = req.param("recordType") || "";
      const workflowStage = req.param("workflowStage") || "";
      const dashboardType = req.param("dashboardType") || "standard";

      if (!recordType || !workflowStage) {
        sails.log.warn(`getRecordDashboardTemplates called without recordType or workflowStage`);
        return this.sendClientMappingJavascript(res, []);
      }

      try {
        const entries = await DashboardTypesService.extractDashboardTemplates(brand, recordType, workflowStage, dashboardType);
        return this.sendClientMappingJavascript(res, entries);
      } catch (error) {
        sails.log.error("Could not build dashboard templates:", error);
        return res.serverError();
      }
    }

    private isNewRecord(recordType: string, oid: string): boolean {
      return !!(!oid && recordType && recordType !== this._recordTypeAuto);
    }

    private isExistingRecord(recordType: string, oid: string): boolean {
      return !!oid && (recordType === this._recordTypeAuto || !!recordType);
    }

    private sendClientMappingJavascript(res: Sails.Res, inputs: TemplateCompileInput[]) {
      inputs = inputs || [];
      const entries = TemplateService.buildClientMapping(inputs);
      const entryKeys = inputs.map(i => TemplateService.buildKeyString(i.key)).sort();
      const assetId = "dynamicScriptAsset";
      sails.log.verbose(`Responding with asset '${assetId}' with ${inputs.length} keys: ${entryKeys.join(', ')}`);
      return this.sendAssetView(res, assetId, {
        entries: entries.map(i => {
          return { key: TemplateService.buildKeyString(i.key), value: i.value }
        }),
        layout: false
      });
    }

    private sendAssetView(res: Sails.Res, assetId: string, viewContext: Record<string, unknown>) {
      const dynamicAssetInfo = sails.config.dynamicasset[assetId];
      if (!dynamicAssetInfo || !dynamicAssetInfo.type || !dynamicAssetInfo.view) {
        return res.notFound();
      }
      res.set('Content-Type', dynamicAssetInfo.type);
      return res.view(dynamicAssetInfo.view, viewContext);
    }

    /**
   **************************************************************************************************
   **************************************** Override magic methods **********************************
   **************************************************************************************************
   */
  }
}
