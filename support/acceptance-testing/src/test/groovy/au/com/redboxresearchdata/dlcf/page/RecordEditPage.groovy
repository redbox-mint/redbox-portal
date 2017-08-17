package au.com.redboxresearchdata.dlcf.page

import au.com.redboxresearchdata.dlcf.module.record.ContributorsModule
import au.com.redboxresearchdata.dlcf.module.record.IntroductionModule
import au.com.redboxresearchdata.dlcf.module.record.OverviewModule
/**
 * @author Matt Mulholland
 * @date 24/5/17
 */
class RecordEditPage extends GenericLayoutPage {
  static url = "/default/rdmp/record/edit"
  static at = {
    assertMainPanelIsVisible()
  }

  static content = {
    introduction { module IntroductionModule }
    overview { module OverviewModule }
    contributors { module ContributorsModule }

  }

  @Override
  def assertMainPanelIsVisible() {
    assertAtTabMenu("introduction")
  }

  def assertAtTabMenu(def tabName) {
    assert getActiveTabMenu().find("a") == getTabMenu(tabName).tabMenu
    getTabMenu(tabName).assertAtTabMenu()
  }

  def getActiveTabMenu() {
    introduction.navTabMenus.filter(".active")
  }

  def clickTabMenu(def tabName) {
    getTabMenu(tabName).tabMenu.click()
  }

  def getTabMenu(def tabName) {
    switch (tabName) {
      case ~/[Ii]ntroduction/:
        introduction
        break
      case ~/[Oo]verview/:
        overview
        break
      case ~/[Cc]ontributors/:
        contributors
        break
      case ~/[Ss]ubmit/:
      default:
        throw new IllegalStateException("No tab name: ${tabName} is supported.")
  }
  }

}
