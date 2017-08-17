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

package steps

import static cucumber.api.groovy.EN.Then

/**
 * @author Matt Mulholland (matt@redboxresearchdata.com.au)
 * @date 24/6/17
 */

Then(~/^I should see(?: all of)? the (\w+) layout$/) { role ->
  page.assertAllAuthorisedLayoutFor(role)
}

Then(~/^I should see(?: all of)? the logged out layout$/) { ->
  page.assertAllLoggedOutLayout()
}

Then(~/^I should see the header$/) { ->
  page.assertHeaderIsVisible()
}

Then(~/^I should see(?: all of)? the (admin|guest) menu panels$/) { role ->
  page.assertAuthorisedRoleMenusAreVisibleFor(role)
}

Then(~/^I should see(?: all of)? the default menu panels$/) { ->
  page.assertAllAuthorisedDefaultMenusAreVisible()
}

Then(~/^I should see the footer$/) { ->
  page.assertFooterIsVisible()
}
