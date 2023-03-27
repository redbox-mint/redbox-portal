// Copyright (c) 2023 Queensland Cyber Infrastructure Foundation (http://www.qcif.edu.au/)
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

import { Initable } from './initable.interface';
import { Component } from '@angular/core';
import { BehaviorSubject, Subject, firstValueFrom, filter } from 'rxjs';
/**
 * Base component class for ReDBox Portal.
 * 
 * Encapsulates boilerplate NG-specific tasks, so extensions can focus on specific features.
 *  
 * See https://angular.io/guide/lifecycle-hooks
 * 
 * Author: <a href='https://github.com/shilob' target='_blank'>Shilo Banihit</a>
 */
@Component({
  template: '<p>Base Component</p>'
})
export abstract class BaseComponent implements Initable {

  protected isReady: boolean = false;
  protected initSubject: BehaviorSubject<any> = new BehaviorSubject(false);
  protected initDependencies: Initable[] = [];
  private filterFn = function(initStat: boolean) { return initStat; };
  // convenience properties
  protected brandingAndPortalUrl: string = '';

  constructor() {
  }
  
  /**
   * See https://angular.io/api/core/OnInit
   */
  ngOnInit() {
    (async () => {
      // really it is just for dependencies
      await this.waitForDeps();
      // call this to inform child class to begin own init
      await this.initComponent();
      this.isReady = true;
      // inform interested parties in RXJS-land
      this.initSubject.next(this.isReady);
    })();
  }
  /** 
   * Called when component specific initialisation can happen, extensions need to override. 
   */
  protected abstract initComponent():Promise<void>;

  /**
   * For those interested in the init from RXJS-land. 
   * 
   * Note that it returns a BehaviorSubject instance, and will have an initial value of false, so process the return value as needed.
   */
  getInitSubject(): Subject<any> {
    return this.initSubject;
  }

  /**
   * Wait for dependencies to initialise
   */
  async waitForDeps(): Promise<any> {
    if (!this.isReady) {
      for (let dep of this.initDependencies) {
        await dep.waitForInit();
      }
    }
  }
  /**
   * 
   * For those interested in the init from the Promise-land
   */
  async waitForInit(): Promise<any> {
    return await firstValueFrom(this.getInitSubject().pipe(filter(this.filterFn)));
  }
  /**
   * Main flag to indicate the init status
   */
  isInitializing(): boolean {
    return !this.isReady;
  }
}
