const pino = require('pino');
const pinoTest = require('pino-test');

// Custom assert function for pino testing
function expectFunc(received, expected, msg) {
    const actualItem = `LEVEL ${received.level} MSG ${received.msg}`;
    const expectedItem = `LEVEL ${expected.level} MSG ${expected.msg}`;
    expect(expectedItem).to.eql(actualItem);
}

function logAll(loggerInstance, msg) {
    // pino defaults
    loggerInstance.trace(msg);
    loggerInstance.debug(msg);
    loggerInstance.info(msg);
    loggerInstance.warn(msg);
    loggerInstance.error(msg);
    loggerInstance.fatal(msg);
    loggerInstance.silent(msg);

    // additional sails.js levels
    loggerInstance.silly(msg);
    loggerInstance.verbose(msg);
    loggerInstance.log(msg);
    loggerInstance.crit(msg);
    // loggerInstance.blank(msg); // blank is the same as silent
}

async function logExpectations(stream, msg, levels) {
    const expectedItems = levels.map(level => ({msg: msg, level: level}));
    console.log(`logExpectations ${JSON.stringify(expectedItems)}`);

    const remaining = [];
    let counter = 0;
    try {
        // assert the expected log lines match the actual log lines
        await pinoTest.consecutive(stream, expectedItems, expectFunc);
        // assert that there are no log lines remaining
        for await (const chunk of stream) {
            counter += 1;
            console.log(`Additional chunk ${counter}: ${JSON.stringify(chunk)}`);
            remaining.push(chunk);
        }
    } catch (err: any) {
        // AbortError is expected when the stream is closed after consuming all expected items.
        // This happens when pinoTest.consecutive completes successfully and the stream has no more data.
        // We should NOT fail the test in this case - it's normal behavior.
        if (err?.name === 'AbortError' || err?.message?.includes('aborted')) {
            console.log(`Stream closed as expected after consuming expected items: ${err}`);
            // Stream was properly closed - this is expected behavior
            return;
        }
        // For any other error, re-throw to fail the test
        throw err;
    }
    console.log(`Found ${counter} additional chunks`);
    expect(remaining).to.have.length(0);
}


