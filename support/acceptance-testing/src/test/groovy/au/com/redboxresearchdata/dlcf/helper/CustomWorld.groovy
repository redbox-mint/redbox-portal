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

package au.com.redboxresearchdata.dlcf.helper

/**
 * @author Matt Mulholland (matt@redboxresearchdata.com.au)
 * @date 4/7/17
 */
class CustomWorld {
  private static CustomWorld world

  public def user
//  ensure only synchonized method has access to this variable
  boolean hasAafSession = false

  synchronized def useAafSession(Closure virtualHomeSteps) {
    if (!hasAafSession) {
      hasAafSession = true
      virtualHomeSteps(user)
    }
  }

  static CustomWorld getInstance() {
    if (world == null) {
      world = new CustomWorld();
    }
    return world;
  }

  def reset() {
    world = new CustomWorld();
  }
}
