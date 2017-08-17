package steps

import au.com.redboxresearchdata.dlcf.page.AafTestOrganisationPage
import au.com.redboxresearchdata.dlcf.page.AafTestVirtualHomePage
import au.com.redboxresearchdata.dlcf.page.DashboardPage
import au.com.redboxresearchdata.dlcf.page.LoginPage

import static cucumber.api.groovy.EN.*

Given(~/^I log[ ]?in (?:with|using) local (?:credentials)?$/) { ->
  to LoginPage
  page.loginUsingLocalCredentials(world.user)
  at DashboardPage
  page.assertIsLoggedIn()
}

Given(~/^I log in (?:with|using) aaf (?:credentials)?$/) { ->
  to LoginPage
  page.enterAafLogin()
  world.useAafSession({ user ->
    at AafTestOrganisationPage
    page.selectAafOrganisation()
    at AafTestVirtualHomePage
    page.loginUsingAafCredentials(user)
  })
  at DashboardPage
  page.assertIsLoggedIn()
}

When(~/^I click on login$/) { ->
  page.enterLogin()
}

Then(~/^I am on the [Ll]ogin page$/) { ->
  at LoginPage
}

When(~/^I try to go to the [Ll]ogin page$/) { ->
  go LoginPage.url
}

Then(~/^I should see the login dialog$/) { ->
  page.assertMainPanelIsVisible()
}

Given(~/^I go to the [Ll]ogin page$/) { ->
  to LoginPage
  at LoginPage
}

When(~/^I enter test username and test password$/) { ->
  page.login()
}

Given(~/^I am logged in$/) { ->
  page.assertIsLoggedIn()
}

Given(~/^I do not log[ ]?in$/) { ->
  at LoginPage
  page.assertIsNotLoggedIn()
}

Then(~/^the header should show that I am not logged in$/) { ->
  page.assertHeaderIsVisible()
  page.assertIsNotLoggedIn()
}

Then(~/^the header should show that I am logged in$/) { ->
  page.assertHeaderIsVisible()
  page.assertIsLoggedIn()
}
