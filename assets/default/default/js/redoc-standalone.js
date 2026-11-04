/*!
The MIT License (MIT)

Copyright (c) 2015-present, Rebilly, Inc.

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
*/
// ReDoc 2's standalone entry, built locally so its dependencies receive our pins.
// Adapted from https://github.com/Redocly/redoc/blob/v2.5.3/src/standalone.tsx (MIT).
const React = require('react');
const { createRoot, hydrateRoot } = require('react-dom/client');
const { configure } = require('mobx');
const { Redoc, RedocStandalone, AppStore } = require('redoc');
const metadata = require('redoc/package.json');

configure({ useProxies: 'ifavailable' });

function elementOptions(element) {
  const options = {};
  for (const attribute of element.attributes) {
    const name = attribute.name.replace(/-(.)/g, (_, character) => character.toUpperCase());
    options[name] = attribute.name === 'theme' ? JSON.parse(attribute.value) : attribute.value;
  }
  return options;
}

function init(specOrUrl, options = {}, element = document.querySelector('redoc'), callback) {
  if (element === null) {
    throw new Error('"element" argument is not provided and <redoc> tag is not found on the page');
  }
  createRoot(element).render(React.createElement(RedocStandalone, {
    spec: typeof specOrUrl === 'object' ? specOrUrl : undefined,
    specUrl: typeof specOrUrl === 'string' ? specOrUrl : undefined,
    options: { ...options, ...elementOptions(element) },
    onLoaded: callback,
  }, ['Loading...']));
}

function destroy(element = document.querySelector('redoc')) {
  if (element) createRoot(element).unmount();
}

function hydrate(state, element = document.querySelector('redoc'), callback) {
  const store = AppStore.fromJS(state);
  setTimeout(() => {
    hydrateRoot(element, React.createElement(Redoc, { store }), { onRecoverableError: callback });
  }, 0);
}

module.exports = { init, destroy, hydrate, Redoc, AppStore, version: metadata.version, revision: '1b2591e' };

const element = document.querySelector('redoc');
if (element && element.getAttribute('spec-url')) {
  init(element.getAttribute('spec-url'), {}, element);
}
