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
class OverviewModule extends RecordModule {
  static content = {
    tabMenu {
      navTabMenus.find('a[href$="overview"]')
    }
    tabContent {
      navTabContent.$(".tab-pane#overview")
    }
    field {
      tabContent.$("dmp-field")
    }
    projectTitle {
      field
        .has("label", "for": "title", "text": "Project Title")
        .has("input#title", "type": "text")
    }
    projectDescription {
      field
        .has("label", "for": "description", "text": "Project Description")
        .has("textarea#description")
    }
    autoCompleteHolder { parent ->
      parent.$(".completer-holder")
    }
    autoCompleteInput { parent ->
      autoCompleteHolder(parent).$("input.completer-input", "placeholder": "Select a valid value")
    }
    autoCompleteDropDown(required: false) { parent ->
      autoCompleteHolder(parent).$(".completer-dropdown-holder")
    }
    institution {
      field
        .has("label", "text": "Institution")
    }

    dateTime { parent ->
      parent.$("datetime")
        .has("input", "placeholder": "Choose date")
        .has("span.fa-calendar")
    }
    startDate {
      field.$("date-time")
        .has("label", "for": "startDate", "text": "Start Date")
    }
    endDate {
      field.$("date-time")
        .has("label", "for": "endDate", "text": "End Date")
    }
    forCodes {
      field.$("repeatable div")
        .has("div.row label", "text": "Field of Research Codes")
        .has("div.row button.fa-plus-circle.btn-success", "type": "button")
    }

    forCodesDropDown {
      forCodes.$('.completer-title')
    }
  }

  @Override
  def assertTabMenu() {
    assert tabMenu?.text()?.trim() ==~ /Overview/
  }

  @Override
  def assertTabContent() {
    [projectTitle, projectDescription, autoCompleteInput(institution), dateTime(startDate), dateTime(endDate), autoCompleteInput(forCodes)].each { panel ->
      waitFor { panel }.isDisplayed()
    }
  }

  def enterForCodes(def text) {
    autoCompleteInput(forCodes) << text
  }

  def assertCodesDropDown(String csv) {
    def collected = waitFor{forCodesDropDown}.collect {
      it?.text()?.trim()
    }.unique()
    assert collected == csv.split(",")
  }

}
