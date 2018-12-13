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
import groovy.json.StringEscapeUtils
/**
 * @author Matt Mulholland (matt@redboxresearchdata.com.au)
 * @date 24/6/17
 */
class LayoutModule extends Module {
  static content = {

    header {
      $(".header-area").has(".user-menu")
    }
    branding {
      $(".site-branding-area").has(".logo").has("img", "src": "http://dlcfportal:1500/default/rdmp/images/logo.png")
    }

    defaultPanel {
      $(".maincontent-body")
    }

    mainMenu {
      $(".mainmenu-area")
    }
    footer {
      def selector = $(".footer-bottom-area").$(".copyright").findAll{

        StringEscapeUtils.escapeJava(it?.text()?.trim()) ==~ /\\u00A9 2017 Queensland [Cc]yberinfrastructure [Ff]oundation/
      }
      assert selector.size() == 1
      return selector[0]
    }
  }


}
