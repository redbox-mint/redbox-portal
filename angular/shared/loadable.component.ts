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
import { TranslationService } from './translation-service';

import * as _ from "lodash";
declare var jQuery: any;
/**
 * Convenience class to wrap JQuery calls ...
 *
 * Author: <a href='https://github.com/shilob' target='_blank'>Shilo Banihit</a>
 *
 */
export class LoadableComponent  {
  isLoading: boolean;
  translatorReady: boolean;
  translationService: any;
  spinnerElem: string = `<i class="fa fa-spinner fa-pulse fa-1x fa-fw"></i>`;

  constructor() {
    this.isLoading = true;
    this.synchLoading();

  }

  initTranslator(translationService: TranslationService) {
    this.translationService = translationService;
    translationService.isReady((tService:any) => {
      this.translatorReady = true;
    });
  }

  translatorLoaded() {
    this.translatorReady = true;
    this.checkIfHasLoaded();
  }

  public checkIfHasLoaded() {
    if (this.hasLoaded()) {
      this.setLoading(false);
    }
  }

  hasLoaded() {
    return this.isLoading && (this.translationService ? this.translatorReady : true);
  }

  setLoading(loading: boolean=true) {
    this.isLoading = loading;
    this.synchLoading();
  }

  synchLoading() {
    if (this.isLoading) {
      jQuery("#loading").removeClass("hidden");
    } else {
      jQuery("#loading").addClass("hidden");
    }
  }

  getTranslated(key, defValue) {
    if (!_.isEmpty(key) && !_.isUndefined(key)) {
      // Keys can now be any string, previously, these were required to start with the '@' character
      if (this.translationService) {
        return this.translationService.t(key);
      } else {
        return key;
      }
    } else {
      return defValue;
    }
  }
}
