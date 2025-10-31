import type {Request, Response} from 'sails';
import {
  Controllers as controllers,
  APICommonResponseType,
  ApiVersion,
  DataResponseV2, ErrorResponseV2
} from "@researchdatabox/redbox-core-types";

declare var _, sails, TranslationService;

export module Controllers {
  export abstract class AbstractBase extends controllers.Core.Controller {

    protected sendResp(req: Request, res: Response, common?: APICommonResponseType): DataResponseV2 | ErrorResponseV2 {
      const apiVersion = this.getApiVersion(req);
      const isJsonAjax = this.isAjax(req);

      let {format = "json", data = {}, errors = [], structuredErrors = [], meta = {}} = common ?? {};

      // TODO: reconcile errors and structuredErrors
      // TODO: deal with different formats
      // TODO: expand RBValidationError
      // TODO: log errors

      // if the response is a status 200, data only, json format response
      if (format === 'json' && errors.length === 0 && structuredErrors.length === 0) {
        switch (apiVersion) {
          case ApiVersion.VERSION_2_0:
            sails.log.verbose(`Send response status 200 api version 2 format json.`);
            return res.status(200).json({
              data: data,
              meta: {...Object.entries(meta ?? {})},
            });

          case ApiVersion.VERSION_1_0:
          default:
            sails.log.verbose(`Send response status 200 api version 2 format json.`);
            return res.status(200).json(data);
        }
      }

      // return this.sendResp(req, res, {
      //           errors: [err],
      //           structuredErrors: [{status: "500", title: 'Failed to get record permission, check server logs.'}]
      //         });
// return this.apiFailWrapper(req, res, 500, null, err,
//             'Failed to get record permission, check server logs.');


      // if (hasViewAccess) {
      //           if (apiVersion === ApiVersion.VERSION_2_0) {
      //             return res.json(this.buildResponseSuccess(record.metadata, {oid: record.redboxOid}));
      //           } else {
      //             return res.json(record.metadata);
      //           }
      //         } else {
      //           if (apiVersion === ApiVersion.VERSION_2_0) {
      //             return res.status(403).json(this.buildResponseError([{title: TranslationService.t("error-403-heading")}], {oid: record.redboxOid}));
      //           } else {
      //             return res.json({status: "Access Denied"});
      //           }
      //         }
    }

    /*

    private apiFailWrapper(
        req, res,
        statusCode = 500,
        errorResponse: APIErrorResponse = new APIErrorResponse(),
        error: Error = null,
        defaultMessage: string = null) {
      // TODO: incorporate some of this into the controller core apiFail function
      if (!errorResponse) {
        errorResponse = new APIErrorResponse();
        // start with an empty message
        errorResponse.message = "";
      }

      // if there is an error and/or defaultMessage, log it
      if (defaultMessage && error) {
        sails.log.error(errorResponse, defaultMessage, error);
      } else if (defaultMessage && !error) {
        sails.log.error(errorResponse, defaultMessage);
      } else if (!defaultMessage && error) {
        sails.log.error(errorResponse, error);
      }

      // TODO: use RBValidationError.clName;
      const rBValidationErrorName = 'RBValidationError';

      // if available, get the 'friendly' validation error message
      const validationMessage = (error?.name === rBValidationErrorName ? error?.message : "") || "";

      // update the api response message
      let message = (errorResponse.message || "").trim();
      if (validationMessage && message) {
        message = message.endsWith('.') ? (message + " " + validationMessage) : (message + ". " + validationMessage);
      } else if (validationMessage && !message) {
        message = validationMessage;
      } else if (!validationMessage && message) {
        // nothing to do
      } else {
        message = defaultMessage;
      }
      errorResponse.message = message;

      // TODO: could use: this.apiRespond(req, res, errorResponse, statusCode);
      return this.apiFail(req, res, statusCode, errorResponse);
    }
     */


    // TranslationService, UsersService,
    // TranslationService.t("error-403-heading")}], {oid: record.redboxOid}));
    // TranslationService.t('view-error-no-permissions');
    // TranslationService.t('missing-record');
    // TranslationService.t('edit-error-no-permissions');
    // TranslationService.t('failed-delete');
    // TranslationService.t('failed-restore');
    // TranslationService.t('failed-destroy'), {
    // TranslationService.t('failed-destroy')
    // TranslationService.t('failed-destroy'), {
    // TranslationService.t('edit-error-no-permissions')));
    // TranslationService.t('auth-update-error'));
    // TranslationService.t('edit-error-no-permissions')));
    // TranslationService.t('attachment-not-found')));
    // TranslationService.t('edit-error-no-permissions')) {
    // TranslationService.t('attachment-not-found')) {
    // TranslationService.t('edit-error-no-permissions')));
    // TranslationService.t('not-enough-disk-space');
    // TranslationService.t('edit-error-no-permissions')));
    // TranslationService.t('edit-error-no-permissions')) {
    // TranslationService.t('attachment-not-found')) {
    // TranslationService.t(req.param('titleLabel')) :
    // `${TranslationService.t('edit-dashboard')}
    // ${TranslationService.t(recordType + '-title-label')}`;
  }
}
