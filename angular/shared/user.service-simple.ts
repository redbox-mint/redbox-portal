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

import { Injectable, Inject} from '@angular/core';
import { Http, Response, RequestOptions, Headers } from '@angular/http';
import 'rxjs/add/operator/map';
import 'rxjs/add/operator/toPromise';
import { BaseService } from '../shared/base-service'
import { User, LoginResult, SaveResult } from './user-models'
import { ConfigService } from '../shared/config-service';
/**
 * User related service...
 *
 * Author: <a href='https://github.com/shilob' target='_blank'>Shilo Banihit</a>
 *
 */
@Injectable()
export class UserSimpleService extends BaseService {
  protected baseUrl: any;
  protected config: any;
  protected headers: any;

  constructor (@Inject(Http) http: Http, @Inject(ConfigService) protected configService: ConfigService) {
    super(http, configService);
  }

  getInfo(): Promise<User> {
    return this.http.get(`${this.baseUrl}${this.config.rootContext}/user/info`)
    .toPromise()
    .then((res:any) => this.extractData(res, 'user') as User);
  }

  loginLocal(username: string, password: string): Promise<any> {
    console.log(`Logging in locally using brand: ${this.config.branding}, portal: ${this.config.portal}`);
    return this.http.post(`${this.baseUrl}${this.config.rootContext}/user/login_local`, {username: username, password:password, branding:this.config.branding, portal: this.config.portal}, this.getOptionsClient())
    .toPromise()
    .then(this.extractData);
  }

  getUsers() :Promise<User[]> {
    return this.http.get(`${this.brandingAndPortalUrl}/admin/users/get`, this.options)
    .toPromise()
    .then((res:any) => this.extractData(res) as User[]);
  }

  updateUserDetails(userid: any, details: any) {
    return this.http.post(`${this.brandingAndPortalUrl}/admin/users/update`, {userid: userid, details:details}, this.options)
    .toPromise()
    .then((res:any) => this.extractData(res) as SaveResult[]);
  }

  addLocalUser(username: any, details: any) {
    return this.http.post(`${this.brandingAndPortalUrl}/admin/users/newUser`, {username: username, details:details}, this.options)
    .toPromise()
    .then((res:any) => this.extractData(res) as SaveResult[]);
  }

  genKey(userid: any) {
    return this.http.post(`${this.brandingAndPortalUrl}/admin/users/genKey`, {userid: userid}, this.options)
    .toPromise()
    .then((res:any) => this.extractData(res) as SaveResult[]);
  }

  revokeKey(userid: any) {
    return this.http.post(`${this.brandingAndPortalUrl}/admin/users/revokeKey`, {userid: userid}, this.options)
    .toPromise()
    .then((res:any) => this.extractData(res) as SaveResult[]);
  }

  updateUserProfile(details: any) {
    return this.http.post(`${this.brandingAndPortalUrl}/user/update`, {details:details}, this.options)
    .toPromise()
    .then((res:any) => this.extractData(res) as SaveResult[]);
  }

  genUserKey() {
    return this.http.post(`${this.brandingAndPortalUrl}/user/genKey`, {},this.options)
    .toPromise()
    .then((res:any) => this.extractData(res) as SaveResult[]);
  }

  revokeUserKey() {
    return this.http.post(`${this.brandingAndPortalUrl}/user/revokeKey`, {},this.options)
    .toPromise()
    .then((res:any) => this.extractData(res) as SaveResult[]);
  }

}
