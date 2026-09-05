'use strict';

const sails = require('sails');

async function lift(config) {
  await new Promise((resolve, reject) => {
    sails.lift(config, error => (error ? reject(error) : resolve()));
  });
}

async function lower() {
  await new Promise((resolve, reject) => {
    sails.lower(error => (error ? reject(error) : resolve()));
  });
}

module.exports = { lift, lower };
