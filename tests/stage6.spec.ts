import {test,expect,type Page} from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
test.describe.configure({ timeout: 90_000 });
const headers={Origin:"http://127.0.0.1:3100"};
const core={displayName:"Synthetic Stage6 Source",reportedAge:30,ageConfirmedOn:new Date().toISOString().slice(0,10),city:"City",region:"Region",country:"Country",education:null,occupation:"Synthetic job",interests:["Art"],values:["Kindness"],relationshipGoals:["LONG_TERM"],lifestyle:["NON_SMOKER"],communicationStyle:"Direct",bio:null};
async function cleanup(page:Page,ids:string[]){for(const id of ids){const r=await page.request.get("/api/workspace/profiles/"+id);if(r.status()===404)continue;const p=await r.json();expect((await page.request.delete("/api/workspace/profiles/"+id,{headers,data:{revision:p.revision,confirmation:"DELETE "+p.displayName}})).ok()).toBe(true);}}
async function pair(page:Page,ids:string[]){for(const displayName of [core.displayName,"Synthetic Stage6 Candidate "+crypto.randomUUID().slice(0,8)]){const r=await page.request.post("/api/workspace/profiles",{headers,data:{...core,displayName}});expect(r.status()).toBe(201);ids.push((await r.json()).id);}}
async function select(page:Page,ids:string[]){const candidate=await (await page.request.get("/api/workspace/profiles/"+ids[1])).json();await page.goto("/workflow");await page.getByLabel("Workflow source").selectOption(ids[0]);await page.getByRole("button",{name:"Create workflow",exact:true}).click();await expect(page).toHaveURL(/\/workflow\?id=/,{timeout:15_000});await page.getByRole("button",{name:"Continue",exact:true}).click();await page.getByRole("button",{name:"Load current candidates",exact:true}).click();await page.getByRole("button",{name:"Select "+candidate.displayName,exact:true}).click();await expect(page.getByRole("heading",{name:"Evidence before a decision."})).toBeVisible();await expect(page.locator(".workflow-live .match-breakdown .factor-row")).toHaveCount(8);}
async function review(page:Page){await page.getByRole("checkbox",{name:/I reviewed this assessment/}).check();await page.getByRole("button",{name:"Record explanation review",exact:true}).click();await expect(page.getByText(/Explicit review recorded/)).toBeVisible();}
async function axe(page:Page,width:number){await expect(page).toHaveTitle("Workflow · Matchmaker");expect((await new AxeBuilder({page}).withTags(["wcag2a","wcag2aa","wcag21aa"]).analyze()).violations).toEqual([]);expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);}
test("persistent human approval, keyboard back-navigation and separate email actions on mobile",async({page})=>{
  const ids:string[]=[];try{
    await pair(page,ids);await page.setViewportSize({width:390,height:844});await select(page,ids);
    await expect(page.getByRole("button",{name:"Approve Match",exact:true})).toBeDisabled();await axe(page,390);
    const id=new URL(page.url()).searchParams.get("id")!;expect((await (await page.request.get("/api/workspace/workflows/"+id)).json()).history).toEqual([]);
    await review(page);await page.getByRole("button",{name:"Approve Match",exact:true}).click();const dialog=page.getByRole("dialog",{name:"Confirm match approval"});await expect(dialog).toBeVisible();await axe(page,390);
    await page.keyboard.press("Escape");await expect(dialog).not.toBeVisible();await expect(page.getByRole("button",{name:"Approve Match",exact:true})).toBeFocused();await page.getByRole("button",{name:"Approve Match",exact:true}).click();await dialog.getByRole("button",{name:"Confirm approval",exact:true}).click();
    await expect(page.getByRole("heading",{name:"Prepare an editable introduction"})).toBeVisible();await expect(page.getByText("Human approval saved. Local email drafting is available; email approval is separate.",{exact:true})).toBeFocused();await expect(page.getByRole("link",{name:"Open workflow email drafts",exact:true})).toBeVisible();await page.reload();await expect(page.getByText("Human match approval saved",{exact:true})).toBeVisible();
    await page.getByRole("button",{name:"Continue to delivery review",exact:true}).click();await expect(page.getByRole("heading",{name:"Choose delivery with current evidence"})).toBeVisible();await expect(page.getByRole("link",{name:"Review email approval and delivery",exact:true})).toBeVisible();await axe(page,390);
    const tabs=page.getByRole("tablist",{name:"Saved workflow steps"});await tabs.getByRole("tab",{name:/Choose Delivery/}).focus();await page.keyboard.press("Home");await expect(tabs.getByRole("tab",{name:/Select Customer/})).toHaveAttribute("aria-selected","true");await expect(page.getByLabel("Workflow source")).toBeDisabled();
    await tabs.getByRole("tab",{name:/Read Explanation/}).click();await expect(page.getByText(/Explicit review recorded/)).toBeVisible();await expect(page.locator(".workflow-history li")).toHaveCount(1);
    await page.screenshot({path:"test-results/screenshots/stage6-reviewed-mobile.png",fullPage:true});expect(await page.evaluate(()=>Object.keys(localStorage))).toEqual([]);
  }finally{await cleanup(page,ids);}
});
test("rejection persists and controlled reopen requires a fresh assessment and review at 320px",async({page})=>{
  const ids:string[]=[];try{
    await pair(page,ids);await page.setViewportSize({width:320,height:740});await page.emulateMedia({colorScheme:"dark"});await select(page,ids);await review(page);
    const id=new URL(page.url()).searchParams.get("id")!,original=(await (await page.request.get("/api/workspace/workflows/"+id)).json()).snapshotId;
    await page.getByRole("button",{name:"Reject Match",exact:true}).click();await page.getByRole("dialog",{name:"Confirm match rejection"}).getByRole("button",{name:"Confirm rejection",exact:true}).click();await expect(page.getByText("Rejection saved. Draft previews are locked.",{exact:true})).toBeVisible();await page.reload();
    await expect(page.getByRole("tablist",{name:"Saved workflow steps"}).getByRole("tab",{name:/Generate Email/})).toBeDisabled();await expect(page.getByRole("button",{name:"Approve Match",exact:true})).toBeDisabled();await axe(page,320);
    await page.getByRole("button",{name:"Reopen decision",exact:true}).click();await page.getByRole("dialog",{name:"Reopen match decision"}).getByRole("button",{name:"Confirm reopen",exact:true}).click();await expect(page.getByRole("button",{name:"Refresh assessment",exact:true})).toBeVisible();await page.getByRole("button",{name:"Refresh assessment",exact:true}).click();
    await expect(page.getByRole("button",{name:"Approve Match",exact:true})).toBeDisabled();await expect(page.getByRole("checkbox",{name:/I reviewed this assessment/})).not.toBeChecked();const current=await (await page.request.get("/api/workspace/workflows/"+id)).json();expect(current.snapshotId).not.toBe(original);expect(current.history.map((d:{type:string})=>d.type)).toEqual(["REJECTED","REOPENED"]);await axe(page,320);await page.screenshot({path:"test-results/screenshots/stage6-reopened-dark-320.png",fullPage:true});
  }finally{await cleanup(page,ids);}
});
test("changed profile blocks approval, displays stale warning and needs explicit refreshed review",async({page})=>{
  const ids:string[]=[];try{
    await pair(page,ids);await page.setViewportSize({width:768,height:1024});await select(page,ids);await review(page);const candidate=await (await page.request.get("/api/workspace/profiles/"+ids[1])).json();
    expect((await page.request.patch("/api/workspace/profiles/"+ids[1],{headers,data:{revision:candidate.revision,profile:{...core,displayName:"Synthetic changed candidate"}}})).ok()).toBe(true);
    await page.getByRole("button",{name:"Approve Match",exact:true}).click();await page.getByRole("button",{name:"Confirm approval",exact:true}).click();await expect(page.getByRole("heading",{name:"Assessment changed — review required"})).toBeVisible();await expect(page.getByRole("button",{name:"Approve Match",exact:true})).toBeDisabled();await expect(page.getByRole("alert").filter({hasText:"Assessment changed. Reopen"})).toBeVisible();
    await page.getByRole("button",{name:"Refresh assessment",exact:true}).click();await expect(page.getByRole("heading",{name:"Assessment changed — review required"})).not.toBeVisible();await expect(page.getByRole("checkbox",{name:/I reviewed this assessment/})).not.toBeChecked();await expect(page.getByRole("button",{name:"Approve Match",exact:true})).toBeDisabled();await axe(page,768);
    const id=new URL(page.url()).searchParams.get("id")!,current=await (await page.request.get("/api/workspace/workflows/"+id)).json();expect(current.history).toEqual([]);expect(current.stale).toBe(false);
  }finally{await cleanup(page,ids);}
});
test("two tabs cannot overwrite a newer review or approve through GET",async({page,context})=>{
  test.setTimeout(90_000);
  const ids:string[]=[];const second=await context.newPage();try{
    await page.bringToFront();await pair(page,ids);await select(page,ids);await second.bringToFront();await second.goto(page.url());await page.bringToFront();await review(page);await second.bringToFront();await second.getByRole("checkbox",{name:/I reviewed this assessment/}).check();await second.getByRole("button",{name:"Record explanation review",exact:true}).click();await expect(second.locator(".workflow-live").getByRole("alert")).toContainText("another tab");
    const id=new URL(page.url()).searchParams.get("id")!;expect((await page.request.get("/api/workspace/workflows/"+id+"/approve")).status()).toBe(404);const current=await (await page.request.get("/api/workspace/workflows/"+id)).json();expect(current.history).toEqual([]);expect(current.status).toBe("IN_PROGRESS");
  }finally{await second.close();await cleanup(page,ids);}
});
