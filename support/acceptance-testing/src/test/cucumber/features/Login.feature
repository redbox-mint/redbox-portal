@login
Feature: Login

  Scenario Outline: As any user, who is not logged in, I type in a url, and I am redirected to the login page
    When I try to go to the <starting> page
    Then I am on the Login page
    Examples:
      | starting   |
      | RecordEdit |
      | Home       |
      | Dashboard  |
      | Login      |


  Scenario Outline: As any user, I go to any page, and I do not log in and I observe the same logged out layout Page
    Given I try to go to the <starting> page
    When I do not log in
    Then I should see all of the logged out layout
    Examples:
      | starting   |
      | RecordEdit |
      | Home       |
      | Dashboard  |
      | Login      |

  Scenario: As any user, I select the login dialog
    Given I go to the home page
    When I click on login
    Then I am on the login page
    And I should see the login dialog

#   Once set, any other aaf login will be stuck with the same user/role
  Scenario Outline: As a <role> user, I login using <credentialsType>
    Given I am a <role> user
    And I go to the login page
    When I log in using <credentialsType> credentials
    Then I am on the dashboard page
    And I am logged in
    Examples:
      | role  | credentialsType |
      | admin | local           |
      | guest | aaf             |
