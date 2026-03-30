import supertest from "supertest";
import { firstValueFrom } from "rxjs";

describe("Admin user management AJAX routes", function () {
  this.timeout(60_000);

  let agent: supertest.Agent;
  let primaryUserId: string;
  let primaryUsername: string;
  let secondaryUserId: string;
  let secondaryUsername: string;

  before(async function () {
    const app = (sails as any).hooks.http.app;
    agent = supertest.agent(app);

    const brand = BrandingService.getDefault();
    const roleIds = RolesService.getRoleIds(brand.roles, ["Researcher"]);
    const suffix = Date.now().toString();

    primaryUsername = `ajaxprimary${suffix}`;
    secondaryUsername = `ajaxsecondary${suffix}`;

    const primaryUser = await firstValueFrom(
      UsersService.addLocalUser(
        primaryUsername,
        "AJAX Primary User",
        `${primaryUsername}@example.edu.au`,
        "RBTest123!"
      )
    );
    await firstValueFrom(UsersService.updateUserRoles(primaryUser.id, roleIds));
    primaryUserId = String(primaryUser.id);

    const secondaryUser = await firstValueFrom(
      UsersService.addLocalUser(
        secondaryUsername,
        "AJAX Secondary User",
        `${secondaryUsername}@example.edu.au`,
        "RBTest123!"
      )
    );
    await firstValueFrom(UsersService.updateUserRoles(secondaryUser.id, roleIds));
    secondaryUserId = String(secondaryUser.id);

    const loginResponse = await agent
      .post("/user/login_local")
      .set("X-Source", "jsclient")
      .send({
        username: "admin",
        password: "rbadmin",
        branding: "default",
        portal: "rdmp"
      })
      .expect(200);

    expect(loginResponse.body.user.username).to.equal("admin");
  });

  it("supports candidate search, linking, disable/enable, and audit retrieval", async function () {
    const candidateResponse = await agent
      .get("/default/rdmp/admin/users/link/candidates")
      .set("X-Source", "jsclient")
      .query({
        primaryUserId,
        query: secondaryUsername
      })
      .expect(200);

    expect(candidateResponse.body).to.be.an("array");
    expect(candidateResponse.body.some((candidate: { id: string }) => candidate.id === secondaryUserId)).to.equal(true);

    const linkResponse = await agent
      .post("/default/rdmp/admin/users/link")
      .set("X-Source", "jsclient")
      .send({
        primaryUserId,
        secondaryUserId
      })
      .expect(200);

    expect(linkResponse.body.primary.id).to.equal(primaryUserId);
    expect(linkResponse.body.linkedAccounts).to.be.an("array");
    expect(linkResponse.body.linkedAccounts[0].id).to.equal(secondaryUserId);
    expect(linkResponse.body.impact).to.have.property("rolesMerged");
    expect(linkResponse.body.impact).to.have.property("recordsRewritten");

    const linksResponse = await agent
      .get(`/default/rdmp/admin/users/${primaryUserId}/links`)
      .set("X-Source", "jsclient")
      .expect(200);

    expect(linksResponse.body.primary.id).to.equal(primaryUserId);
    expect(linksResponse.body.linkedAccounts).to.have.length(1);
    expect(linksResponse.body.linkedAccounts[0].id).to.equal(secondaryUserId);

    const disableResponse = await agent
      .post(`/default/rdmp/admin/users/${primaryUserId}/disable`)
      .set("X-Source", "jsclient")
      .send({})
      .expect(200);

    expect(disableResponse.body.status).to.equal(true);

    const usersDefaultResponse = await agent
      .get("/default/rdmp/admin/users/get")
      .set("X-Source", "jsclient")
      .expect(200);

    expect(usersDefaultResponse.body.some((user: { id: string }) => user.id === primaryUserId)).to.equal(false);
    expect(usersDefaultResponse.body.some((user: { id: string }) => user.id === secondaryUserId)).to.equal(false);

    const usersWithDisabledResponse = await agent
      .get("/default/rdmp/admin/users/get")
      .set("X-Source", "jsclient")
      .query({ includeDisabled: "true" })
      .expect(200);

    const disabledPrimary = usersWithDisabledResponse.body.find((user: { id: string }) => user.id === primaryUserId);
    const disabledSecondary = usersWithDisabledResponse.body.find((user: { id: string }) => user.id === secondaryUserId);
    expect(disabledPrimary.effectiveLoginDisabled).to.equal(true);
    expect(disabledSecondary.effectiveLoginDisabled).to.equal(true);
    expect(disabledSecondary.disabledByPrimaryUserId).to.equal(primaryUserId);

    const enableResponse = await agent
      .post(`/default/rdmp/admin/users/${primaryUserId}/enable`)
      .set("X-Source", "jsclient")
      .send({})
      .expect(200);

    expect(enableResponse.body.status).to.equal(true);

    const auditResponse = await agent
      .get(`/default/rdmp/admin/users/${primaryUserId}/audit`)
      .set("X-Source", "jsclient")
      .expect(200);

    expect(auditResponse.body.user.id).to.equal(primaryUserId);
    expect(auditResponse.body.records).to.be.an("array");

    const actions = auditResponse.body.records.map((record: { action: string }) => record.action);
    expect(actions).to.include("link-accounts");
    expect(actions).to.include("disable-user");
    expect(actions).to.include("enable-user");
  });
});
