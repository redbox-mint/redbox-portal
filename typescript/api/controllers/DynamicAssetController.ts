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

import {Controllers as controllers} from '@researchdatabox/redbox-core-types';
import {TemplateCompileInput, templateCompileKind} from "../additional/TemplateCompile";


//<reference path='./../../typings/loader.d.ts'/>
declare var module;
declare var sails;
declare var TemplateService;

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
        'getItem',
    ];

    private readonly _recordTypeAuto = "auto";

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
      this.sendAssetView(res, assetId, {layout: false});
    }

    public getFormStructureValidations(req, res) {
      const recordType = req.param("recordType") || this._recordTypeAuto;
      const oid = req.param("oid") || "";
      const apiVersion = this.getApiVersion(req);
      const isNewRecord = this.isNewRecord(recordType, oid);
      const isExistingRecord = this.isExistingRecord(recordType, oid);
      // TODO
      const entries = [];
      return this.sendClientMappingJavascript(res, entries);
    }

    public getFormDataValidations(req, res) {
      const recordType = req.param("recordType") || this._recordTypeAuto;
      const oid = req.param("oid") || "";
      const apiVersion = this.getApiVersion(req);
      const isNewRecord = this.isNewRecord(recordType, oid);
      const isExistingRecord = this.isExistingRecord(recordType, oid);
      // TODO
      const entries = [];
      return this.sendClientMappingJavascript(res, entries);
    }

    public getFormExpressions(req, res) {
      const recordType = req.param("recordType") || this._recordTypeAuto;
      const oid = req.param("oid") || "";
      const apiVersion = this.getApiVersion(req);
      const isNewRecord = this.isNewRecord(recordType, oid);
      const isExistingRecord = this.isExistingRecord(recordType, oid);
      // TODO
      const entries = [];
      return this.sendClientMappingJavascript(res, entries);
    }

    public getFormValidationDefinitions(req, res) {
      // const recordType = req.param("recordType") || this._recordTypeAuto;
      // const oid = req.param("oid") || "";
      // const apiVersion = this.getApiVersion(req);
      // const isNewRecord = this.isNewRecord(recordType, oid);
      // const isExistingRecord = this.isExistingRecord(recordType, oid);

      const defs = sails.config.validators.definitions;
      const result = JSON.stringify(defs, function (key, value) {
          if (typeof value === 'function') {
              return value.toString()
          }
          return value
      }, 0);
      return result?.toString();
      const entries = [
          {key: "form-validator-definitions", kind: templateCompileKind["formValidatorDefinitions"], value: result},
      ];
      return this.sendClientMappingJavascript(res, entries);
    }

    public getAdminReportTemplates(req, res) {
      const reportName = req.param("reportName") || "";
      const apiVersion = this.getApiVersion(req);
      // TODO
      const entries = [];
      return this.sendClientMappingJavascript(res, entries);
    }

    public getRecordDashboardTemplates(req, res) {
      const recordType = req.param("name") || "";
      const workflowStage = req.param("workflowStage") || "";
      const apiVersion = this.getApiVersion(req);
      // TODO
      const entries = [];
      return this.sendClientMappingJavascript(res, entries);
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
      const entryKeys = inputs.map(i => i.key).sort();
      const assetId = "dynamicScriptAsset";
      sails.log.verbose(`Responding with asset '${assetId}' with ${inputs.length} keys: ${entryKeys.join(', ')}`);
      return this.sendAssetView(res, assetId, {entries: entries, layout: false})
    }

    private sendAssetView(res, assetId: string, viewContext: Record<string, unknown>) {
      res.set('Content-Type', sails.config.dynamicasset[assetId].type);
      return res.view(sails.config.dynamicasset[assetId].view, viewContext);
    }

      /**
     **************************************************************************************************
     **************************************** Override magic methods **********************************
     **************************************************************************************************
     */
  }
}

module.exports = new Controllers.DynamicAsset().exports();
