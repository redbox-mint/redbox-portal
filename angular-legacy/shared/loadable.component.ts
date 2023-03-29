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
 * Base class for components that require async initialization. Base implementation will wait for the TranslatorService to load. This can be overloaded to wait for other services, data, etc.
 * 
 * The state is exported via the `isLoading` property, UI elements will need to use this property to communicate the state.
 * 
 * Breaking change (14 Nov 2022): previously the component is injecting the 'hidden' class into the '#loading' element, components will need to self-manage the specifics on how to communicate loading state to the user.
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

  waitForInit(serviceArr: any[], handler:any) {
    const subs = _.map(serviceArr, (service)=> { return service.getInitSubject() });
    const subTracker = {loaded: {}, subs: {}};
    const subTrackerFn = (serviceIdx:any) => {
      return (serviceInst:any) => {
        subTracker.loaded[`${serviceIdx}`] = serviceInst;
        if (_.keys(subTracker.loaded).length >= subs.length) {
          subTracker.subs[`${serviceIdx}`].unsubscribe();
          handler();
        }
      };
    };
    _.forOwn(serviceArr, (service:any, serviceIdx:any) => {
      subTracker.subs[`${serviceIdx}`] = service.getInitSubject().subscribe(subTrackerFn(serviceIdx));
      service.emitInit();
    });
  }
}
