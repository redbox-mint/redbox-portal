var sails = require("sails");
var _ = require("lodash");

global.moment = require("moment");
global.sails = sails;
global._ = _;

/* global before, after */

before(function (done) {
    import("chai").then((chai) => {
        global.chai = chai;
        global.should = chai.should();
        global.expect = chai.expect;

        // Set the timeout so that Sails has enough time to lift.
        this.timeout(60000);
        sails.lift({
            log: {
                level: "verbose",
            },
            hooks: {
                grunt: false,
            },
            models: {
                datastore: "mongodb",
                migrate: "drop",
            },
            datastores: {
                mongodb: {
                    adapter: require('sails-mongo'),
                    url: "mongodb://mongodb:27017/redbox-portal"
                },
                redboxStorage: {
                    adapter: require('sails-mongo'),
                    url: 'mongodb://mongodb:27017/redbox-storage'
                }
            },
            security: {
                csrf: false,
            },
            auth: {
                default: {
                    local: {
                        default: {
                            token: "auth-default-local-default-token",
                        },
                    },
                },
            },
        }, function (err, server) {
            if (err) return done(err);
            done(err, sails);
        });
    });
});

after(function (done) {
    // here you can clear fixtures, etc.
    if (sails && _.isFunction(sails.lower)) {
        sails.lower(done);
    }
});
