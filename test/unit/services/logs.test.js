const pino = require('pino');
const pinoTest = require('pino-test');
const {logHelpers} = require('../../../config/log');

// Custom assert function for pino testing
function expectFunc(received, expected, msg){
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
    loggerInstance.blank(msg);
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
        const defaultLogger = logHelpers.createPinoLogger('silly', stream);

        const defaultLoggerMsg = "log message for default logger";
        logAll(defaultLogger, defaultLoggerMsg);

        const expectedItems = [
            {msg: defaultLoggerMsg, level: "trace"},
            {msg: defaultLoggerMsg, level: "debug"},
            {msg: defaultLoggerMsg, level: "info"},
            {msg: defaultLoggerMsg, level: "warn"},
            {msg: defaultLoggerMsg, level: "error"},
            {msg: defaultLoggerMsg, level: "fatal"},
            // {msg: defaultLoggerMsg, level: "silent"},
            {msg: defaultLoggerMsg, level: "silly"},
            {msg: defaultLoggerMsg, level: "verbose"},
            {msg: defaultLoggerMsg, level: "log"},
            {msg: defaultLoggerMsg, level: "crit"},
            // {msg: defaultLoggerMsg, level: "blank"},
        ];
        await pinoTest.consecutive(stream, expectedItems, expectFunc);
    });
    it("should have expected logs for namespace logger with level 'silly'", async function () {
        const stream = pinoTest.sink();
        const defaultLogger = logHelpers.createPinoLogger('crit', stream);

        const prefix = '[testing] ';
        const namespaceLogger = logHelpers.createNamespaceLogger('childlogger', defaultLogger, prefix, 'silly');

        const namespaceLoggerMsg = "log message for namespace logger";
        logAll(namespaceLogger, namespaceLoggerMsg);

        const namespaceMsg = prefix + namespaceLoggerMsg;
        const expectedItems = [
            {msg: namespaceMsg, level: "trace"},
            {msg: namespaceMsg, level: "debug"},
            {msg: namespaceMsg, level: "info"},
            {msg: namespaceMsg, level: "warn"},
            {msg: namespaceMsg, level: "error"},
            {msg: namespaceMsg, level: "fatal"},
            // {msg: namespaceMsg, level: "silent"},
            {msg: namespaceMsg, level: "silly"},
            {msg: namespaceMsg, level: "verbose"},
            {msg: namespaceMsg, level: "log"},
            {msg: namespaceMsg, level: "crit"},
            // {msg: namespaceMsg, level: "blank"},
        ];
        await pinoTest.consecutive(stream, expectedItems, expectFunc);
    });

    it("should have expected values for child logger with level 'verbose' default logger with level 'error'", async function () {
        const stream = pinoTest.sink();
        const defaultLogger = logHelpers.createPinoLogger('error', stream);
        const prefix = '[testing] ';
        const namespaceLogger = logHelpers.createNamespaceLogger('childlogger', defaultLogger, prefix, 'verbose');

        const defaultLoggerMsg = "log message for default logger";
        logAll(defaultLogger, defaultLoggerMsg);

        const namespaceLoggerMsg = "log message for namespace logger";
        logAll(namespaceLogger, namespaceLoggerMsg);

        const defaultMsg = defaultLoggerMsg;
        const namespaceMsg = prefix + namespaceLoggerMsg;
        const expectedItems = [
            // default
            // {msg: defaultMsg, level: "trace"},
            // {msg: defaultMsg, level: "debug"},
            // {msg: defaultMsg, level: "info"},
            // {msg: defaultMsg, level: "warn"},
            {msg: defaultMsg, level: "error"},
            {msg: defaultMsg, level: "fatal"},
            // {msg: defaultMsg, level: "silent"},
            // {msg: defaultMsg, level: "silly"},
            // {msg: defaultMsg, level: "verbose"},
            // {msg: defaultMsg, level: "log"},
            {msg: defaultMsg, level: "crit"},
            // {msg: defaultMsg, level: "blank"},

            // namespace
            {msg: namespaceMsg, level: "trace"},
            {msg: namespaceMsg, level: "debug"},
            {msg: namespaceMsg, level: "info"},
            {msg: namespaceMsg, level: "warn"},
            {msg: namespaceMsg, level: "error"},
            {msg: namespaceMsg, level: "fatal"},
            // {msg: namespaceMsg, level: "silent"},
            // {msg: namespaceMsg, level: "silly"},
            {msg: namespaceMsg, level: "verbose"},
            {msg: namespaceMsg, level: "log"},
            {msg: namespaceMsg, level: "crit"},
            // {msg: namespaceMsg, level: "blank"},
        ];
        await pinoTest.consecutive(stream, expectedItems, expectFunc);
    });

    it("should have expected values for child logger with level 'log' default logger with level 'verbose'", async function () {
        const stream = pinoTest.sink();
        const defaultLogger = logHelpers.createPinoLogger('verbose', stream);
        const prefix = '[my prefix] ';
        const namespaceLogger = logHelpers.createNamespaceLogger('childlogger', defaultLogger, prefix, 'log');

        const defaultLoggerMsg = "log message for default logger";
        logAll(defaultLogger, defaultLoggerMsg);

        const namespaceLoggerMsg = "log message for namespace logger";
        logAll(namespaceLogger, namespaceLoggerMsg);

        const defaultMsg = defaultLoggerMsg;
        const namespaceMsg = prefix + namespaceLoggerMsg;
        const expectedItems = [
            // default
            {msg: defaultMsg, level: "trace"},
            {msg: defaultMsg, level: "debug"},
            {msg: defaultMsg, level: "info"},
            {msg: defaultMsg, level: "warn"},
            {msg: defaultMsg, level: "error"},
            {msg: defaultMsg, level: "fatal"},
            // {msg: defaultMsg, level: "silent"},
            // {msg: defaultMsg, level: "silly"},
            {msg: defaultMsg, level: "verbose"},
            {msg: defaultMsg, level: "log"},
            {msg: defaultMsg, level: "crit"},
            // {msg: defaultMsg, level: "blank"},

            // namespace
            // {msg: namespaceMsg, level: "trace"},
            // {msg: namespaceMsg, level: "debug"},
            {msg: namespaceMsg, level: "info"},
            {msg: namespaceMsg, level: "warn"},
            {msg: namespaceMsg, level: "error"},
            {msg: namespaceMsg, level: "fatal"},
            // {msg: namespaceMsg, level: "silent"},
            // {msg: namespaceMsg, level: "silly"},
            // {msg: namespaceMsg, level: "verbose"},
            {msg: namespaceMsg, level: "log"},
            {msg: namespaceMsg, level: "crit"},
            // {msg: namespaceMsg, level: "blank"},
        ];
        await pinoTest.consecutive(stream, expectedItems, expectFunc);
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
        const defaultLogger = logHelpers.createPinoLogger('silly', stream);

        const namespaceLogger1 = logHelpers.createNamespaceLogger('EmailService', defaultLogger, prefix);
        logAll(defaultLogger, defaultLoggerMsg);
        logAll(namespaceLogger1, namespaceLoggerMsg);
        const expectedItems1 = [
            // default
            {msg: defaultMsg, level: "trace"},
            {msg: defaultMsg, level: "debug"},
            {msg: defaultMsg, level: "info"},
            {msg: defaultMsg, level: "warn"},
            {msg: defaultMsg, level: "error"},
            {msg: defaultMsg, level: "fatal"},
            // {msg: defaultMsg, level: "silent"},
            {msg: defaultMsg, level: "silly"},
            {msg: defaultMsg, level: "verbose"},
            {msg: defaultMsg, level: "log"},
            {msg: defaultMsg, level: "crit"},
            // {msg: defaultMsg, level: "blank"},

            // namespace
            // {msg: namespaceMsg, level: "trace"},
            // {msg: namespaceMsg, level: "debug"},
            {msg: namespaceMsg, level: "info"},
            {msg: namespaceMsg, level: "warn"},
            {msg: namespaceMsg, level: "error"},
            {msg: namespaceMsg, level: "fatal"},
            // {msg: namespaceMsg, level: "silent"},
            // {msg: namespaceMsg, level: "silly"},
            // {msg: namespaceMsg, level: "verbose"},
            {msg: namespaceMsg, level: "log"},
            {msg: namespaceMsg, level: "crit"},
            // {msg: namespaceMsg, level: "blank"},
        ];
        await pinoTest.consecutive(stream, expectedItems1, expectFunc);

        const namespaceLogger2 = logHelpers.createNamespaceLogger('ConfigService', defaultLogger, prefix);
        logAll(defaultLogger, defaultLoggerMsg);
        logAll(namespaceLogger2, namespaceLoggerMsg);
        const expectedItems2 = [
            // default
            {msg: defaultMsg, level: "trace"},
            {msg: defaultMsg, level: "debug"},
            {msg: defaultMsg, level: "info"},
            {msg: defaultMsg, level: "warn"},
            {msg: defaultMsg, level: "error"},
            {msg: defaultMsg, level: "fatal"},
            // {msg: defaultMsg, level: "silent"},
            {msg: defaultMsg, level: "silly"},
            {msg: defaultMsg, level: "verbose"},
            {msg: defaultMsg, level: "log"},
            {msg: defaultMsg, level: "crit"},
            // {msg: defaultMsg, level: "blank"},

            // namespace
            // {msg: namespaceMsg, level: "trace"},
            // {msg: namespaceMsg, level: "debug"},
            // {msg: namespaceMsg, level: "info"},
            // {msg: namespaceMsg, level: "warn"},
            // {msg: namespaceMsg, level: "error"},
            {msg: namespaceMsg, level: "fatal"},
            // {msg: namespaceMsg, level: "silent"},
            // {msg: namespaceMsg, level: "silly"},
            // {msg: namespaceMsg, level: "verbose"},
            // {msg: namespaceMsg, level: "log"},
            {msg: namespaceMsg, level: "crit"},
            // {msg: namespaceMsg, level: "blank"},
        ];
        await pinoTest.consecutive(stream, expectedItems2, expectFunc);
    });
});
