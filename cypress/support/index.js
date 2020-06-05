// ***********************************************************
// This example support/index.js is processed and
// loaded automatically before your test files.
//
// This is a great place to put global configuration and
// behavior that modifies Cypress.
//
// You can change the location of this file or turn off
// automatically serving support files with the
// 'supportFile' configuration option.
//
// You can read more here:
// https://on.cypress.io/configuration
// ***********************************************************

// Whitelist sails sid because cypress will remove all cookies for each test
Cypress.Cookies.defaults({
  whitelist: 'sails.sid'
});
// Import commands.js using ES2015 syntax:
import './commands';
// Alternatively you can use CommonJS syntax:
// require('./commands')

// Next block used to help debugging; to stop a running test if a test fails.
/*
Cypress.on('fail', () => {
  Cypress.stop();
  Cypress.log({message: 'Cypress has failed and stopped'});
});
*/
