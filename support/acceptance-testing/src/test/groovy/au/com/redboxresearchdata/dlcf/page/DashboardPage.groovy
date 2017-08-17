package au.com.redboxresearchdata.dlcf.page
/**
 * @author Matt Mulholland
 * @date 24/5/17
 */
class DashboardPage extends GenericLayoutPage {
  static url = "/default/rdmp/dashboard"
  static at = {
    assertMainPanelIsVisible()
  }
  static content = {
    createButton {
      $('a.btn[href$="record/edit"]')
    }
    defaultPanel {
      layout.defaultPanel.$(".default-page")
    }
    defaultPanelTitle {
      def selector = defaultPanel.$(".header h1#main-title")
      assert selector?.text()?.trim() ==~ /^(?s)[Ww]elcome to the DMP [Tt]ool$/
      return selector
    }

    defaultPanelContent {
      def myplans = defaultPanel.$("div.main.container").$("dashboard[portal='rdmp']")
      assert myplans?.has("h2")?.text()?.trim() ==~ /^(?s).*My.*[Dd]raft.*[Pp]lans.*$/
      assert myplans?.has("h2")?.text()?.trim() ==~ /^(?s).*My.*[Aa]ctive.*[Pp]lans.*$/
      return myplans
    }
  }

  def assertCreatePlanButtonIsVisible() {
    waitFor { createButton }.isDisplayed()
  }

  @Override
  def assertMainPanelIsVisible() {
    waitFor { defaultPanelTitle }.isDisplayed()
    waitFor { defaultPanelContent }.isDisplayed()
  }

  def assertMyPlansAreVisible() {
    waitFor { defaultPanelContent }.isDisplayed()
  }

  def enterPlan() {
    getDriver().manage().window().maximize()
    def result = createButton.click()
    print result
  }

}
