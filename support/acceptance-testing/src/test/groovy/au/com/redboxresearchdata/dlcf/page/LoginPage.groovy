package au.com.redboxresearchdata.dlcf.page

import au.com.redboxresearchdata.dlcf.helper.PageHelper
import au.com.redboxresearchdata.dlcf.module.login.AafLoginModule
import au.com.redboxresearchdata.dlcf.module.login.LocalLoginModule
/**
 * @author Matt Mulholland
 * @date 24/5/17
 */
class LoginPage extends GenericLayoutPage {
  static url = "/default/rdmp/user/login"
  static at = {
    assertMainPanelIsVisible()
  }
  static content = {
    aaf { module AafLoginModule }
    local { module LocalLoginModule }
  }

  @Override
  def assertMainPanelIsVisible() {
    waitFor { aaf }.isDisplayed()
    waitFor { local }.isDisplayed()
  }

  def loginUsingLocalCredentials(def user) {
    user.setLocalCredentials()
    loginUsingLocalCredentials(user.credentials.username, user.credentials.password)
  }

  def loginUsingLocalCredentials(String username, String password) {
    local.username = username
    local.password = password
    // ensure the driver can see the entire login dialog
    js.exec PageHelper.scrollIntoView("#password")
    local.submit.click()
  }

  def enterAafLogin() {
    aaf.link.click()
  }

}
