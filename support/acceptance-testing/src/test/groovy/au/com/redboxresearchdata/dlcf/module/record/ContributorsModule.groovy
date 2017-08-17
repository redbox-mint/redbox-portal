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

package au.com.redboxresearchdata.dlcf.module.record
/**
 * @author Matt Mulholland (matt@redboxresearchdata.com.au)
 * @date 27/6/17
 */
class ContributorsModule extends RecordModule {
  static content = {
    tabMenu {
      navTabMenus.find('a[href$="contributors"]')
    }
    tabContent {
      navTabContent.$(".tab-pane#contributors")
    }
    field {
      tabContent.$("dmp-field repeatable rb-contributor div")
    }
    researcherNameTitle {
      field.$(".row").$("label", "text": "Researcher Name")
    }
    researcherNameInput {
      field.$(".row").$("input", "type": "text", "formcontrolname": "name")
    }
    emailAddressTitle {
      field.$(".row").$("label", "text": "Email Address")
    }
    emailAddressInput {
      field.$(".row").$("input", "type": "text", "formcontrolname": "email")
    }
    projectRoleTitle {
      field.$(".row").$("label", "text": "Project Role")
    }
    projectRoleInput {
      def selector = field.$(".row").$("select", "formcontrolname": "role")
      def collected = waitFor { selector.$("option") }.collect {
        it?.text()?.trim()
      }
      assert collected == ["Chief Investigator", "Data manager", "Collaborator", "Supervisor"]
      return selector
    }
  }

  @Override
  def assertTabMenu() {
    assert tabMenu?.text()?.trim() ==~ /Contributors/
  }

  @Override
  def assertTabContent() {
    [researcherNameTitle, researcherNameInput, emailAddressTitle, emailAddressInput, projectRoleTitle, projectRoleInput].each { panel ->
        waitFor { panel }.isDisplayed()
    }
    assert field.$(".row .row").find("label").collect {
      it?.text()?.trim()
    } == ["Researcher Name", "Email Address", "Project Role"]
    assert field.$(".row .row").find("[formcontrolname]").collect{
      it?.attr("formcontrolname")?.trim()
    } == ["name", "email", "role"]
  }

}
