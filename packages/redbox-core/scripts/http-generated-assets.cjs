'use strict';
// Read authored configuration, not emitted files or executable plugin instances.
const assert = require('node:assert/strict');
const ts = require('typescript');
const webpack = require('webpack');
const escape = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const object = node => {
  assert(node && ts.isObjectLiteralExpression(node), 'Expected literal Webpack configuration object');
  assert(!node.properties.some(ts.isSpreadAssignment), 'Webpack output objects must not hide declarations in spreads');
  return node;
};
const property = (node, name) =>
  node &&
  object(node).properties.find(p => ts.isPropertyAssignment(p) && p.name.getText().replace(/^['"]|['"]$/g, '') === name)
    ?.initializer;
function literal(node, fallback) {
  if (!node) return fallback;
  if (ts.isStringLiteral(node)) return node.text;
  if (ts.isNumericLiteral(node)) return Number(node.text);
  if (node.kind === ts.SyntaxKind.TrueKeyword) return true;
  if (node.kind === ts.SyntaxKind.FalseKeyword) return false;
  throw new TypeError('Webpack output declarations must be literals: ' + node.getText());
}
function fields(node, names) {
  return Object.fromEntries(
    names.filter(name => property(node, name)).map(name => [name, literal(property(node, name))])
  );
}
function extension(rule) {
  const test = property(rule, 'test');
  // Retain a finite extension selector (including optional suffixes such as woff2?).
  // Arbitrary resource selectors conservatively reserve any extension, rather than
  // inferring a finite set from whichever source files happen to exist today.
  const suffix = test && ts.isRegularExpressionLiteral(test) && /^\/\\\.(.+)\$\/[i]?$/.exec(test.text)?.[1];
  if (suffix && /^[A-Za-z0-9|()?:-]+$/.test(suffix)) {
    const pattern = '\\.(?:' + suffix + ')';
    const example = suffix
      .match(/[A-Za-z0-9]+/g)
      ?.find(value => new RegExp('^' + pattern + '$', 'i').test('.' + value));
    assert(example, 'Cannot derive resource extension example: ' + suffix);
    return { pattern, example: '.' + example };
  }
  const mime = literal(property(rule, 'mimetype'), '');
  if (mime === 'image/svg+xml') return { pattern: '\\.svg', example: '.svg' };
  return { pattern: '(?:\\.[A-Za-z0-9]+)?', example: '.bin' };
}

module.exports = function generatedAssets(source, addNamespace, addPattern) {
  let declaration;
  function find(node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(source) === 'webpack') declaration = node.initializer;
    ts.forEachChild(node, find);
  }
  find(source);
  const configs = property(object(declaration), 'config');
  assert(configs && ts.isArrayLiteralExpression(configs), 'Expected literal Webpack config array');
  for (const config of configs.elements) {
    object(config);
    const authored = property(config, 'output');
    const experiments = fields(property(config, 'experiments'), [
      'futureDefaults',
      'css',
      'html',
      'asyncWebAssembly',
      'syncWebAssembly',
    ]);
    // The pinned public normalizer supplies implicit chunks, runtime/worker, CSS,
    // hash and resource names. Never execute the configuration or plugin factories.
    const normalized = webpack.config.getNormalizedWebpackOptions({
      mode: 'production',
      experiments,
      output: fields(authored, [
        'filename',
        'chunkFilename',
        'workerChunkFilename',
        'cssFilename',
        'cssChunkFilename',
        'assetModuleFilename',
        'sourceMapFilename',
        'webassemblyModuleFilename',
        'htmlFilename',
        'htmlChunkFilename',
        'hashDigest',
        'hashDigestLength',
        'hashFunction',
        'module',
      ]),
    });
    webpack.config.applyWebpackOptionsDefaults(normalized);
    const output = normalized.output;
    function emit(template, ext = { pattern: '(?:\\.[A-Za-z0-9]+)?', example: '.bin' }) {
      template = template
        .replace(/^\.\//, '')
        .replace(/\[(?:query|fragment)\]/g, '')
        .split(/[?#]/)[0]
        .replace(/\/$/, '');
      if (!template) return;
      assert(
        !template.startsWith('/') && !template.split('/').some(p => p === '.' || p === '..'),
        'Invalid emitted asset path'
      );
      // A static directory protects every implicit filename below it, including
      // missing chunks, runtime files, CSS url() resources and Angular media.
      if (/^[A-Za-z0-9_.-]+\//.test(template) || !template.includes('[')) return addNamespace(template);
      let pattern = '/',
        example = '/',
        end = 0;
      for (const match of template.matchAll(/\[([a-z]+)(?::(\d+))?\]/gi)) {
        const before = template.slice(end, match.index);
        pattern += escape(before);
        example += before;
        const token = match[1].toLowerCase();
        if (['hash', 'contenthash', 'chunkhash', 'fullhash'].includes(token)) {
          assert(output.hashDigest === 'hex', 'Root-level asset hashes require an explicit supported digest');
          const digestLength = webpack.util
            .createHash(output.hashFunction)
            .update('namespace declaration')
            .digest('hex').length;
          const length = Math.min(Number(match[2] ?? output.hashDigestLength), output.hashDigestLength, digestLength);
          assert(Number.isInteger(length) && length > 0 && length <= 128, 'Invalid output hash length');
          pattern += '[a-f0-9]{' + length + '}';
          example += 'a'.repeat(length);
        } else if (token === 'ext') {
          pattern += ext.pattern;
          example += ext.example;
        } else if (['name', 'id', 'runtime', 'base', 'file', 'folder'].includes(token)) {
          pattern += '[A-Za-z0-9_.-]+(?:/[A-Za-z0-9_.-]+)*';
          example += 'chunk';
        } else if (token === 'path') {
          pattern += '(?:[A-Za-z0-9_.-]+/)*';
        } else throw new TypeError('Unsupported root output template token: ' + token);
        end = match.index + match[0].length;
      }
      pattern += escape(template.slice(end));
      example += template.slice(end);
      assert(!pattern.includes('\\['), 'Unresolved output template: ' + template);
      addPattern({ path: '/' + template, pattern, example, kind: 'pattern' });
    }
    const scripts = [
      output.filename,
      output.chunkFilename,
      output.workerChunkFilename,
      output.cssFilename,
      output.cssChunkFilename,
    ];
    function code(template) {
      emit(template);
      emit(output.sourceMapFilename.replace('[file]', template));
    }
    for (const template of scripts) code(template);
    if (normalized.experiments.html) for (const key of ['htmlFilename', 'htmlChunkFilename']) code(output[key]);
    if (normalized.experiments.asyncWebAssembly || normalized.experiments.syncWebAssembly)
      code(output.webassemblyModuleFilename);
    const module = property(config, 'module');
    const generators = property(module, 'generator');
    const resourceTypes = new Set(['asset', 'asset/resource', 'asset/webmanifest']);
    function resource(type, generator, ext) {
      const defaults = property(generators, type) ?? property(generators, 'asset');
      const outputPath = literal(property(generator, 'outputPath'), literal(property(defaults, 'outputPath'), ''));
      assert(
        !outputPath.startsWith('/') && !outputPath.split('/').some(part => part === '..'),
        'Invalid resource outputPath'
      );
      const filename = literal(
        property(generator, 'filename'),
        literal(property(defaults, 'filename'), output.assetModuleFilename)
      );
      emit((outputPath ? outputPath.replace(/\/$/, '') + '/' : '') + filename, ext);
    }
    // URL imports (including CSS url()) have implicit resource rules even when
    // no authored rule names their extension. Never infer this set from local files.
    const implicitTypes = new Set();
    function implicitRules(rules) {
      for (const rule of rules ?? []) {
        if (resourceTypes.has(rule.type)) implicitTypes.add(rule.type);
        implicitRules(rule.rules);
        implicitRules(rule.oneOf);
      }
    }
    implicitRules(normalized.module.defaultRules);
    for (const type of implicitTypes) resource(type);
    function rules(array, inherited = {}) {
      if (!array) return;
      assert(ts.isArrayLiteralExpression(array), 'Expected literal Webpack rules');
      for (const rule of array.elements) {
        object(rule);
        const type = literal(property(rule, 'type'), inherited.type);
        const generator = property(rule, 'generator') ?? inherited.generator;
        if (resourceTypes.has(type) && (generator || !implicitTypes.has(type)))
          resource(type, generator, extension(rule));
        for (const key of ['rules', 'oneOf']) rules(property(rule, key), { type, generator });
      }
    }
    rules(property(module, 'rules'));
    // Plugin output options (including extraction chunks) are read as syntax only.
    function plugins(node) {
      if (ts.isNewExpression(node) && node.expression.getText(source) === 'MiniCssExtractPlugin') {
        const options = node.arguments?.[0];
        const filename = literal(property(options, 'filename'), output.cssFilename);
        const chunk = literal(property(options, 'chunkFilename'), output.cssChunkFilename);
        for (const template of [filename, chunk]) code(template);
      }
      if (ts.isPropertyAssignment(node) && node.name.getText(source) === 'to') emit(literal(node.initializer));
      ts.forEachChild(node, plugins);
    }
    plugins(config);
  }
};
