//<reference path='./../../typings/loader.d.ts'/>

import { Controllers as controllers,PopulateExportedMethods} from '@researchdatabox/redbox-core-types';
/**
 * Package that contains all Controllers.
 */




export module Controllers {
    
    @PopulateExportedMethods
    export class RenderView extends controllers.Core.Controller {

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

        /**
         * Renders the view that is passed to it (as a locals variable, usually from routes.js)
         *
         * @param req
         * @param res
         */
        public render(req, res) {
            var view = req.options.locals.view;
            if(view != null){
              this.sendView(req,res,view);
            } else {
              res.notFound(req.options.locals,"404");
            }
        }

        /**
         **************************************************************************************************
         **************************************** Override magic methods **********************************
         **************************************************************************************************
         */
    }
}
declare var module;

module.exports = new Controllers.RenderView().exports();
