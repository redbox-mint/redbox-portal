package steps

import au.com.redboxresearchdata.dlcf.helper.CustomWorld
import au.com.redboxresearchdata.dlcf.model.user.AdminUser
import au.com.redboxresearchdata.dlcf.model.user.GuestUser

import static cucumber.api.groovy.EN.Given
import static cucumber.api.groovy.Hooks.After
import static cucumber.api.groovy.Hooks.World

/**
 * @author Matt Mulholland
 * @date 20/6/17
 */

World {
  CustomWorld.getInstance()
}

Given(~/^I am a[n]? (\w+) user$/) { user ->
  switch (user) {
    case "admin":
      world.user = new AdminUser()
      break
    case "guest":
      world.user = new GuestUser()
      break
    default:
      throw new IllegalArgumentException("User ${user} has not been implemented")
      break
  }
}

After() {
  world.user = null
}
