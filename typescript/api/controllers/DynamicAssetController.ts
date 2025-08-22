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

import {ApiVersion, Controllers as controllers} from '@researchdatabox/redbox-core-types';

//<reference path='./../../typings/loader.d.ts'/>
declare var module;
declare var sails;

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
      res.set('Content-Type',sails.config.dynamicasset[assetId].type);
      return res.view(sails.config.dynamicasset[assetId].view, {layout:false});
    }

      /**
       * Generate the dynamic form config item for the given
       * recordtype (:name), record (:oid), and dynamic form item (:item).
       * @param req Sails request.
       * @param res Sails response.
       */
      public async getItem(req, res) {
          const recordTypeAuto = "auto";
          const itemsKnown = ["form-config-expressions", "form-config-templates", "data-model-validations"] as const;
          type ItemsKnown = typeof itemsKnown[number];

          const recordType = req.param("name") || recordTypeAuto;
          const oid = req.param("oid") || "";
          const item: ItemsKnown = req.param("item") || "";
          const apiVersion = this.getApiVersion(req);

          const validItem = itemsKnown.includes(item);
          const isNewRecord = !oid && recordType && recordType !== recordTypeAuto;
          const isExistingRecord = oid && (recordType === recordTypeAuto || recordType);

          const msgError = "Invalid dynamic form config request, provide a valid item and either an existing oid or a recordtype.";
          if (validItem && (isNewRecord || isExistingRecord)) {
              sails.log.verbose(`Generating dynamic form config item for recordtype '${recordType}' record oid '${oid}' item '${item}'.`);
          } else {
              sails.log.warn(`Invalid dynamic form config request for recordtype '${recordType}' record oid '${oid}' item '${item}'.`);
              if (apiVersion === ApiVersion.VERSION_2_0) {
                  return this.ajaxFail(req, res, null, this.buildResponseError([{detail: msgError}], null));
              } else {
                  return this.ajaxFail(req, res, null, {message: msgError});
              }
          }

          switch (item) {
              case "form-config-expressions":
                  // TODO: return compiled expressions for the form config matching the record type or record oid.
                  break;
              case "form-config-templates":
                  // TODO: return compiled templates for the form config matching the record type or record oid.
                  break;
              case "data-model-validations":
                  // TODO: return compiled validations for the data model matching the record's form config.
                  break;
              default:
                  if (apiVersion === ApiVersion.VERSION_2_0) {
                      return this.ajaxFail(req, res, null, this.buildResponseError([{detail: msgError}], null));
                  } else {
                      return this.ajaxFail(req, res, null, {message: msgError});
                  }
          }
      }
    /**
     **************************************************************************************************
     **************************************** Override magic methods **********************************
     **************************************************************************************************
     */
  }
}

module.exports = new Controllers.DynamicAsset().exports();
