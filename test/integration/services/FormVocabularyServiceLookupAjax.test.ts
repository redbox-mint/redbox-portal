import supertest from "supertest";
import sinon from "sinon";

describe("Form vocabulary service lookup AJAX routes", function () {
  this.timeout(30_000);

  let agent: supertest.Agent;
  let lookupStub: sinon.SinonStub | undefined;

  afterEach(function () {
    lookupStub?.restore();
    lookupStub = undefined;
  });

  before(async function () {
    const app = (sails as any).hooks.http.app;
    agent = supertest.agent(app);

    await agent
      .post("/user/login_local")
      .set("X-Source", "jsclient")
      .send({
        username: "admin",
        password: "rbadmin",
        branding: "default",
        portal: "rdmp"
      })
      .expect(200);
  });

  it("returns service-backed typeahead results", async function () {
    lookupStub = sinon.stub(sails.services.doiservice, "lookupDataciteDois").resolves({
      data: [
        {
          label: "DataCite Metadata Schema Documentation (10.5438/0014) - DataCite, 2017",
          value: "10.5438/0014",
          sourceType: "service",
          raw: {
            id: "10.5438/0014",
            attributes: {
              doi: "10.5438/0014"
            }
          }
        }
      ],
      meta: {
        total: 1,
        start: 0,
        rows: 10,
        source: "datacite"
      }
    });

    const response = await agent
      .post("/default/rdmp/service/vocab/dataciteDois")
      .set("X-Source", "jsclient")
      .set("X-ReDBox-Api-Version", "2.0")
      .send({
        search: "10.5438/0014",
        start: 0,
        rows: 10
      })
      .expect(200);

    expect(lookupStub.calledOnce).to.equal(true);
    expect(lookupStub.firstCall.args[0]).to.include({
      serviceId: "dataciteDois",
      search: "10.5438/0014",
      start: 0,
      rows: 10,
      branding: "default",
      portal: "rdmp"
    });
    expect(response.body.data).to.be.an("array");
    expect(response.body.data[0]).to.include({
      label: "DataCite Metadata Schema Documentation (10.5438/0014) - DataCite, 2017",
      value: "10.5438/0014",
      sourceType: "service"
    });
    expect(response.body.meta.total).to.equal(1);
    expect(response.body.meta.source).to.equal("datacite");
  });

  it("returns 400 for invalid paging params", async function () {
    const response = await agent
      .post("/default/rdmp/service/vocab/dataciteDois")
      .set("X-Source", "jsclient")
      .set("X-ReDBox-Api-Version", "2.0")
      .send({
        search: "10.5438/0014",
        start: -1,
        rows: 0
      })
      .expect(400);

    expect(response.body.errors[0].code).to.equal("invalid-query-params");
  });

  it("returns 404 for missing service config", async function () {
    const response = await agent
      .post("/default/rdmp/service/vocab/notConfigured")
      .set("X-Source", "jsclient")
      .set("X-ReDBox-Api-Version", "2.0")
      .send({
        search: "smith",
        start: 0,
        rows: 10
      })
      .expect(404);

    expect(response.body.errors[0].code).to.equal("service-lookup-not-configured");
  });

  it("returns 500 for invalid service responses", async function () {
    lookupStub = sinon.stub(sails.services.doiservice, "lookupDataciteDois").resolves({
      data: [
        {
          label: "",
          value: "10.5438/broken"
        }
      ]
    });

    const response = await agent
      .post("/default/rdmp/service/vocab/dataciteDois")
      .set("X-Source", "jsclient")
      .set("X-ReDBox-Api-Version", "2.0")
      .send({
        search: "10.5438/broken",
        start: 0,
        rows: 10
      })
      .expect(500);

    expect(response.body.errors[0].code).to.equal("service-lookup-invalid-response");
  });
});
