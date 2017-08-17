@createrecord
Feature: CreateRecord

  Scenario: As a user who is not logged in, I observe the layout, via the default workflow
    Given I go to the Home page
    When I click on Proceed to the dashboard
    Then I am on the Login page
    And I should see all of the logged out layout

  Scenario Outline: As a <role> user, who logs in using <credentialsType> credentials, I visit the create record url, and I observe the CreateRecord Page
    Given I am a <role> user
    And I go to the Home page
    And I click on login
    And I log in using <credentialsType> credentials
    When I go to the CreateRecord page
    Then I should see all of the <role> layout
    Examples:
      | role  | credentialsType |
      | admin | local           |
      | guest | aaf             |

  Scenario Outline: As a <role> user, who logs in using <credentialsType> credentials, I click on Create a Plan, and I observe the <role> CreateRecord Page
    Given I am a <role> user
    And I log in using <credentialsType> credentials
    When I click on Create a Plan
    Then I am on the Create Record page
    And I should see all of the <role> layout
    Examples:
      | role  | credentialsType |
      | admin | local           |
      | guest | aaf             |

  Scenario Outline: As a <role> user, who logs in using <credentialsType> credentials, I observe the create record Introduction panel
    Given I am a <role> user
    And I log in using <credentialsType> credentials
    When I go to the Create Record page
    And I click on the <tab> tab menu
    Then I should see the <tab> tab content
    Examples:
      | role  | credentialsType | tab          |
      | admin | local           | Introduction |
      | admin | local           | Overview     |
      | admin | local           | Contributors |
      | guest | aaf             | Introduction |
      | guest | aaf             | Overview     |
      | guest | aaf             | Contributors |
##      | admin | local           | Submit

  Scenario Outline: As a <role> user, who logs in using <credentialsType> credentials, I enter for codes
    Given I am a <role> user
    And I log in using <credentialsType> credentials
    When I go to the Create Record page
    And I click on the Overview tab
    And I enter <forCodesInput> in the for codes input field
    Then I should see the for codes dropdown list show <forCodesResponse>
    Examples:
      | role  | credentialsType | forCodesInput  | forCodesResponse                                                                                 |
      | admin | local           | earth sciences | 04 - EARTH SCIENCES,0499 - OTHER EARTH SCIENCES,049999 - Earth Sciences not elsewhere classified |



#  Scenario: Observe the create record Overview panel
#    Given I have logged in
#    And I have entered create a new record
#    When I click on Overview
#    Then I should see the label Project Title
#    And I should the input for Project Title
#    And I should see the label Project Description
#    And I should see the input for Project Description
#    And I should see the label Start Date
#    And I should see the input for Start Date
#    And I should see the label End Date
#    And I should see the input for End Date
#    And I should see the label Field of Research Codes
#    And I should see the input for Field of Research Codes
#    And I should see the plus button for Field of Research Codes
#    But I should not see more than 1 inputs for Field of Research Codes
#    And I should see the Save button
#    And I should see the Cancel button
#
#  Scenario: Observe the create record Contributors panel
#    Given I have logged in
#    And I have entered create a new record
#    When I click on Contributors
#    Then I should see the label Research Name
#    And I should see the input for Research Name
#    And I should see the label Email Address
#    And I should see the input for Email Address
#    And I should see the Project Role
#    And I should see the input for Project Role
#    And I should see the plus button for Contributors
#    But I should not see more than 1 inputs for Contributors
#    And I should see the Save button
#    And I should see the Cancel button
#
#  Scenario: Observe the create record Submit panel
#    Given I have logged in
#    And I have entered create a new record
#    When I click on Submit
#    Then I should see instructions
#    And I should see the Make the plan active button
#    And I should see the Save button
#    And I should see the Cancel button



