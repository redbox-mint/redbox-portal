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
class IntroductionModule extends RecordModule {
  static content = {
    tabMenu {
      navTabMenus.find('a[href$="intro"]')
    }
    tabContent {
      navTabContent.$(".tab-pane#intro")
    }
  }

  @Override
  def assertTabMenu() {
    assert tabMenu?.text()?.trim() ==~ /Introduction/
  }

  @Override
  def assertTabContent() {
    assertTabContentHeading()
    assertTabContentBody()
  }

  def assertTabContentHeading() {
    def heading = tabContent.find("dmp-field")[0]
    assert heading?.text()?.trim() ==~ /^[Ww]elcome to the [Dd]ata [Mm]anagement [Pp]lan [Ff]orm$/
  }

  def assertTabContentBody() {
    def body = tabContent.find("dmp-field").drop(1).collect { it?.text() }
    assert body?.join(" ")?.trim() ==~ /(?si)Some text to introduce the user to the form would go here.$/
  }
}
