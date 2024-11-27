describe('The EmailService', function () {

    before(function (done) {
        done();
    });

    it('should build a template', function (done) {
        const data = {
            oid: "record-identifier",
            name: "Record Name",
            record: {
                metadata: {
                    title: "Record Title",
                    dataowner_name: "Data Owner Name",
                    contributor_ci: {
                        text_full_name: "Contributor CI Name",
                    },
                    contributor_data_manager: {
                        text_full_name: "Contributor Data Manager Name",
                    }
                }
            }
        };
        const renderer = EmailService.buildFromTemplate("transferOwnerTo", data);
        renderer.subscribe(buildResult => {
            const rendered = buildResult['body'];
            expect(rendered).to.contain(`Dear ${data.name},`);
            expect(rendered).to.contain(`for project, ${data.record.metadata.title}, has been`);
            expect(rendered).to.contain(`to the custody of ${data.record.metadata.dataowner_name}.`);
            expect(rendered).to.contain(`default/rdmp/record/view/${data.oid}">here`);
            expect(rendered).to.contain(`investigator:</strong> ${data.record.metadata.contributor_ci.text_full_name}</br>`);
            expect(rendered).to.contain(`: ${data.record.metadata.contributor_data_manager.text_full_name}</p>`);

            done();
        });
    });

    it('should run a template', function (done) {
        const data = {
            imports: {
                oid: "record-identifier",
            }
        };
        const template = "Testing a template <%= oid %>";

        const rendered = EmailService.runTemplate(template, data);

        expect(rendered).to.eql(`Testing a template ${data.imports.oid}`);

        done();
    });

    it('should send a message', function (done) {
        const to = 'info@redboxresearchdata.com.au';
        const body = "Testing email body";
        const subject = "test subject";
        const from =  'noreply@redboxresearchdata.com.au';
        const format =  "html";
        const cc =  'info@redboxresearchdata.com.au';
        const bcc =  'support@redboxresearchdata.com.au';
        const replyTo =  'replyTo@redboxresearchdata.com.au';

        const sendResponse = EmailService.sendMessage(to, body, subject, from, format, cc, bcc, {replyTo: replyTo});

        sendResponse.subscribe(sendResult => {
            expect(sendResult['success']).to.eql(true);
            expect(sendResult['msg']).to.contain("Email sent successfully.");

            done();
        });
    });

    describe('evaluating email properties', function () {
        it('should deal with nil arguments', function (done) {
            const options = null;
            const result = EmailService.evaluateProperties(options);

            expect(result).to.eql({
                format: "", formatRendered: "",
                from: "", fromRendered: "",
                to: "", toRendered: "",
                cc: "", ccRendered: "",
                bcc: "", bccRendered: "",
                subject: "", subjectRendered: "",
                template: null, templateRendered: null,
            });

            done();
        });
        it('should render values', function (done) {
            const options = {
                to: "<%= record.metadata.contributor_ci.email %>,<%= _.isEmpty(record.metadata.contributors_investigators) ? '' : _.join(_.map(record.metadata.contributors_investigators, (contInvestigators)=>{ return contInvestigators.email; }), ',') %>,<%= _.isEmpty(record.metadata.contributor_dmp_administrators) ? '' : _.join(_.map(record.metadata.contributor_dmp_administrators, (contAdministrators)=>{ return contAdministrators.email; }), ',') %>",
                from: 'noreply@redboxresearchdata.com.au',
                cc: 'info@redboxresearchdata.com.au',
                bcc: 'support@redboxresearchdata.com.au',
                subject: "Research Data Management Plan <%= _.get(record.metadata,'rdmp-id','') %> has been created",
                template: "test",
                format: "html"
            };
            const config = {};
            const templateData = {
                record: {
                    metadata: {
                        "rdmp-id": "rdmp-identifier",
                        contributor_ci: {
                            email: "contributor_ci@redboxresearchdata.com.au",
                        },
                        contributors_investigators: [
                            {
                                email: "contributors_investigators1@redboxresearchdata.com.au",
                            },
                            {
                                email: "contributors_investigators2@redboxresearchdata.com.au"
                            },
                        ]
                    }
                },
                data: "the test data",
            };
            const result = EmailService.evaluateProperties(options, config, templateData);


            result.templateRendered.subscribe(buildResult => {
                expect(result.format).to.eql(options.format);
                expect(result.formatRendered).to.eql(options.format);
                expect(result.from).to.eql(options.from);
                expect(result.fromRendered).to.eql(options.from);
                expect(result.to).to.eql(options.to);
                expect(result.toRendered).to.eql("contributor_ci@redboxresearchdata.com.au,contributors_investigators1@redboxresearchdata.com.au,contributors_investigators2@redboxresearchdata.com.au,");
                expect(result.cc).to.eql(options.cc);
                expect(result.ccRendered).to.eql(options.cc);
                expect(result.bcc).to.eql(options.bcc);
                expect(result.bccRendered).to.eql(options.bcc);
                expect(result.subject).to.eql(options.subject);
                expect(result.subjectRendered).to.eql("Research Data Management Plan rdmp-identifier has been created");
                expect(result.template).to.eql(options.template);
                expect(buildResult['body']).to.eql(`<h1>Hello!</h1>
<p>This is a test email from redbox portal</p>
<p>Data: the test data</p>`);

                done();
            });
        });
        it('should render default values', function (done) {
            const options = {
                to: "<%= record.metadata.contributor_ci.email %>,<%= _.isEmpty(record.metadata.contributors_investigators) ? '' : _.join(_.map(record.metadata.contributors_investigators, (contInvestigators)=>{ return contInvestigators.email; }), ',') %>,<%= _.isEmpty(record.metadata.contributor_dmp_administrators) ? '' : _.join(_.map(record.metadata.contributor_dmp_administrators, (contAdministrators)=>{ return contAdministrators.email; }), ',') %>",
                template: "test",
                format: "html"
            };
            const config = {};
            const templateData = {
                record: {
                    metadata: {
                        "rdmp-id": "rdmp-identifier",
                        contributor_ci: {
                            email: "contributor_ci@redboxresearchdata.com.au",
                        },
                        contributors_investigators: [
                            {
                                email: "contributors_investigators1@redboxresearchdata.com.au",
                            },
                            {
                                email: "contributors_investigators2@redboxresearchdata.com.au"
                            },
                        ]
                    }
                },
                data: "the test data",
            };
            const result = EmailService.evaluateProperties(options, config, templateData);


            result.templateRendered.subscribe(buildResult => {
                expect(result.format).to.eql("html");
                expect(result.formatRendered).to.eql("html");
                expect(result.from).to.eql("redbox@dev");
                expect(result.fromRendered).to.eql("redbox@dev");
                expect(result.to).to.eql(options.to);
                expect(result.toRendered).to.eql("contributor_ci@redboxresearchdata.com.au,contributors_investigators1@redboxresearchdata.com.au,contributors_investigators2@redboxresearchdata.com.au,");
                expect(result.cc).to.eql(null);
                expect(result.ccRendered).to.eql(null);
                expect(result.bcc).to.eql(null);
                expect(result.bccRendered).to.eql(null);
                expect(result.subject).to.eql("Test Email Message");
                expect(result.subjectRendered).to.eql("Test Email Message");
                expect(result.template).to.eql(options.template);
                expect(buildResult['body']).to.eql(`<h1>Hello!</h1>
<p>This is a test email from redbox portal</p>
<p>Data: the test data</p>`);

                done();
            });
        });
    });

    describe('send record notification', function () {
        let originalEmailDisabledValue;
        beforeEach(function (done) {
            originalEmailDisabledValue = _.get(sails.config , 'services.email.disabled');
            done();
        });
        afterEach(function (done) {
            _.set(sails.config , 'services.email.disabled', originalEmailDisabledValue);
            done();
        });
        it('should respect disabled setting', async function () {
            _.set(sails.config, 'services.email.disabled', "true");
            const oid = "test-oid";
            const record = "";
            const options = {triggerCondition: ""};
            const user = "";
            const response = "";
            const result = await EmailService.sendRecordNotification(oid, record, options, user, response).toPromise();
            expect(result).to.equal(null);
        });

        it('should fail when to address is not valid', async function () {
            const oid = "test-oid";
            const record = {testing: true};
            const options = {triggerCondition: "<%= record.testing %>"};
            const user = "";
            const response = {};
            const result = await EmailService.sendRecordNotification(oid, record, options, user, response).toPromise();
            expect(result).to.equal(null);
        });

        it('should send email when trigger condition matches', async function () {
            const oid = "test-oid";
            const record = {
                metadata: {
                    testing: true,
                    title: "Testing title",
                    email_address: "abc@example.com",
                }
            };
            const options = {
                triggerCondition: "<%= record.metadata.testing == true %>",
                to: "<%= record.metadata.email_address %>",
                subject: "Testing email sending",
                template: "publicationReview",
                otherSendOptions: {
                    'replyTo': 'replyto@example.com',
                }
            };
            const user = "";
            const response = {content: "response content"};
            const result = await EmailService.sendRecordNotification(oid, record, options, user, response).toPromise();
            expect(result).to.equal(response);
        });
    });
});
