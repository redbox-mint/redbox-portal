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
import { Http } from '@angular/http';
import 'rxjs/add/operator/map';
import 'rxjs/add/operator/toPromise';
import { BaseService } from '../shared/base-service'
import { ConfigService } from './config-service';

/**
 * Role related service
 *
 * Author: <a href='https://github.com/moisbo' target='_blank'>moisbo</a>
 */
@Injectable()
export class WorkspaceTypeService extends BaseService {

  constructor (@Inject(Http) http: Http, @Inject(ConfigService) protected configService: ConfigService) {
    super(http, configService);
  }

  getBrand() {
    return this.brandingAndPortalUrl;
  }

  getWorkspaceTypes() : Promise<any[]> {
    return this.http.get(`${this.brandingAndPortalUrl}/workspaces/types`, this.options)
    .toPromise()
    .then((res:any) => this.extractData(res));
  }

  getWorkspaceType(name: string) : Promise<any[]> {
    return this.http.get(`${this.brandingAndPortalUrl}/workspaces/types/` + name, this.options)
    .toPromise()
    .then((res:any) => this.extractData(res));
  }
}
