import { expect, test } from "@playwright/test";
import type { APIRequestContext } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
async function cleanProfile(request: APIRequestContext, id: string) {
  const response = await request.get("/api/workspace/profiles/" + id);
  if (response.status() === 404) return;
  expect(response.ok()).toBe(true);
  const current = await response.json();
  expect((await request.delete("/api/workspace/profiles/" + id, { headers: { Origin: "http://127.0.0.1:3100" }, data: { revision: current.revision, confirmation: "DELETE " + current.displayName } })).ok()).toBe(true);
}
test("registration, operator setup, anonymous endpoints, CSRF, and request bounds are enforced over HTTP", async ({ playwright, page }) => {
  const anonymous = await playwright.request.newContext({ baseURL:"http://127.0.0.1:3100", storageState:{cookies:[],origins:[]} });
  for (const path of ["profiles","dashboard","settings","demo/reset","profiles/00000000-0000-4000-8000-000000000000/contact"]) {
    expect((await anonymous.get("/api/workspace/" + path)).status()).toBe(401);
  }
  expect((await anonymous.post("/api/auth/sign-up/email",{data:{},headers:{Origin:"http://127.0.0.1:3100"}})).status()).toBe(400);
  expect((await anonymous.post("/api/bootstrap",{data:{},headers:{Origin:"https://foreign.invalid"}})).status()).toBe(403);
  expect((await anonymous.post("/api/bootstrap",{data:{token:"x".repeat(40000)},headers:{Origin:"http://127.0.0.1:3100"}})).status()).toBe(413);
  expect((await anonymous.post("/api/bootstrap",{data:{token:"wrong",name:"Synthetic",email:"other@example.invalid",password:"Synthetic-only-passphrase"},headers:{Origin:"http://127.0.0.1:3100"}})).status()).toBe(403);
  expect((await page.request.post("/api/workspace/profiles",{data:{},headers:{Origin:"https://foreign.invalid"}})).status()).toBe(403);
  await page.goto("/setup");
  await expect(page.getByRole("heading",{name:"Setup is permanently closed."})).toBeVisible();
  await page.goto("/register");
  await expect(page.getByRole("heading",{name:"Begin your journey."})).toBeVisible();
  await anonymous.dispose();
});
test("saved profile, encrypted-contact path, preferences, permission, archive, edit and delete work on mobile", async ({ page }) => {
  await page.setViewportSize({width:390,height:844});
  await page.goto("/profiles/new");
  await page.getByLabel("Display name",{exact:true}).fill("Synthetic Browser Customer");
  await page.getByLabel("Gender (reported)",{exact:true}).fill("Woman");
  await page.getByLabel("Reported age",{exact:true}).fill("32");
  await page.getByLabel("Age last confirmed (DD-MM-YYYY)",{exact:true}).fill("09-10-2026");
  await page.getByLabel("City",{exact:true}).fill("Fixture City");
  await page.getByLabel("Occupation",{exact:true}).fill("Synthetic occupation");
  await page.getByLabel("Interests (comma-separated)").fill("Reading, Art");
  await page.getByLabel("Private email",{exact:true}).fill("add-form-contact@example.invalid");
  await page.getByLabel("Private mobile number (international)",{exact:true}).fill("+91 98765 43210");
  await page.getByLabel("long term",{exact:true}).check();
  expect((await new AxeBuilder({page}).withTags(["wcag2a","wcag2aa","wcag21aa"]).analyze()).violations).toEqual([]);
  await page.getByRole("button",{name:"Create profile",exact:true}).click();
  await expect(page).toHaveURL(/\/profiles\/[a-f0-9-]{36}$/);
  const id=page.url().split("/").pop()!;
  try {
  await expect(page).toHaveTitle("Profile detail · Matchmaker");
  await expect(page.getByRole("heading",{name:"Synthetic Browser Customer",exact:true})).toBeVisible();
  await expect(page.getByText("Review: approved",{exact:true})).toBeVisible();
  await expect(page.getByText("Woman",{exact:true})).toBeVisible();
  await page.getByRole("button",{name:"Open private contacts"}).click();
  await expect(page.getByLabel("Private email")).toHaveValue("add-form-contact@example.invalid");
  await expect(page.getByLabel("Private phone")).toHaveValue("+919876543210");
  await page.getByLabel("Private email").fill("browser-contact@example.invalid");
  await page.getByLabel("Private phone").fill("+91 00000 00000");
  await page.getByRole("button",{name:"Save private contacts"}).click();
  await expect(page.getByRole("button",{name:"Open private contacts"})).toBeVisible();
  expect(JSON.stringify(await (await page.request.get("/api/workspace/profiles/" + id)).json())).not.toContain("browser-contact@example.invalid");
  await page.getByLabel("Preferred minimum age").fill("25");
  await page.getByLabel("Preferred maximum age").fill("40");
  await page.getByRole("button",{name:"Save preferences"}).click();
  await expect(page.getByText(/Revision 3 ·/)).toBeVisible();
  await page.getByLabel("Consent scope").selectOption("MATCHING");
  await page.getByLabel("Policy version").fill("fixture-v1");
  await page.getByLabel("Internal evidence reference").fill("fixture-evidence-123");
  await page.getByRole("button",{name:"Record permission change"}).click();
  await expect(page.getByText(/Revision 4 ·/)).toBeVisible();
  await expect(page.locator(".consent-list").getByText("GRANTED",{exact:true})).toHaveCount(1);
  await page.getByRole("button",{name:"Archive profile"}).click();
  await expect(page.getByRole("button",{name:"Reactivate profile"})).toBeVisible();
  await page.getByRole("button",{name:"Reactivate profile"}).click();
  await expect(page.getByRole("button",{name:"Archive profile"})).toBeVisible();
  await page.getByRole("link",{name:"Edit profile",exact:true}).click();
  await expect(page.getByLabel("Gender (reported)",{exact:true})).toHaveValue("Woman");
  await expect(page.getByLabel("Age last confirmed (DD-MM-YYYY)",{exact:true})).toHaveValue("09-10-2026");
  await page.getByRole("button",{name:"Load private contacts"}).click();
  await expect(page.getByLabel("Private email")).toHaveValue("browser-contact@example.invalid");
  await page.getByLabel("Display name",{exact:true}).fill("Updated Browser Customer");
  await page.getByRole("button",{name:"Save profile",exact:true}).click();
  await expect(page.getByRole("heading",{name:"Updated Browser Customer",exact:true})).toBeVisible();
  await expect(page).toHaveTitle("Profile detail · Matchmaker");
  expect((await new AxeBuilder({page}).withTags(["wcag2a","wcag2aa","wcag21aa"]).analyze()).violations).toEqual([]);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.screenshot({path:"test-results/screenshots/stage4-profile-detail-mobile.png",fullPage:true});
  await page.getByRole("button",{name:"Delete permanently",exact:true}).click();
  const dialog=page.getByRole("dialog",{name:"Delete profile permanently"});
  await dialog.getByLabel("Type DELETE Updated Browser Customer").fill("DELETE Updated Browser Customer");
  await dialog.getByRole("button",{name:"Confirm permanent deletion"}).click();
  await expect(page).toHaveURL(/\/profiles$/);
  expect((await page.request.get("/api/workspace/profiles/" + id)).status()).toBe(404);
  } finally { await cleanProfile(page.request, id); }
});
test("demo reset preserves a real fixture and dashboard counts match authorized queries", async ({ page }) => {
  const headers={Origin:"http://127.0.0.1:3100"};
  const fixture={displayName:"Real classification synthetic fixture",reportedAge:null,ageConfirmedOn:null,city:null,region:null,country:null,education:null,occupation:null,interests:[],values:[],relationshipGoals:[],lifestyle:[],communicationStyle:null,bio:null};
  const created=await (await page.request.post("/api/workspace/profiles",{headers,data:fixture})).json();
  try {
  await page.goto("/settings");
  await page.getByRole("button",{name:"Review demo reset",exact:true}).click();
  const dialog=page.getByRole("dialog",{name:"Reset demo records"});
  await expect(dialog.getByText(/4 demo profiles, 0 contacts/)).toBeVisible();
  await dialog.getByLabel("Type RESET DEMO").fill("RESET DEMO");
  await dialog.getByRole("button",{name:"Confirm demo reset"}).click();
  await expect(dialog).not.toBeVisible();
  expect((await page.request.get("/api/workspace/profiles/" + created.id)).status()).toBe(200);
  const stats=await (await page.request.get("/api/workspace/dashboard")).json();
  expect(stats.active).toBe(1);expect(stats.real).toBe(1);expect(stats.demo).toBe(0);expect(stats.unset).toBe(5);
  await page.goto("/dashboard");
  await expect(page.locator(".metric").first().locator("strong")).toHaveText("01");
  } finally {
    await cleanProfile(page.request, created.id);
    expect((await page.request.post("/api/workspace/demo/seed",{headers,data:{confirmation:"SEED DEMO"}})).ok()).toBe(true);
  }
});
test.describe("anonymous login", () => {
  test.use({storageState:{cookies:[],origins:[]}});
  test("protected navigation redirects, login fails generically, and logout revokes access", async ({page}) => {
    await page.goto("/profiles");
    await expect(page).toHaveURL(/\/login$/);
    await page.getByLabel("Email",{exact:true}).fill("unknown@example.invalid");
    await page.getByLabel("Password",{exact:true}).fill("wrong-password");
    await page.getByRole("button",{name:"Sign in",exact:true}).click();
    await expect(page.locator("main").getByRole("alert")).toContainText("credentials");
    await page.getByLabel("Email",{exact:true}).fill("browser@example.invalid");
    await page.getByLabel("Password",{exact:true}).fill("Synthetic-browser-passphrase-2026");
    await page.getByRole("button",{name:"Sign in",exact:true}).click();
    await expect(page).toHaveURL(/\/dashboard$/);
    expect(await page.evaluate(()=>Object.keys(localStorage))).toEqual([]);
    await page.locator(".account-menu summary").click();
    await page.getByRole("button",{name:"Sign out",exact:true}).click();
    await expect(page).toHaveURL(/\/login$/);
    expect((await page.request.get("/api/workspace/profiles")).status()).toBe(401);
  });
});
