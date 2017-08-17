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

package au.com.redboxresearchdata.dlcf.page

import au.com.redboxresearchdata.dlcf.helper.PageHelper
import geb.Page

/**
 * @author Matt Mulholland (matt@redboxresearchdata.com.au)
 * @date 5/7/17
 */
class AafTestOrganisationPage extends Page {
  static final String keyName = "AAF_TEST_URL_PART"
  static url = "https://rapid.test.aaf.edu.au/jwt/authnrequest/research/${keyName}"
  static at = {
    assertPageIsVisible()
  }
  static content = {

    aafPage {
      $("body")
        .has("img", src: "/aaf_logo.png")
        .has(".content", text: iContains("Login to Rapid Connect Test"))
    }
    virtualHomeLink {
      aafPage.$("td", text: iContains(~/AAF Virtual Home/))
    }

    submitLink {
      String jQElement = "#select_organisation_button"
      js.exec PageHelper.scrollIntoView(jQElement)
      aafPage.$(jQElement)
    }
  }

  AafTestOrganisationPage() {
    if (!System.getenv(keyName)) {
      throw new IllegalStateException("Must define ${keyName} as system property!")
    }
  }

  def assertPageIsVisible() {
    waitFor { virtualHomeLink }.isDisplayed()
  }

  def selectAafOrganisation() {
    waitFor { virtualHomeLink }.click()
    waitFor { submitLink }.click()
  }
}

