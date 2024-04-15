describe('The RDMPService', function () {
    describe('duplicate email addresses', function () {
        const emailAddress = 'Admin@redboxresearchdata.com.au';
        const userDetails = {
            type: 'local',
            name: 'admin2',
            username: 'admin2',
            password: 'rbadmin2',
            email: emailAddress
        };
        before(function () {
            // add another user with the default email address
            return User.create(userDetails);
        });
        after(function () {
            // remove the user added in `before`
            return User.destroyOne({name:'admin2'});
        });
        it('assignPermissions should fail with RBValidationError', function (done) {
            var oid = "assignPermissions-RBValidationError";
            var record = {
                metaMetadata: {},
                workflow: {},
                authorization: {
                    edit: [],
                    view: [],
                    editRoles: ['Admin'],
                    viewRoles: ['Admin'],
                    editPending: [],
                    viewPending: []
                },
                metadata: {
                    contributor_ci: {
                        "text_full_name": "AAAA AAAA",
                        "full_name_honorific": " AAAA AAAA",
                        "email": [emailAddress],
                        "orcid": ""
                    }
                }
            };
            const options = {
                "emailProperty": "email",
                "editContributorProperties": [
                    "metadata.contributor_ci",
                    "metadata.contributor_data_manager",
                    "metadata.dataowner_email"
                ],
                "viewContributorProperties": [
                    "metadata.contributor_ci",
                    "metadata.contributor_data_manager",
                    "metadata.contributor_supervisor",
                    "metadata.contributors"
                ],
                "recordCreatorPermissions": "view&edit"
            };
            RDMPService.assignPermissions(oid, record, options).subscribe((record) => {
                console.log(`Record assigned permissions ${JSON.stringify(record)}.`);
                User.count().then((count) => {
                    expect(count).equal(2);
                    done();
                });
                // expect(record).equal(false);
            });
        });

        it('complexAssignPermissions should fail with RBValidationError', function (done) {
            var oid = "complexAssignPermissions-RBValidationError";
            var record = {
                metaMetadata: {},
                workflow: {},
                authorization: {
                    edit: [],
                    view: [],
                    editRoles: ['Admin'],
                    viewRoles: ['Admin'],
                    editPending: [],
                    viewPending: []
                },
                metadata: {
                    contributor_ci: {
                        "text_full_name": "AAAA AAAA",
                        "full_name_honorific": " AAAA AAAA",
                        "email": [emailAddress],
                        "orcid": ""
                    }
                }
            };
            const options = {
                "emailProperty": "email",
                "editPermissionRule": "<%= email != '' %>",
                "viewPermissionRule": "<%= email != '' %>",
                "userProperties": [
                    "metadata.contributor_ci",
                ],
                "recordCreatorPermissions": "view&edit"
            };
            RDMPService.complexAssignPermissions(oid, record, options).subscribe((record) => {
                console.log(`Record complex assigned permissions ${JSON.stringify(record)}.`);
                User.count().then((count) => {
                    expect(count).equal(2);
                    done();
                });
                // expect(record).equal(false);
            });
        });
    });
});