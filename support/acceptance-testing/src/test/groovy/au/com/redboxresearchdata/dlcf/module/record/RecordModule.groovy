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

package au.com.redboxresearchdata.dlcf.module.record

import au.com.redboxresearchdata.dlcf.helper.PageHelper
import au.com.redboxresearchdata.dlcf.module.LayoutModule
import geb.Module

/**
 * @author Matt Mulholland (matt@redboxresearchdata.com.au)
 * @date 27/6/17
 */
abstract class RecordModule extends Module {
  static content = {
    layout { module LayoutModule }
    form {
      layout.$("form")
    }
    navTab {
      form.$("div ul.nav")
    }
    navTabMenus {
      def menus = navTab.$("li")
      assert menus.size() == 4
      return menus
    }
    navTabContent {
      form.$("div div.tab-content")
    }

    navTabFooter {
      js.exec PageHelper.scrollIntoView(".maincontent-body form div.form-row div")
      form.$("div.form-row div")
        .has("button.btn-primary", type: "button", text: "Save")
        .has("button.btn-warning", type: "button", text: "Cancel")
    }
  }

  def assertAtTabMenu() {
    assertTabMenu()
    assertTabContent()
    assertNavTabFooterIsDisplayed()
  }

  abstract def assertTabMenu()

  abstract def assertTabContent()

  def assertNavTabFooterIsDisplayed() {
    waitFor { navTabFooter }.isDisplayed()
  }
}
