package au.com.redboxresearchdata.dlcf.model.user

import au.com.redboxresearchdata.dlcf.model.credentials.LocalCredentials

/**
 * @author Matt Mulholland
 * @date 20/6/17
 */
class AdminUser extends GenericUser {
  AdminUser() {
    super("admin")
  }
}
