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

import { BrandingModel, Controllers as controllers } from '@researchdatabox/redbox-core-types';
import { TemplateCompileInput } from "@researchdatabox/sails-ng-common";
import { firstValueFrom } from "rxjs";

declare var module;
declare var sails;
declare var TemplateService;
declare var FormsService;
declare var BrandingService;
declare var FormRecordConsistencyService;
declare var DashboardTypesService;

/**
 * Package that contains all Controllers.
 */
export module Controllers {
  /**
   * DynamicAssetController - returns all dynamic client-side elements
   *
   * Author: <a href='https://github.com/shilob' target='_blank'>Shilo Banihit</a>
   */
  export class DynamicAsset extends controllers.Core.Controller {

    /**
     * Exported methods, accessible from internet.
     */
    protected _exportedMethods: any = [
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

    public get(req, res) {
      let assetId = req.param("asset");
      if (!assetId) assetId = 'apiClientConfig.json'
      sails.log.verbose(`Geting asset: ${assetId}`);
      this.sendAssetView(res, assetId, { layout: false });
    }

    public async getFormCompiledItems(req, res) {
      const brand: BrandingModel = BrandingService.getBrand(req.session.branding);
      const editMode = req.query.edit == "true";
      const recordType = req.param("recordType") || this._recordTypeAuto;

      try {
        const form = await firstValueFrom<any>(FormsService.getFormByStartingWorkflowStep(brand, recordType, editMode));
        const formMode = editMode ? "edit" : "view";
        const reusableFormDefs = sails.config.reusableFormDefinitions;
        const entries = FormRecordConsistencyService.extractRawTemplates(form, formMode, reusableFormDefs);
        return this.sendClientMappingJavascript(res, entries);
      } catch (error) {
        sails.log.error("Could not build compiled items from form config:", error);
        return res.serverError();
      }
    }

    /**
    * Provide the client script that can validate the form data model matches the form config.
    * @param req
    * @param res
    */
    public getFormStructureValidations(req, res) {
      const recordType = req.param("recordType") || this._recordTypeAuto;
      const oid = req.param("oid") || "";
      const isNewRecord = this.isNewRecord(recordType, oid);
      const isExistingRecord = this.isExistingRecord(recordType, oid);
      // TODO:
      //  Similar to FormRecordConsistency.validateRecordSchema.
      const entries = [];
      return this.sendClientMappingJavascript(res, entries);
    }

    /**
    * Provide the client script that can validate the form data model values match the form config types.
    * Similar to FormRecordConsistency.validateRecordValues.
    * @param req
    * @param res
    */
    public getFormDataValidations(req, res) {
      const recordType = req.param("recordType") || this._recordTypeAuto;
      const oid = req.param("oid") || "";
      const isNewRecord = this.isNewRecord(recordType, oid);
      const isExistingRecord = this.isExistingRecord(recordType, oid);
      // TODO:
      const entries = [];
      return this.sendClientMappingJavascript(res, entries);
    }

    /**
    * Provide the client script that can run the form expressions as jsonata expressions.
    * @param req
    * @param res
    */
    public getFormExpressions(req, res) {
      const recordType = req.param("recordType") || this._recordTypeAuto;
      const oid = req.param("oid") || "";
      const isNewRecord = this.isNewRecord(recordType, oid);
      const isExistingRecord = this.isExistingRecord(recordType, oid);
      // TODO:
      const entries = [];
      return this.sendClientMappingJavascript(res, entries);
    }

    /**
    * Provide the client script that can run the report expressions as jsonata expressions.
    * @param req
    * @param res
    */
    public getAdminReportTemplates(req, res) {
      const reportName = req.param("reportName") || "";
      // TODO:
      const entries = [];
      return this.sendClientMappingJavascript(res, entries);
    }

    /**
    * Provide the client script that can run the dashboard expressions as jsonata expressions.
    * @param req
    * @param res
    */
    public async getRecordDashboardTemplates(req, res) {
      const brand: BrandingModel = BrandingService.getBrand(req.session.branding);
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
      return !oid && recordType && recordType !== this._recordTypeAuto;
    }

    private isExistingRecord(recordType: string, oid: string): boolean {
      return !!oid && (recordType === this._recordTypeAuto || !!recordType);
    }

    private sendClientMappingJavascript(res, inputs: TemplateCompileInput[]) {
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

    private sendAssetView(res, assetId: string, viewContext: Record<string, unknown>) {
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

module.exports = new Controllers.DynamicAsset().exports();
