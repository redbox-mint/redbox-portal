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

import static cucumber.api.groovy.Hooks.After

/**
 * @author Matt Mulholland (matt@redboxresearchdata.com.au)
 * @date 5/7/17
 */
class AafTestVirtualHomePage extends Page {
  static url = 'https://vho.test.aaf.edu.au/login?ssourl=https://vho.test.aaf.edu.au/idp/Authn/RemoteUser&relyingparty=https://rapid.test.aaf.edu.au/shibboleth'
  static at = {
    assertPageIsVisible()
  }
  static content = {
    aafPage {
      $("body")
    }
    header {
      aafPage.$("header", text: iContains(~/AAF Virtual Home[\s]*Test Federation/))
    }
    loginPanel {
      aafPage.$("form.form-login")
    }
    loginUsername {
      loginPanel.$("#username")
    }
    loginPassword {
      loginPanel.$("#password")
    }
    loginSubmit {
      String jQElement = "form.form-login button"
      js.exec PageHelper.scrollIntoView(jQElement)
      loginPanel.$("button", type: "submit")
    }
  }

  def assertPageIsVisible() {
//    waitFor { header }.isDisplayed()
    assertLoginPanelIsVisible()
  }

  def assertLoginPanelIsVisible() {
    waitFor { loginUsername }.isDisplayed()
    waitFor { loginPassword }.isDisplayed()
    waitFor { loginSubmit }.isDisplayed()
  }

  def loginUsingAafCredentials(def user) {
    user.setAafCredentials()
    loginUsingAafCredentials(user.credentials.username, user.credentials.password)
  }

  def loginUsingAafCredentials(String username, String password) {
    loginUsername = username
    loginPassword = password
    loginSubmit.click()
  }

}
