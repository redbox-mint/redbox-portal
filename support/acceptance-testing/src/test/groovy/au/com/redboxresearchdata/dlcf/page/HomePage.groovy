package au.com.redboxresearchdata.dlcf.page
/**
 * @author <a href="matt@redboxresearchdata.com.au">Matt Mulholland</a>
 * Created on 25/05/2017.
 */

class HomePage extends GenericLayoutPage {

  static url = "/default/rdmp/home"

  static at = { assertMainPanelIsVisible() }

  static content = {
    defaultPanel {
      layout.defaultPanel.$(".default-page")
    }
    defaultPanelHeader {
      def selector = defaultPanel.$(".header")
      assert selector.$("div.container")?.text()?.trim() ==~ /(?si)^This is the homepage of the DMP Tool. Some content needs to go here as well as a link to the researcher dashboard \(still to be implemented\)$/
      return selector
    }
    defaultPanelTitle {
      def selector = defaultPanelHeader.$("h1#main-title")
      assert selector?.text()?.trim() ==~ /^(?s)[Ww]elcome to the DMP [Tt]ool$/
      return selector
    }
    defaultPanelBody {
      defaultPanel.$("div.main.container")
    }
    dashboardLink {
      def selector = defaultPanelBody.$("a[href*='dashboard']")
      assert selector?.text()?.trim() ==~ /Proceed to the dashboard/
      return selector
    }
  }

  @Override
  def assertMainPanelIsVisible() {
    waitFor { defaultPanelTitle }.isDisplayed()
    waitFor { dashboardLink }.isDisplayed()
  }

  def enterLogin() {
    getDriver().manage().window().maximize()
    def result = loginHeader.loginLink.click()
    print result
  }

  def enterDashboard() {
    getDriver().manage().window().maximize()
    def result = $(dashboardLink).click()
    print result
  }

  def assertIsLoggedIn() {
    super.assertIsLoggedIn()
    assertMainPanelIsVisible()
  }
}
