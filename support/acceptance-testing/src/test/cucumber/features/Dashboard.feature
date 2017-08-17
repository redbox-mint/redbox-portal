@dashboard
Feature: Dashboard

  Scenario Outline: As a <role> user, I login using <credentialsType> credentials, and I navigate the dashboard
    Given I am a <role> user
    When I login using <credentialsType> credentials
    Then I am on the dashboard page
    And I should see the 'Create a plan' button
    And I should see my plans
    Examples:
      | role  | credentialsType |
      | admin | local           |
      | guest | aaf             |

  Scenario Outline: As a <role> user, I login using <credentialsType> credentials, and I go to the home page, and then to the dashboard
    Given I am a <role> user
    And I login using <credentialsType> credentials
    And I am on the dashboard page
    When I go to the home page
    And I click on Proceed to the dashboard
    Then I am on the dashboard page
    And I should see the 'Create a plan' button
    And I should see my plans
    Examples:
      | role  | credentialsType |
      | admin | local           |
      | guest | aaf             |