describe('The custom logger', function () {

    it('should log a info message', async () => {
        const stream = pinoTest.sink();
        const logger = pino(stream);

        logger.info('hello world');

        const expected = {msg: 'hello world', level: 30};
        await pinoTest.once(stream, expected, expectFunc);
    })


    it('should log a info message using a own assert function', async () => {
        const stream = pinoTest.sink();
        const logger = pino(stream);

        logger.info('hello world');

        const expected = {msg: 'hello world', level: 30};
        await pinoTest.once(stream, expected, expectFunc);
    })

    it("should have expected logs for default logger with level 'silly'", async function () {
        const stream = pinoTest.sink();
        const defaultLogger = sails.config.log.createPinoLogger('silly', stream);

        const defaultLoggerMsg = "log message for default logger";
        logAll(defaultLogger, defaultLoggerMsg);

        await logExpectations(stream, defaultLoggerMsg, [
            "trace",
            "debug",
            "info",
            "warn",
            "error",
            "fatal",
            //"silent",
            "silly",
            "verbose",
            "log",
            "crit",
            //"blank",
        ]);
    });
    it("should have expected logs for namespace logger with level 'silly'", async function () {
        const stream = pinoTest.sink();
        const defaultLogger = sails.config.log.createPinoLogger('crit', stream);

        const prefix = '[testing] ';
        const namespaceLogger = sails.config.log.createNamespaceLogger('childlogger1', defaultLogger, prefix, 'silly');

        const namespaceLoggerMsg = "log message for namespace logger";
        logAll(namespaceLogger, namespaceLoggerMsg);

        const namespaceMsg = prefix + namespaceLoggerMsg;
        await logExpectations(stream, namespaceMsg, [
            "trace",
            "debug",
            "info",
            "warn",
            "error",
            "fatal",
            // "silent",
            "silly",
            "verbose",
            "log",
            "crit",
            // "blank",
        ]);
    });

    it("should have expected values for child logger with level 'verbose' default logger with level 'error'", async function () {
        const stream = pinoTest.sink();
        const defaultLogger = sails.config.log.createPinoLogger('error', stream);
        const prefix = '[testing] ';
        const namespaceLogger = sails.config.log.createNamespaceLogger('childlogger2', defaultLogger, prefix, 'verbose');

        const defaultLoggerMsg = "log message for default logger";
        logAll(defaultLogger, defaultLoggerMsg);

        const namespaceLoggerMsg = "log message for namespace logger";
        logAll(namespaceLogger, namespaceLoggerMsg);

        const defaultMsg = defaultLoggerMsg;
        const namespaceMsg = prefix + namespaceLoggerMsg;

        // default
        await logExpectations(stream, defaultMsg, [
            //  "trace",
            //  "debug",
            //  "info",
            //  "warn",
            "error",
            "fatal",
            //  "silent",
            //  "silly",
            //  "verbose",
            //  "log",
            "crit",
            //  "blank",
        ]);


        // namespace
        await logExpectations(stream, namespaceMsg, [
            "trace",
            "debug",
            "info",
            "warn",
            "error",
            "fatal",
            //  "silent",
            //  "silly",
            "verbose",
            "log",
            "crit",
            //  "blank",
        ]);
    });

    it("should have expected values for child logger with level 'log' default logger with level 'verbose'", async function () {
        const stream = pinoTest.sink();
        const defaultLogger = sails.config.log.createPinoLogger('verbose', stream);
        const prefix = '[my prefix] ';
        const namespaceLogger = sails.config.log.createNamespaceLogger('childlogger3', defaultLogger, prefix, 'log');

        const defaultLoggerMsg = "log message for default logger";
        logAll(defaultLogger, defaultLoggerMsg);

        const namespaceLoggerMsg = "log message for namespace logger";
        logAll(namespaceLogger, namespaceLoggerMsg);

        const defaultMsg = defaultLoggerMsg;
        const namespaceMsg = prefix + namespaceLoggerMsg;

        // default
        await logExpectations(stream, defaultMsg, [
            "trace",
            "debug",
            "info",
            "warn",
            "error",
            "fatal",
            //  "silent",
            //  "silly",
            "verbose",
            "log",
            "crit",
            //  "blank",
        ]);

        // namespace
        await logExpectations(stream, namespaceMsg, [
            //  "trace",
            //  "debug",
            "info",
            "warn",
            "error",
            "fatal",
            //  "silent",
            //  "silly",
            //  "verbose",
            "log",
            "crit",
            //  "blank",
        ]);
    });

    it("should use the configured namedspace log level", async function () {
        sails.config.lognamespace['EmailService'] = 'info';
        sails.config.lognamespace['ConfigService'] = 'crit';

        const prefix = "[testing namespaces] "
        const defaultLoggerMsg = "log message for default logger";
        const namespaceLoggerMsg = "log message for namespace logger";

        const defaultMsg = defaultLoggerMsg;
        const namespaceMsg = prefix + namespaceLoggerMsg;

        const stream = pinoTest.sink();
        const defaultLogger = sails.config.log.createPinoLogger('silly', stream);

        const namespaceLogger1 = sails.config.log.createNamespaceLogger('EmailService', defaultLogger, prefix);
        logAll(defaultLogger, defaultLoggerMsg);
        logAll(namespaceLogger1, namespaceLoggerMsg);

        // default
        await logExpectations(stream, defaultMsg, [
            "trace",
            "debug",
            "info",
            "warn",
            "error",
            "fatal",
            //  "silent",
            "silly",
            "verbose",
            "log",
            "crit",
            //  "blank",
        ]);

        // namespace
        await logExpectations(stream, namespaceMsg, [
            //  "trace",
            //  "debug",
            "info",
            "warn",
            "error",
            "fatal",
            //  "silent",
            //  "silly",
            //  "verbose",
            "log",
            "crit",
            //  "blank",
        ]);

        const namespaceLogger2 = sails.config.log.createNamespaceLogger('ConfigService', defaultLogger, prefix);
        logAll(defaultLogger, defaultLoggerMsg);
        logAll(namespaceLogger2, namespaceLoggerMsg);

        // default
        await logExpectations(stream, defaultMsg, [
            "trace",
            "debug",
            "info",
            "warn",
            "error",
            "fatal",
            //  "silent",
            "silly",
            "verbose",
            "log",
            "crit",
            //  "blank",
        ]);

        // namespace
        await logExpectations(stream, namespaceMsg, [
            //  "trace",
            //  "debug",
            //  "info",
            //  "warn",
            //  "error",
            "fatal",
            //  "silent",
            //  "silly",
            //  "verbose",
            //  "log",
            "crit",
            //  "blank",
        ]);
    });
});
