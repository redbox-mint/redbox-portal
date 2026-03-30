const service = require("../../../api/services/MongoStorageService");


/* global describe, it, expect */

async function sleep(ms = 300) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

describe("Records", function () {
    [
        {
            // missing 'editPending' does not cause error
            args: {
                record: {
                    metadata: {},
                    "authorization": {
                        "viewRoles": ["Admin", "Librarians"],
                        "editRoles": ["Admin", "Librarians"],
                        "view": ["example-2@redboxresearchdata.com.au"],
                        "edit": [],
                        "viewPending": ["example-1@redboxresearchdata.com.au"]
                    }
                }
            },
            expected: {
                record: {
                    "authorization": {
                        "viewRoles": ["Admin", "Librarians"],
                        "editRoles": ["Admin", "Librarians"],
                        "view": ["example-2@redboxresearchdata.com.au", "example-1@redboxresearchdata.com.au"],
                        "edit": [],
                        "viewPending": [],
                        "editPending": [],
                    }
                }
            },
        },
        {
            // duplicate entries in pending array are transformed to in one entry in real access array
            args: {
                record: {
                    metadata: {},
                    "authorization": {
                        "viewRoles": ["Admin", "Librarians"],
                        "editRoles": ["Admin", "Librarians"],
                        "view": ["example-2@redboxresearchdata.com.au"],
                        "edit": [],
                        "viewPending": [],
                        "editPending": ["example-1@redboxresearchdata.com.au", "example-1@redboxresearchdata.com.au"],
                    }
                }
            },
            expected: {
                record: {
                    "authorization": {
                        "viewRoles": ["Admin", "Librarians"],
                        "editRoles": ["Admin", "Librarians"],
                        "view": ["example-2@redboxresearchdata.com.au"],
                        "edit": ["example-1@redboxresearchdata.com.au"],
                        "viewPending": [],
                        "editPending": [],
                    }
                }
            },
        },
        {
            // same entry in real access array and pending is removed from pending array
            args: {
                record: {
                    metadata: {},
                    "authorization": {
                        "viewRoles": ["Admin", "Librarians"],
                        "editRoles": ["Admin", "Librarians"],
                        "view": ["example-2@redboxresearchdata.com.au"],
                        "edit": ["example-1@redboxresearchdata.com.au"],
                        "viewPending": [],
                        "editPending": ["example-1@redboxresearchdata.com.au"],
                    }
                }
            },
            expected: {
                record: {
                    "authorization": {
                        "viewRoles": ["Admin", "Librarians"],
                        "editRoles": ["Admin", "Librarians"],
                        "view": ["example-2@redboxresearchdata.com.au"],
                        "edit": ["example-1@redboxresearchdata.com.au"],
                        "viewPending": [],
                        "editPending": [],
                    }
                }
            },
        }
    ].forEach(({args, expected}) => {
        it(`should provideUserAccessAndRemovePendingAccess as expected '${JSON.stringify(args)}' = ${JSON.stringify(expected)}`, async function () {

            const brand = 'testing-brand';
            const record = args.record;
            const recordType = "rdmp";

            const response = await service.create(brand, record, recordType);

            expect(response.oid).to.have.lengthOf(32);

            const oid = response.oid;
            const userid = "example-1@redboxresearchdata.com.au";
            const pendingValue = "example-1@redboxresearchdata.com.au";

            service.provideUserAccessAndRemovePendingAccess(oid, userid, pendingValue);
            // TODO: provideUserAccessAndRemovePendingAccess is a sync method, but it calls async methods.
            //      So, wait for a bit for the method to complete.
            //      This means that any errors may not be raised, as they occur in an untracked async function.
            await sleep(5000);

            const result = await service.getMeta(oid);

            expect(result.authorization).to.eql(expected.record.authorization);
        });
    });
});
