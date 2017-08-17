/*
 *
 *  * Copyright (C) 2017 Queensland Cyber Infrastructure Foundation (http://www.qcif.edu.au/)
 *  *
 *  * This program is free software: you can redistribute it and/or modify
 *  * it under the terms of the GNU General Public License as published by
 *  * the Free Software Foundation; either version 2 of the License, or
 *  * (at your option) any later version.
 *  *
 *  * This program is distributed in the hope that it will be useful,
 *  * but WITHOUT ANY WARRANTY; without even the implied warranty of
 *  * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 *  * GNU General Public License for more details.
 *  *
 *  * You should have received a copy of the GNU General Public License along
 *  * with this program; if not, write to the Free Software Foundation, Inc.,
 *  * 51 Franklin Street, Fifth Floor, Boston, MA 02110-1301 USA.
 *
 */

package au.com.redboxresearchdata.dlcf.module

import geb.Module

/**
 * @author Matt Mulholland (matt@redboxresearchdata.com.au)
 * @date 24/6/17
 */
class MenuModule extends Module {
  static content = {
    layout { module LayoutModule }
    homeMenu {
      //using findAll easier to debug than geb's :text
      def selector = layout.mainMenu.$("li a").findAll {
        it?.text()?.trim()?.toLowerCase() ==~ /home/
      }
      assert selector.size() == 1
      return selector[0]
    }
    dashboardMenu {
      //using findAll easier to debug than geb's :text
      def selector = layout.mainMenu.$("li a").findAll {
        it?.text()?.trim()?.toLowerCase() ==~ /dashboard/
      }
      assert selector.size() == 1
      return selector[0]
    }
    adminMenu {
      //using findAll easier to debug than geb's :text
      def selector = layout.mainMenu.$("li a").findAll {
        it?.text()?.trim()?.toLowerCase() ==~ /admin/
      }
      assert selector.size() == 1
      return selector[0]
    }
  }
}
