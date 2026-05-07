import supertest from "supertest";

describe("Form vocabulary service lookup AJAX routes", function () {
  this.timeout(30_000);

  let agent: supertest.Agent;

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
    const response = await agent
      .post("/default/rdmp/service/vocab/integrationContributors")
      .set("X-Source", "jsclient")
      .set("X-ReDBox-Api-Version", "2.0")
      .send({
        search: "smith",
        start: 0,
        rows: 10
      })
      .expect(200);

    expect(response.body.data).to.be.an("array");
    expect(response.body.data[0]).to.include({
      label: "Jane Smith",
      value: "party-123",
      sourceType: "service"
    });
    expect(response.body.meta.total).to.equal(2);
  });

  it("returns 400 for invalid paging params", async function () {
    const response = await agent
      .post("/default/rdmp/service/vocab/integrationContributors")
      .set("X-Source", "jsclient")
      .set("X-ReDBox-Api-Version", "2.0")
      .send({
        search: "smith",
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
    const response = await agent
      .post("/default/rdmp/service/vocab/integrationInvalidResponse")
      .set("X-Source", "jsclient")
      .set("X-ReDBox-Api-Version", "2.0")
      .send({
        search: "smith",
        start: 0,
        rows: 10
      })
      .expect(500);

    expect(response.body.errors[0].code).to.equal("service-lookup-invalid-response");
  });
});
