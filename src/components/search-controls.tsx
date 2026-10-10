"use client";
import { TextInput } from "./ui";
import { goals,lifestyles } from "@/domain/validation";
import { searchFiltersSchema,type SearchFilters } from "@/domain/search";
export function describeFilters(filters:SearchFilters){
  const descriptions:string[]=[];
  if(filters.minAge!==undefined)descriptions.push("Minimum age "+filters.minAge);
  if(filters.maxAge!==undefined)descriptions.push("Maximum age "+filters.maxAge);
  const labels={gender:"Reported gender",city:"City",region:"Region",country:"Country",education:"Education",communicationStyle:"Communication style"};
  for(const key of ["gender","city","region","country","education","communicationStyle"] as const)if(filters[key])descriptions.push(labels[key]+": "+filters[key]);
  if(filters.goals.length)descriptions.push("Goals: "+filters.goals.map(v=>v.replaceAll("_"," ").toLowerCase()).join(", "));
  if(filters.interests.length)descriptions.push("Required interests: "+filters.interests.join(", "));
  if(filters.lifestyle.length)descriptions.push("Lifestyle: "+filters.lifestyle.map(v=>v.replaceAll("_"," ").toLowerCase()).join(", "));
  if(filters.sameLocation)descriptions.push("Same "+filters.sameLocation.toLowerCase()+" as source");
  if(filters.minSharedInterests)descriptions.push("At least "+filters.minSharedInterests+" shared interests");
  return descriptions.length?descriptions.join("; "):"No additional filters; active profiles only";
}
export function readSearch(form:FormData){
  const filters=searchFiltersSchema.parse({
    ...(form.get("minAge")?{minAge:Number(form.get("minAge"))}:{}),...(form.get("maxAge")?{maxAge:Number(form.get("maxAge"))}:{}),
    ...Object.fromEntries(["gender","city","region","country","education","communicationStyle","sameLocation"].filter(key=>form.get(key)).map(key=>[key,String(form.get(key))])),
    ...(form.get("minSharedInterests")?{minSharedInterests:Number(form.get("minSharedInterests"))}:{}),
    goals:form.get("goal")?[String(form.get("goal"))]:[],lifestyle:form.get("lifestyle")?[String(form.get("lifestyle"))]:[],
    interests:String(form.get("interests")??"").split(",").map(v=>v.trim()).filter(Boolean),
  });
  return {filters,query:String(form.get("query")??"").trim()};
}
export function SearchControls({relative=false,prefix}:{relative?:boolean;prefix:string}){
  return <><label htmlFor={prefix+"-query"}>Natural-language search<textarea id={prefix+"-query"} className="control" name="query" rows={2} maxLength={300} placeholder="Show active profiles who want a long-term relationship" /></label><p className="muted small">Supported terms: active profiles, ages 25 to 40, long-term, marriage, companionship, exploring, non-smoker, vegetarian, early riser, night owl, travel, social{relative?", same city/region/country, share at least two interests":""}. Personal or unrecognized text stays local and produces no broadened results. Gender is a structured exact-value filter.</p><details className="search-filter-details"><summary>Structured filters</summary><div className="form-grid"><label>Minimum age<TextInput type="number" name="minAge" min={18} max={120} /></label><label>Maximum age<TextInput type="number" name="maxAge" min={18} max={120} /></label>{[["gender","Reported gender"],["city","City"],["region","Region"],["country","Country"],["education","Education"],["communicationStyle","Communication style"]] .map(([name,label])=><label key={name}>{label}<TextInput name={name} maxLength={80} /></label>)}<label>Relationship goal<select className="control" name="goal"><option value="">Any recorded goal</option>{goals.map(g=><option key={g} value={g}>{g.replaceAll("_"," ").toLowerCase()}</option>)}</select></label><label>Lifestyle filter<select className="control" name="lifestyle"><option value="">Any recorded lifestyle</option>{lifestyles.map(g=><option key={g} value={g}>{g.replaceAll("_"," ").toLowerCase()}</option>)}</select></label><label>Required interests (comma-separated)<TextInput name="interests" maxLength={500} /></label>{relative&&<><label>Same location as source<select className="control" name="sameLocation"><option value="">No relative location filter</option><option value="CITY">City</option><option value="REGION">Region</option><option value="COUNTRY">Country</option></select></label><label>Minimum shared interests<TextInput type="number" name="minSharedInterests" min={1} max={12} /></label></>}</div></details></>;
}
