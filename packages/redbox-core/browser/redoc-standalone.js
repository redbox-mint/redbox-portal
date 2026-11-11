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
// ReDoc 3 standalone adapter, built with our installed React and sanitizer.
// Adapted from Redocly/redoc src/standalone.tsx at fc5257dc (MIT).
// Webpack exposes this nonce to styled-components when it creates style elements.
__webpack_nonce__ = window.__redboxApiDocsNonce || '';

const React = require('react');
const { createRoot, hydrateRoot } = require('react-dom/client');
const { configure } = require('mobx');
const { HashRouter } = require('react-router');
const { RedocStandalone, RedoclyApiDocsStandalone, prepareApiDocs, logoFromSpec } = require('redoc');
const metadata = require('redoc/package.json');

configure({ useProxies: 'ifavailable' });

const roots = new WeakMap();
const hydrationTimers = new WeakMap();
const hydrationRequests = new WeakMap();

function cancelHydration(element) {
  clearTimeout(hydrationTimers.get(element));
  hydrationTimers.delete(element);
  hydrationRequests.delete(element);
}

function elementOptions(element) {
  const options = {};
  for (const attribute of element.attributes) {
    const name = attribute.name.replace(/-(.)/g, (_, character) => character.toUpperCase());
    options[name] = attribute.name === 'theme' ? JSON.parse(attribute.value) : attribute.value;
  }
  return options;
}

function resolveArgs(specOrUrl, options, element) {
  const { router, basePath, fetchSpec, ...settings } = { ...options, ...elementOptions(element) };
  const isUrl = typeof specOrUrl === 'string' && !specOrUrl.includes('\n') &&
    /^[^\s]+$/.test(specOrUrl.trim()) && !/^[[{]/.test(specOrUrl.trim());
  return {
    router,
    props: {
      spec: isUrl ? undefined : specOrUrl,
      specUrl: isUrl ? specOrUrl.trim() : undefined,
      basePath: basePath || '/',
      options: settings,
    },
  };
}

function wrapInRouter(app, router) {
  return router === 'history' ? app : React.createElement(HashRouter, null, app);
}

function requireElement(element) {
  if (element === null) {
    throw new Error('"element" argument is not provided and <redoc> tag is not found on the page');
  }
  return element;
}

function init(specOrUrl, options = {}, element = document.querySelector('redoc'), callback) {
  requireElement(element);
  cancelHydration(element);
  const { router, props } = resolveArgs(specOrUrl, options, element);
  if (!roots.has(element)) roots.set(element, createRoot(element));
  const root = roots.get(element);
  const render = settings => root.render(wrapInRouter(React.createElement(RedocStandalone, {
    ...settings,
    onLoaded: callback,
  }), router));
  if (options.fetchSpec && props.specUrl) {
    // Our endpoint already emits a JSON document. Redoc's URL loader parses
    // JSON through its YAML resolver and bundles even reference-free documents.
    // Keep the standard resolver for hook documents containing references.
    const request = {};
    hydrationRequests.set(element, request);
    fetch(props.specUrl).then(response => {
      if (!response.ok) throw new Error(`API description request failed: ${response.status}`);
      return response.json();
    }).then(spec => {
      if (hydrationRequests.get(element) !== request) return;
      hydrationRequests.delete(element);
      const hasReferences = value => value && typeof value === 'object' &&
        (typeof value.$ref === 'string' || Object.values(value).some(hasReferences));
      render(hasReferences(spec) ? props : {
        ...props, spec, specUrl: undefined, options: { ...props.options, skipBundle: true },
      });
    }).catch(() => {
      if (hydrationRequests.get(element) !== request) return;
      hydrationRequests.delete(element);
      // Let the renderer show its normal load/parse error, including hook formats.
      render(props);
    });
  } else {
    render(props);
  }
  return root;
}

function destroy(element = document.querySelector('redoc')) {
  if (!element) return;
  cancelHydration(element);
  const root = roots.get(element);
  if (root) {
    root.unmount();
    roots.delete(element);
  }
}

async function hydrate(specOrUrl, options = {}, element = document.querySelector('redoc'), callback) {
  requireElement(element);
  destroy(element);
  const request = {};
  hydrationRequests.set(element, request);
  const { router, props } = resolveArgs(specOrUrl, options, element);
  const prepared = await prepareApiDocs({ ...props, convertedDownload: false });
  if (hydrationRequests.get(element) !== request) return;
  hydrationTimers.set(element, setTimeout(() => {
    hydrationTimers.delete(element);
    hydrationRequests.delete(element);
    const app = wrapInRouter(React.createElement(RedoclyApiDocsStandalone, {
      items: prepared.items,
      store: prepared.store,
      basePath: props.basePath,
      options: prepared.options,
      logo: logoFromSpec(prepared.document),
      telemetryConfig: { disabled: true },
      spec: prepared.document,
      specUrl: props.specUrl,
    }), router);
    if (element.childElementCount === 0) {
      const root = createRoot(element);
      roots.set(element, root);
      root.render(app);
    } else {
      roots.set(element, hydrateRoot(element, app, { onRecoverableError: callback }));
    }
  }, 0));
}

exports.init = init;
exports.destroy = destroy;
exports.hydrate = hydrate;
exports.RedocStandalone = RedocStandalone;
exports.version = metadata.version;

const element = document.querySelector('redoc');
if (element && element.getAttribute('spec-url')) {
  init(element.getAttribute('spec-url'), {}, element);
}
