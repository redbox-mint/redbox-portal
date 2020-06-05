describe('Fill RDMP', function () {
  const username = Cypress.env('username');
  const password = Cypress.env('password');
  const rdmp = Cypress.env('rdmp');

  beforeEach(() => {
    cy.restoreLocalStorage();
  });
  afterEach(() => {
    cy.saveLocalStorage();
  });

  it('Login with CSRF and Click Create RDMP', function () {
    cy.visit(`/default/rdmp/user/login`);
    //cy.get('#adminLoginLink').click();
    cy.request(`/csrfToken`)
      .its('body._csrf')
      .then((_csrf) => {
        cy.loginByCSRF(_csrf, username, password)
          .then((resp) => {
            expect(resp.status).to.eq(200);
            //expect(resp.body).to.include('Welcome to ReDBox');
          });
      });
    // successful "cy.request" sets all returned cookies, thus we should
    // be able to visit the protected page - we are logged in!
    cy.visit('/default/rdmp/researcher/home');
    cy.wait(2000);
    cy.contains('Create RDMP').click({force: true});
    cy.url().should('include', '/default/rdmp/record/rdmp/edit');
    cy.contains('Data management plan');
    cy.wait(3000);
  });

  it('Should switch tabs to project; fill project', function () {
    cy.get('a[href="#project"]').click();
    cy.wait(1000);
    cy.get('#title').type(rdmp.title, {release: true});
    cy.get('#dc\\:identifier').type(rdmp.id, {release: true, force: true});
    cy.get('#description').type(rdmp.description, {release: true});
    cy.get('input[aria-labelledby="finalKeywords"]').type(rdmp.keywords, {release: true});
    cy.wait(1000);
  });

  it('Should switch tabs to people', function () {
    cy.get('a[href="#people"]').click();
    cy.wait(1000);
  });

  it('Should input a CI', function () {
    cy.get('#people').find('input[aria-label="Name"]').first().type(rdmp.ci_name, {
      force: true,
      delay: 0,
      log: true
    });
  });

  it('Should input email of CI', function () {
    cy.get('#people').find('input[formcontrolname="email"]').first().type(rdmp.ci_email, {
      force: true,
      delay: 0
    });
    cy.wait(2000);
  });

  it('Should switch tabs to dataCollection', function () {
    cy.get('a[href="#dataCollection"]').click();
    cy.wait(1000);
    cy.get('#vivo\\:Dataset_redbox\\:DataCollectionMethodology').type(rdmp.DataCollectionMethodology);
    cy.get('#vivo\\:Dataset_dc_format').type(rdmp.Dataset_dc_format);
    cy.wait(1000);
  });

  it('Should switch tabs to storage', function () {
    cy.get('a[href="#storage"]').click();
    cy.wait(1000);
    cy.get('#vivo\\:Dataset_dc\\:extent').select(rdmp.extent);
    cy.get('#vivo\\:Dataset_dc\\:location_rdf\\:PlainLiteral').select(rdmp.location_rdf);
    cy.get('#vivo\\:Dataset_dc\\:source_dc\\:location_rdf\\:PlainLiteral').select(rdmp.source_dc);
    cy.wait(1000);
  });

  it('Should switch tabs to retention', function () {
    cy.get('a[href="#retention"]').click();
    cy.get('#redbox\\:retentionPeriod_dc\\:date').select(rdmp.retentionPeriod_dc);
    cy.wait(1000);
  });

  it('Should switch tabs to ownership', function () {
    cy.get('a[href="#ownership"]').click();
    cy.wait(1000);
    cy.get('#dc\\:rightsHolder_dc\\:name').select(rdmp.rightsHolder_dc);

  });

  it('Should switch tabs to ethics', function () {
    cy.get('a[href="#ethics"]').click();
    cy.wait(1000);
  });

  it('Should switch tabs to workspaces', function () {
    cy.get('a[href="#workspaces"]').click();
    cy.wait(1000);
  });

  it('Should save', function () {
    cy.get('save-button').contains('Save').click().then(() => {
      cy.contains('Saved successfully.');
    });
  });
});
