// Temporary CI diagnostics. Keep state in memory: logging through Karma after
// completion can rearm its inactivity timer and change the failure being traced.
(function () {
  const karma = window.__karma__;
  const env = jasmine.getEnv();
  const activeQueues = new Map();
  const state = { version: jasmine.version, results: 0, total: null, phases: [] };
  const mark = name => state.phases.push({ name, at: performance.now() });
  window.__redboxFormCompletionTrace = () => ({
    ...state,
    activeQueues: Array.from(activeQueues.values()).slice(-10).map(queue => ({
      index: queue.__traceIndex,
      totalFunctions: queue.queueableFns.length,
      functions: queue.queueableFns.slice(Math.max(0, (queue.__traceIndex || 0) - 1), (queue.__traceIndex || 0) + 2).map(item => ({
        type: item.type,
        fn: String(item.fn).slice(0, 400),
      })),
    })),
  });

  const info = karma.info;
  karma.info = function (result) {
    if (result.total !== undefined) state.total = result.total;
    if (result.event) state.lastEvent = result.event;
    if (result.event === 'suiteDone') state.lastSuite = result.result.fullName;
    return info.apply(this, arguments);
  };
  const result = karma.result;
  karma.result = function (value) {
    state.results += 1;
    state.lastSpec = value.fullName || value.description;
    if (!state.debuggerRequested && state.total && state.results >= Math.max(1, state.total - 200) &&
        typeof window.__redboxTraceArmDebugger === 'function') {
      state.debuggerRequested = true;
      window.__redboxTraceArmDebugger?.('suite-finishing');
    }
    return result.apply(this, arguments);
  };
  const complete = karma.complete;
  karma.complete = function (value) {
    mark('karma.complete:enter');
    state.coverageFiles = Object.keys(value.coverage || {}).length;
    try {
      return complete.apply(this, arguments);
    } finally {
      mark('karma.complete:leave');
    }
  };
  const addReporter = env.addReporter;
  env.addReporter = function (reporter) {
    // Preserve the existing reporter queue and its synchronous callback arity.
    if (reporter.jasmineDone && reporter.jasmineDone.length === 1) {
      const done = reporter.jasmineDone;
      reporter.jasmineDone = function (value) {
        mark('jasmineDone:enter');
        return done.apply(this, arguments);
      };
    }
    return addReporter.apply(this, arguments);
  };
  const execute = jasmine.QueueRunner.prototype.execute;
  jasmine.QueueRunner.prototype.execute = function () {
    const queue = this;
    activeQueues.set(queue, queue);
    const done = queue.onComplete;
    queue.onComplete = function () {
      activeQueues.delete(queue);
      return done.apply(this, arguments);
    };
    return execute.apply(this, arguments);
  };
  const attempt = jasmine.QueueRunner.prototype.attempt;
  jasmine.QueueRunner.prototype.attempt = function (index) {
    this.__traceIndex = index;
    return attempt.apply(this, arguments);
  };
}());
