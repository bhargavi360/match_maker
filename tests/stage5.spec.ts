import {test,expect,type APIRequestContext} from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
async function cleanup(request:APIRequestContext,id:string,headers:Record<string,string>){
  const response=await request.get("/api/workspace/profiles/"+id);if(response.status()===404)return;
  const current=await response.json();expect((await request.delete("/api/workspace/profiles/"+id,{headers,data:{revision:current.revision,confirmation:"DELETE "+current.displayName}})).ok()).toBe(true);
}
test("mobile deterministic matching, factor disclosures and optional AI fallback are accessible",async({page})=>{
  await page.setViewportSize({width:390,height:844});await page.goto("/matches");
  const localOrigin=new URL(page.url()).origin;
  const external:string[]=[];page.on("request",req=>{if(req.url().startsWith("http")&&new URL(req.url()).origin!==localOrigin)external.push(req.url());});
  const sources=await (await page.request.get("/api/workspace/matches/sources")).json();
  const source=sources.sources.find((p:{demoKey:string})=>p.demoKey==="stage4-aanya");
  await page.getByRole("combobox",{name:"Source profile",exact:true}).selectOption(source.id);
  await page.getByRole("button",{name:"Rank candidates",exact:true}).click();
  await expect(page.getByText("3 eligible candidates",{exact:false})).toBeVisible();
  const cards=page.locator(".match-grid").first();await expect(cards.locator("article")).toHaveCount(3);
  await cards.getByRole("button",{name:"View factor breakdown",exact:true}).first().click();
  await expect(page.getByRole("heading",{name:"Deterministic factor breakdown"})).toBeVisible();
  await expect(page.locator(".match-breakdown .factor-row")).toHaveCount(8);
  await expect(page.locator(".match-breakdown").getByText("Local explanation",{exact:true})).toBeVisible();
  await expect(page).toHaveTitle("Matches · Matchmaker");
  expect((await new AxeBuilder({page}).withTags(["wcag2a","wcag2aa","wcag21aa"]).analyze()).violations).toEqual([]);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.screenshot({path:"test-results/screenshots/stage5-matches-mobile.png",fullPage:true});
  await page.getByRole("button",{name:"Optional Gemini explanation",exact:true}).click();
  const dialog=page.getByRole("dialog",{name:"Pair explanation"});await expect(dialog.getByText("Local explanation",{exact:true})).toBeVisible();
  expect((await new AxeBuilder({page}).withTags(["wcag2a","wcag2aa","wcag21aa"]).analyze()).violations).toEqual([]);
  await page.keyboard.press("Escape");await expect(dialog).not.toBeVisible();
  await page.getByLabel("Natural-language search",{exact:true}).fill("Show active profiles who want a long-term relationship");
  await page.getByRole("button",{name:"Try optional Gemini interpretation",exact:true}).click();
  await expect(page.locator(".matching-search").getByRole("status")).toContainText("Local fallback");
  await page.getByRole("button",{name:"Rank candidates",exact:true}).click();await expect(page.getByText("3 eligible candidates",{exact:false})).toBeVisible();
  await page.getByLabel("Natural-language search",{exact:true}).fill("unknown request customer@example.invalid");
  await page.getByRole("button",{name:"Rank candidates",exact:true}).click();
  await expect(page.getByRole("heading",{name:"No eligible results"})).toBeVisible();
  await expect(page.getByText(/No reliable interpretation was found/)).toBeVisible();
  expect(external).toEqual([]);
});
test("recommendation count is configurable from five to ten and remains capped; weight changes alter the result snapshot",async({page})=>{
  test.setTimeout(60000);
  await page.goto("/matches");
  const headers={Origin:new URL(page.url()).origin};
  const ids:string[]=[];let original:{version:number;weights:Record<string,number>}|null=null,initialSnapshot="";
  const core={displayName:"Synthetic pagination source",gender:"Woman",reportedAge:30,ageConfirmedOn:new Date().toISOString().slice(0,10),city:"City",region:"Region",country:"Country",education:null,occupation:"Synthetic job",interests:["Reading"],values:["Kindness"],relationshipGoals:["LONG_TERM"],lifestyle:[],communicationStyle:"Direct",bio:null};
  try{
    for(let i=0;i<13;i++){const response=await page.request.post("/api/workspace/profiles",{headers,data:{...core,gender:i===0?"Woman":"Man",displayName:i===0?core.displayName:"Synthetic recommendation candidate "+i}});expect(response.status()).toBe(201);ids.push((await response.json()).id);}
    const first=await (await page.request.post("/api/workspace/matches",{headers,data:{sourceId:ids[0]}})).json();expect(first.results).toHaveLength(10);expect(first.total).toBe(12);expect(first.nextCursor).toBeNull();initialSnapshot=first.snapshot;
    const five=await (await page.request.post("/api/workspace/matches",{headers,data:{sourceId:ids[0],limit:5}})).json();expect(five.results).toHaveLength(5);expect(five.results.map((r:{candidate:{id:string}})=>r.candidate.id)).toEqual(first.results.slice(0,5).map((r:{candidate:{id:string}})=>r.candidate.id));
    const gender=await (await page.request.post("/api/workspace/matches",{headers,data:{sourceId:ids[0],filters:{gender:"man"}}})).json();expect(gender.total).toBe(12);
    expect((await page.request.post("/api/workspace/matches",{headers,data:{sourceId:ids[0],limit:11}})).status()).toBe(400);
    expect((await page.request.post("/api/workspace/matches",{headers,data:{sourceId:ids[0],limit:4}})).status()).toBe(400);
    await page.goto("/matches");await page.getByRole("combobox",{name:"Source profile",exact:true}).selectOption(ids[0]);
    await page.getByRole("combobox",{name:"Recommendations to show",exact:true}).selectOption("6");
    await page.getByText("Structured filters",{exact:true}).click();await page.getByLabel("Reported gender",{exact:true}).fill("man");
    await page.getByRole("button",{name:"Rank candidates",exact:true}).click();
    await expect(page.locator(".match-grid").first().locator("article")).toHaveCount(6);
    const names=await page.locator(".match-grid").first().getByRole("heading",{level:2}).allTextContents();expect(new Set(names).size).toBe(6);
    original=await (await page.request.get("/api/workspace/settings")).json();
    await page.goto("/settings");await page.getByLabel("Values",{exact:true}).fill("21");
    await page.getByRole("button",{name:"Review weight changes",exact:true}).click();
    const dialog=page.getByRole("dialog",{name:"Confirm scoring weight changes"});
    await expect(dialog).toBeVisible();
    await dialog.getByLabel("Type SAVE WEIGHTS").fill("SAVE WEIGHTS");
    expect((await new AxeBuilder({page}).withTags(["wcag2a","wcag2aa","wcag21aa"]).analyze()).violations).toEqual([]);
    await dialog.getByRole("button",{name:"Confirm weight changes",exact:true}).click();
    await expect(page.getByText(/Saved weight version/)).toBeVisible();
    await expect(dialog).not.toBeVisible();
    const revised=await (await page.request.post("/api/workspace/matches",{headers,data:{sourceId:ids[0]}})).json();expect(revised.weightVersion).toBe(original!.version+1);expect(revised.snapshot).not.toBe(initialSnapshot);
    await page.setViewportSize({width:320,height:740});
    await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
    expect((await new AxeBuilder({page}).withTags(["wcag2a","wcag2aa","wcag21aa"]).analyze()).violations).toEqual([]);
    await page.screenshot({path:"test-results/screenshots/stage5-settings-mobile.png",fullPage:true});
  }finally{
    if(original){const current=await (await page.request.get("/api/workspace/settings")).json();expect((await page.request.patch("/api/workspace/settings/weights",{headers,data:{version:current.version,weights:original.weights,confirmation:"SAVE WEIGHTS"}})).ok()).toBe(true);}
    for(const id of ids)await cleanup(page.request,id,headers);
  }
});
test("advanced Profiles search keeps unknown queries empty and honors structured filters",async({page})=>{
  await page.setViewportSize({width:320,height:740});await page.goto("/profiles");
  await page.getByText("Structured and natural-language profile search",{exact:true}).click();
  const search=page.locator(".advanced-profile-search");
  await search.getByLabel("Search classification").selectOption("DEMO");
  await search.getByLabel("Natural-language search",{exact:true}).fill("unrecognized universe");
  await search.getByRole("button",{name:"Search recorded facts",exact:true}).click();await expect(search.getByRole("status")).toHaveText("0 profiles satisfy these filters.");
  await search.getByLabel("Natural-language search",{exact:true}).fill("");
  await search.getByText("Structured filters",{exact:true}).click();
  await search.getByLabel("Minimum age",{exact:true}).fill("33");
  await search.getByRole("button",{name:"Search recorded facts",exact:true}).click();await expect(search.getByRole("status")).toHaveText("2 profiles satisfy these filters.");
  expect((await new AxeBuilder({page}).withTags(["wcag2a","wcag2aa","wcag21aa"]).analyze()).violations).toEqual([]);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
});
