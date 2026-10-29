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

import { ConfigService } from './config.service';
import { Initable } from './initable.interface';
import { ChangeDetectorRef, Component, Injector, inject, ChangeDetectionStrategy } from '@angular/core';
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
  template: '<p>Base Component</p>',
  changeDetection: ChangeDetectionStrategy.OnPush,
  standalone: false,
})
export abstract class BaseComponent implements Initable {
  private readonly injector = inject(Injector);
  public loadError = '';
  public loadPending = false;
  private retryLoadAction?: () => Promise<unknown>;

  private readonly changeDetectorRef = inject(ChangeDetectorRef);
  private readonly wrappedAsyncMethods = new Set<string>();
  private destroyed = false;

  protected isReady: boolean = false;
  protected initSubject: BehaviorSubject<any> = new BehaviorSubject(false);
  protected initDependencies: Initable[] = [];
  private filterFn = function (initStat: boolean) {
    return initStat;
  };
  // convenience properties
  protected brandingAndPortalUrl: string = '';

  constructor() {}

  /**
   * See https://angular.io/api/core/OnInit
   */
  ngOnInit() {
    this.wrapAsyncComponentMethodsForRender();
    void this.initialize();
  }

  private async initialize(): Promise<void> {
    this.loadPending = true;
    this.loadError = '';
    try {
      await this.waitForDeps();
      await this.initComponent();
      if (this.destroyed) return;
      this.isReady = true;
      this.initSubject.next(true);
    } catch (error) {
      this.showLoadError(error, () => this.initialize());
      this.initSubject.error(error);
    } finally {
      this.loadPending = false;
      this.requestRender();
    }
  }

  protected showLoadError(error: unknown, retry: () => Promise<unknown>): void {
    const status = (error as { status?: number } | null)?.status;
    this.loadError =
      status === 401 || status === 403
        ? 'Unable to load data. Your session may have expired or access was denied. Sign in again, then retry.'
        : 'Unable to load data. Check your connection and retry. You may need to sign in again. If the problem continues, reload the page or contact support.';
    this.retryLoadAction = retry;
  }

  public async retryLoad(): Promise<void> {
    if (this.loadPending || !this.retryLoadAction) {
      return;
    }
    const retry = this.retryLoadAction;
    this.loadPending = true;
    this.loadError = '';
    if (this.initSubject.hasError) {
      this.initSubject = new BehaviorSubject(false);
    }
    try {
      await this.injector.get(ConfigService).refreshConfig();
      await retry();
    } catch (error) {
      this.showLoadError(error, retry);
      if (!this.isReady) {
        this.initSubject.error(error);
      }
    } finally {
      this.loadPending = false;
      this.requestRender();
    }
  }

  ngOnDestroy() {
    this.destroyed = true;
  }
  /**
   * Called when component specific initialisation can happen, extensions need to override.
   */
  protected abstract initComponent(): Promise<void>;

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

  protected requestRender() {
    if (!this.destroyed) this.changeDetectorRef.markForCheck();
  }

  private wrapAsyncComponentMethodsForRender() {
    let proto = Object.getPrototypeOf(this);
    while (proto && proto !== BaseComponent.prototype && proto !== Object.prototype) {
      for (const methodName of Object.getOwnPropertyNames(proto)) {
        if (this.wrappedAsyncMethods.has(methodName) || this.shouldSkipMethodWrap(methodName, proto)) {
          continue;
        }

        const descriptor = Object.getOwnPropertyDescriptor(proto, methodName);
        const originalMethod = descriptor?.value;
        if (typeof originalMethod !== 'function') {
          continue;
        }

        Object.defineProperty(this, methodName, {
          configurable: true,
          writable: true,
          value: (...args: any[]) => {
            const result = originalMethod.apply(this, args);
            if (!result || typeof result.then !== 'function') {
              return result;
            }

            return Promise.resolve(result).finally(() => {
              this.requestRender();
            });
          },
        });
        this.wrappedAsyncMethods.add(methodName);
      }

      proto = Object.getPrototypeOf(proto);
    }
  }

  private shouldSkipMethodWrap(methodName: string, proto: object) {
    if (methodName === 'constructor' || methodName === 'ngOnInit' || methodName === 'ngOnDestroy') {
      return true;
    }

    const descriptor = Object.getOwnPropertyDescriptor(proto, methodName);
    return !descriptor || !!descriptor.get || !!descriptor.set;
  }
}
