describe('The RDMPService', function () {
    const userAdminDefault = {
        type: 'local',
        name: 'admin',
        username: 'admin',
        password: 'rbadmin',
        email: "admin@redboxresearchdata.com.au"
    };
    const userAdmin1 = {
        type: 'local',
        name: 'admin1',
        username: 'admin1',
        password: 'rbadmin1',
        email: "admin1@redboxresearchdata.com.au"
    };
    const userNotInDB1 = {
        type: 'local',
        name: 'standard1',
        username: 'standard1',
        password: 'rbstandard1',
        email: "standard1@redboxresearchdata.com.au"
    };
    const userNotInDB2 = {
        type: 'local',
        name: 'standard2',
        username: 'standard2',
        password: 'rbstandard2',
        email: "standard2@redboxresearchdata.com.au"
    };
    before(function () {
        // add another user
        return User.create(userAdmin1);
    });
    after(function () {
        // remove the users added in `before`
        return User.destroyOne({ name: userAdmin1.name });
    });
    describe('assign permissions as expected', function () {
        it('assignPermissions with no viewers or editors', function (done) {
            const oid = "assignPermissions-no-viewers-no-editors";
            const record = {
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
                        "email": [userAdminDefault.email],
                        "orcid": ""
                    }
                }
            };
            const options = {
                "emailProperty": "email",
                "editContributorProperties": [
                    "metadata.contributor_data_manager",
                    "metadata.dataowner_email"
                ],
                "viewContributorProperties": [
                    "metadata.contributor_data_manager",
                    "metadata.contributor_supervisor",
                    "metadata.contributors"
                ],
                "recordCreatorPermissions": "view&edit"
            };
            RDMPService.assignPermissions(oid, record, options).subscribe(function (record) {
                expect(record.authorization.edit).to.be.empty;
                expect(record.authorization.view).to.be.empty;
                expect(record.authorization.editPending).to.be.empty;
                expect(record.authorization.viewPending).to.be.empty;
                User.count().then(function (count) {
                    expect(count).equal(2);
                    done();
                });
            });
        });
        it('assignPermissions with only viewers', function (done) {
            const oid = "assignPermissions-has-viewers-no-editors";
            const record = {
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
                        "email": [userAdminDefault.email],
                        "orcid": ""
                    }
                }
            };
            const options = {
                "emailProperty": "email",
                "editContributorProperties": [
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
            RDMPService.assignPermissions(oid, record, options).subscribe(function (record) {
                expect(record.authorization.edit).to.be.empty;
                expect(record.authorization.view).eql([userAdminDefault.name]);
                expect(record.authorization.editPending).to.be.empty;
                expect(record.authorization.viewPending).to.be.empty;
                User.count().then(function (count) {
                    expect(count).equal(2);
                    done();
                });
            });
        });
        it('assignPermissions with only editors', function (done) {
            const oid = "assignPermissions-no-viewers-has-editors";
            const record = {
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
                        "email": [userAdminDefault.email],
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
                    "metadata.contributor_data_manager",
                    "metadata.contributor_supervisor",
                    "metadata.contributors"
                ],
                "recordCreatorPermissions": "view&edit"
            };
            RDMPService.assignPermissions(oid, record, options).subscribe(function (record) {
                expect(record.authorization.edit).eql([userAdminDefault.name]);
                expect(record.authorization.view).to.be.empty;
                expect(record.authorization.editPending).to.be.empty;
                expect(record.authorization.viewPending).to.be.empty;
                User.count().then(function (count) {
                    expect(count).equal(2);
                    done();
                });
            });
        });
    });
    describe('complex assign permissions as expected', function () {
        it('complexAssignPermissions with no viewers or editors', function (done) {
            const oid = "complexAssignPermissions-no-viewers-no-editors";
            const record = {
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
                    contributor_dmp_permissions: [
                        {
                            "text_full_name": "AAAA AAAA",
                            "full_name_honorific": "AAAA AAAA",
                            "email": [userAdminDefault.email],
                            "role": "View&Edit"
                        },
                        {
                            "text_full_name": "BBBB BBBB",
                            "full_name_honorific": "",
                            "email": [userAdmin1.email],
                            "role": "View"
                        }
                    ],
                    contributor_ci: {
                        "text_full_name": "AAAA AAAA",
                        "full_name_honorific": " AAAA AAAA",
                        "email": [userAdminDefault.email],
                        "orcid": "",
                        "role": "",
                    }
                }
            };
            const options = {
                "emailProperty": "email",
                "userProperties": [
                    "metadata.contributor_ci"
                ],
                "editPermissionRule": "<%= role == 'View&Edit' %>",
                "viewPermissionRule": "<%= role == 'View&Edit' ||  role == 'View' %>",
                "recordCreatorPermissions": "view&edit"
            };
            RDMPService.complexAssignPermissions(oid, record, options).subscribe(function (record) {
                expect(record.authorization.edit).to.be.empty;
                expect(record.authorization.view).to.be.empty;
                expect(record.authorization.editPending).to.be.empty;
                expect(record.authorization.viewPending).to.be.empty;
                User.count().then(function (count) {
                    expect(count).equal(2);
                    done();
                });
            });
        });
        it('complexAssignPermissions with only editors', function (done) {
            const oid = "complexAssignPermissions-no-viewers-has-editors";
            const record = {
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
                    contributor_dmp_permissions: [
                        {
                            "text_full_name": "AAAA AAAA",
                            "full_name_honorific": "AAAA AAAA",
                            "email": [userAdminDefault.email],
                            "role": "View&Edit"
                        }
                    ]
                }
            };
            const options = {
                "emailProperty": "email",
                "userProperties": [
                    "metadata.contributor_dmp_permissions"
                ],
                "editPermissionRule": "<%= role == 'View&Edit' %>",
                "viewPermissionRule": "<%= role == 'View' %>",
                "recordCreatorPermissions": "view&edit"
            };
            RDMPService.complexAssignPermissions(oid, record, options).subscribe(function (record) {
                expect(record.authorization.edit).to.eql([userAdminDefault.name]);
                expect(record.authorization.view).to.be.empty;
                expect(record.authorization.editPending).to.be.empty;
                expect(record.authorization.viewPending).to.be.empty;
                User.count().then(function (count) {
                    expect(count).equal(2);
                    done();
                });
            });
        });
        it('complexAssignPermissions with only viewers', function (done) {
            const oid = "complexAssignPermissions-has-viewers-no-editors";
            const record = {
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
                    contributor_dmp_permissions: [
                        {
                            "text_full_name": "BBBB BBBB",
                            "full_name_honorific": "",
                            "email": [userAdmin1.email],
                            "role": "View"
                        }
                    ]
                }
            };
            const options = {
                "emailProperty": "email",
                "userProperties": [
                    "metadata.contributor_dmp_permissions"
                ],
                "editPermissionRule": "<%= role == 'View&Edit' %>",
                "viewPermissionRule": "<%= role == 'View&Edit' ||  role == 'View' %>",
                "recordCreatorPermissions": "view&edit"
            };
            RDMPService.complexAssignPermissions(oid, record, options).subscribe(function (record) {
                expect(record.authorization.edit).to.be.empty;
                expect(record.authorization.view).eql([userAdmin1.name]);
                expect(record.authorization.editPending).to.be.empty;
                expect(record.authorization.viewPending).to.be.empty;
                User.count().then(function (count) {
                    expect(count).equal(2);
                    done();
                });
            });
        });
        it('complexAssignPermissions to expected users', function (done) {
            const oid = "complexAssignPermissions-to-expected-users";
            const record = {
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
                    contributor_dmp_permissions: [
                        {
                            "text_full_name": "AAAA AAAA",
                            "full_name_honorific": "AAAA AAAA",
                            "email": [userAdminDefault.email],
                            "role": "View&Edit"
                        },
                        {
                            "text_full_name": "BBBB BBBB",
                            "full_name_honorific": "",
                            "email": [userAdmin1.email],
                            "role": "View"
                        },
                        {
                            "text_full_name": "CCCC CCCC",
                            "full_name_honorific": "",
                            "email": [userNotInDB1.email],
                            "role": "View&Edit"
                        },
                        {
                            "text_full_name": "DDDD DDDD",
                            "full_name_honorific": "",
                            "email": [userNotInDB2.email],
                            "role": "View"
                        }
                    ]
                }
            };
            const options = {
                "emailProperty": "email",
                "userProperties": [
                    "metadata.contributor_dmp_permissions"
                ],
                "editPermissionRule": "<%= role == 'View&Edit' %>",
                "viewPermissionRule": "<%= role == 'View&Edit' ||  role == 'View' %>",
                "recordCreatorPermissions": "view&edit"
            };
            RDMPService.complexAssignPermissions(oid, record, options).subscribe(function (record) {
                expect(record.authorization.edit).eql([userAdminDefault.name]);
                expect(record.authorization.view).eql([userAdminDefault.name, userAdmin1.name]);
                expect(record.authorization.editPending).eql([userNotInDB1.email]);
                expect(record.authorization.viewPending).eql([userNotInDB1.email, userNotInDB2.email]);
                User.count().then(function (count) {
                    expect(count).equal(2);
                    done();
                });
            });
        });
    });
});
