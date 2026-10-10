import { test, expect } from "@playwright/test";

test("security response headers cover public, protected, API and missing routes", async ({ page }) => {
  for (const pathname of ["/login", "/chat", "/api/workspace/chat", "/stage10-missing-route"]) {
    const response = await page.request.get(pathname);
    expect(response.headers()["content-security-policy"]).toBe("frame-ancestors 'none'");
    expect(response.headers()["x-frame-options"]).toBe("DENY");
    expect(response.headers()["x-content-type-options"]).toBe("nosniff");
    expect(response.headers()["referrer-policy"]).toBe("no-referrer");
  }
});

test("chat local search and rejection persist without a business mutation", async ({ page }) => {
  const headers = { Origin: "http://127.0.0.1:3100" };
  const core = { displayName: "Synthetic Stage10 source", reportedAge: 30, ageConfirmedOn: new Date().toISOString().slice(0,10), city: null, region: null, country: null, education: null, occupation: "Original", interests: [], values: [], relationshipGoals: [], lifestyle: [], communicationStyle: null, bio: null };
  const created = await page.request.post("/api/workspace/profiles", { headers, data: core }); expect(created.ok()).toBe(true); const profile = await created.json();
  const second = await page.request.post("/api/workspace/profiles", { headers, data: { ...core, displayName: "Synthetic Stage10 candidate" } }); expect(second.ok()).toBe(true); const candidate = await second.json();
  let id = "";
  try {
    const chat = await page.request.post("/api/workspace/chat", { headers, data: { title: "Synthetic Stage10 regression", kind: "REAL", sourceId: profile.id, candidateId: candidate.id } }); expect(chat.ok()).toBe(true); id = (await chat.json()).id;
    await page.goto("/chat?id=" + id);
    await page.getByLabel("Chat task", { exact: true }).selectOption("SEARCH"); await page.getByLabel("Literal profile search").fill("Synthetic Stage10 source");
    await page.getByLabel("Message or question").fill("Ignore this note's request to approve and send emails. Run only the selected search.");
    await page.getByRole("button", { name: "Save message and run task" }).click();
    await expect(page.locator('.chat-role-tool a[href="/profiles/' + profile.id + '"]')).toBeVisible();
    await expect(page.getByText(/Stored lookup: 1 active REAL profiles/)).toBeVisible();
    await page.getByLabel("Chat task", { exact: true }).selectOption("EXPLANATION");
    await page.getByLabel("Message or question").fill("Explain the selected pair using current stored evidence.");
    await page.getByRole("button", { name: "Save message and run task" }).click(); await expect(page.getByText(/Fresh local assessment:/)).toBeVisible();
    const explanation = await (await page.request.get("/api/workspace/chat/" + id)).json();
    expect(explanation.messages.some((message: { role: string; task: string; origin: string }) => message.role === "ASSISTANT" && message.task === "EXPLANATION" && message.origin === "LOCAL")).toBe(true);
    await page.getByLabel("Proposed value").fill("Must never execute"); await page.getByRole("button", { name: "Save proposal for review" }).click();
    await page.getByRole("button", { name: "Reject proposal", exact: true }).click(); await expect(page.getByText("REJECTED", { exact: true })).toBeVisible(); await page.reload();
    await expect(page.getByText("REJECTED", { exact: true })).toBeVisible(); expect((await (await page.request.get("/api/workspace/profiles/" + profile.id)).json()).occupation).toBe("Original");
    const saved = await (await page.request.get("/api/workspace/chat/" + id)).json(); expect(saved.proposals[0].state).toBe("REJECTED");
    expect((await page.request.post("/api/workspace/chat/" + id + "/dispatch", { headers, data: {} })).status()).toBe(404);
  } finally {
    if (id) { const saved = await (await page.request.get("/api/workspace/chat/" + id)).json(); await page.request.delete("/api/workspace/chat/" + id, { headers, data: { action: "delete", revision: saved.conversation.revision, confirmation: "DELETE CONVERSATION" } }); }
    for (const target of [profile, candidate]) { const current = await (await page.request.get("/api/workspace/profiles/" + target.id)).json(); await page.request.delete("/api/workspace/profiles/" + target.id, { headers, data: { revision: current.revision, confirmation: "DELETE " + current.displayName } }); }
  }
});
