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
import { User, LoginResult } from './user-models'
import { ConfigService } from '../shared/config-service';
/**
 * User related service...
 *
 * @author <a target='_' href='https://github.com/shilob'>Shilo Banihit</a>
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
    return this.http.get(`${this.baseUrl}/user/info`)
    .toPromise()
    .then((res:any) => this.extractData(res, 'user') as User);
  }

  loginLocal(username: string, password: string): Promise<any> {
    return this.http.post(`${this.baseUrl}/user/login_local`, {username: username, password:password}, this.getOptionsClient())
    .toPromise()
    .then(this.extractData);
  }

}
