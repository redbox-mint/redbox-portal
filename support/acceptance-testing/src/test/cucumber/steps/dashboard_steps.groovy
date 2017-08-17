package steps

import au.com.redboxresearchdata.dlcf.page.DashboardPage

import static cucumber.api.groovy.EN.*

When(~/^I click on Proceed to the dashboard$/) { ->
  page.enterDashboard()
}
Then(~/^I am on the [Dd]ashboard page$/) { ->
  at DashboardPage
}
And(~/^I should see the [']?Create a plan[']? button$/) { ->
  page.assertCreatePlanButtonIsVisible()
}
And(~/^I should see my plans$/) { ->
  // Write code here that turns the phrase above into concrete actions
  page.assertMyPlansAreVisible()
}

When(~/^I go to the [Dd]ashboard page$/) { ->
  to DashboardPage
  at DashboardPage
}

When(~/^I try to go to the [Dd]ashboard page$/) { ->
  go DashboardPage.url
}

When(~/^I click on [Cc]reate [Aa] [Pp]lan$/) { ->
  page.enterPlan()
}
