// ***********************************************
// This example commands.js shows you how to
// create various custom commands and overwrite
// existing commands.
//
// For more comprehensive examples of custom
// commands please read more here:
// https://on.cypress.io/custom-commands
// ***********************************************

Cypress.Commands.add("login", (username, password) => {
    cy.request({
        method: 'POST',
        url: `/user/login_local`,
        body: {
          username,
          password
        }
    }).then((res) => {
        console.log(res);
    });
});

Cypress.Commands.add('loginByCSRF', (csrfToken, username, password) => {
    cy.request({
        method: 'POST',
        url: `/user/login_local`,
        failOnStatusCode: false, // dont fail so we can make assertions
        form: true, // we are submitting a regular form body
        body: {
            username,
            password,
            _csrf: csrfToken, // insert this as part of form body
        },
    });
});
Cypress.Commands.add('paste', {
    prevSubject: true,
    element: true
}, ($element, text) => {

    const subString = text.substr(0, text.length - 1);
    const lastChar = text.slice(-1);

    $element.text(subString);
    $element.val(subString);
    cy.get($element).type(lastChar);
});

let LOCAL_STORAGE_MEMORY = {};

Cypress.Commands.add("saveLocalStorage", () => {
    Object.keys(localStorage).forEach(key => {
        LOCAL_STORAGE_MEMORY[key] = localStorage[key];
    });
});

Cypress.Commands.add("restoreLocalStorage", () => {
    Object.keys(LOCAL_STORAGE_MEMORY).forEach(key => {
        localStorage.setItem(key, LOCAL_STORAGE_MEMORY[key]);
    });
});
