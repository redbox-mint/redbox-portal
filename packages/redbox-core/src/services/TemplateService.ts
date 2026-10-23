// Copyright (c) 2025 Queensland Cyber Infrastructure Foundation (http://www.qcif.edu.au/)
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

import { PopulateExportedMethods } from '../decorator/PopulateExportedMethods.decorator';
import { Services as services } from '../CoreService';
import { Services as Owned } from '../pages/Templates';
export namespace Services {
  @PopulateExportedMethods
  export class Template extends services.Core.Service {
    public buildClientMapping(...args: Parameters<Owned.Template['buildClientMapping']>) {
      return Reflect.apply(Owned.Template.prototype.buildClientMapping, this, args) as ReturnType<
        Owned.Template['buildClientMapping']
      >;
    }
    public buildClientJsonata(...args: Parameters<Owned.Template['buildClientJsonata']>) {
      return new Owned.Template(sails.log).buildClientJsonata(...args);
    }
    public buildClientHandlebars(...args: Parameters<Owned.Template['buildClientHandlebars']>) {
      return new Owned.Template(sails.log).buildClientHandlebars(...args);
    }
    public buildKeyString(...args: Parameters<Owned.Template['buildKeyString']>) {
      return new Owned.Template(sails.log).buildKeyString(...args);
    }
  }
}
declare global {
  let TemplateService: Services.Template;
}
