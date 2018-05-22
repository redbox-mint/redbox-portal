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

import { Component, Inject, Input, ElementRef } from '@angular/core';
import { Location, LocationStrategy, PathLocationStrategy } from '@angular/common';
import { LoadableComponent } from './shared/loadable.component';
import moment from 'moment-es6';
import { TranslationService } from './shared/translation-service';

/**
 * Main Export component
 *
 * Author: <a href='https://github.com/shilob' target='_blank'>Shilo Banihit</a>
 *
 */
@Component({
  moduleId: module.id,
  selector: 'export-form',
  templateUrl: './export-form.html',
  providers: [Location, {provide: LocationStrategy, useClass: PathLocationStrategy}]
})

export class ExportFormComponent extends LoadableComponent {
  criticalError: any;
  modBefore: any;
  modAfter: any;
  initSubs: any;
  datePickerOpts: any;
  timePickerOpts: any;
  hasClearButton: boolean;

  constructor(
    elm: ElementRef,
    @Inject(Location) protected LocationService: Location,
    translationService:TranslationService
  ) {
    super();
    this.timePickerOpts = false;
    this.hasClearButton = false;
    this.datePickerOpts = {placeholder: 'dd/mm/yyyy', format: 'dd/mm/yyyy', icon: 'fa fa-calendar'};
    this.initTranslator(translationService);
    translationService.isReady(tService => {
      this.checkIfHasLoaded();
    });
  }

  download() {
    const before = this.modBefore ? moment(this.modBefore).format('YYYY-MM-DD') : '';
    const after = this.modAfter ? moment(this.modAfter).format('YYYY-MM-DD') : '';
    const url = this.LocationService.prepareExternalUrl(`export/record/download/csv?before=${before}&after=${after}`);
    window.open(url, '_blank');
  }

}
