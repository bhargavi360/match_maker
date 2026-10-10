import { z } from "zod";
import { goals,lifestyles } from "./validation";
import { normalize,normalizedSet,type MatchingPerson } from "./matching";
const optional = z.string().trim().min(1).max(80).optional();
export const searchFiltersSchema=z.strictObject({
  minAge:z.number().int().min(18).max(120).optional(),maxAge:z.number().int().min(18).max(120).optional(),
  gender:z.string().trim().min(1).max(80).optional(),city:optional,region:optional,country:optional,education:optional,communicationStyle:optional,
  goals:z.array(z.enum(goals)).max(4).default([]),interests:z.array(z.string().trim().min(1).max(40)).max(12).default([]),lifestyle:z.array(z.enum(lifestyles)).max(9).default([]),
  sameLocation:z.enum(["CITY","REGION","COUNTRY"]).optional(),minSharedInterests:z.number().int().min(1).max(12).optional(),
}).refine(v=>v.minAge===undefined||v.maxAge===undefined||v.minAge<=v.maxAge,{message:"Maximum age must be at least the minimum.",path:["maxAge"]});
export type SearchFilters=z.infer<typeof searchFiltersSchema>;
export type Interpretation={recognized:boolean;filters:SearchFilters;source:"Local fallback"|"Gemini interpretation";message:string;safeQuery:string|null};
// Only this small grammar may leave the server. Arbitrary text is never forwarded.
export function interpretLocal(raw:string):Interpretation{
  let text=normalize(raw).replace(/[.,?!]/g," ").replace(/-/g," ").replace(/\s+/g," ").trim();
  const filters:Record<string,unknown>={},clauses:string[]=[];
  function take(pattern:RegExp,apply:(match:RegExpMatchArray)=>void){const match=text.match(pattern);if(match){apply(match);text=text.replace(match[0]," ");}}
  take(/\b(?:aged?|ages?|between)\s+(\d{2,3})\s*(?:to|and)\s*(\d{2,3})\b/,m=>{filters.minAge=Number(m[1]);filters.maxAge=Number(m[2]);clauses.push("age "+m[1]+" to "+m[2]);});
  take(/\bsame\s+(city|region|country)\b/,m=>{filters.sameLocation=m[1].toUpperCase();clauses.push("same "+m[1]);});
  take(/\b(?:share|sharing)\s+(?:at least\s+)?(one|two|three|\d{1,2})\s+(?:shared\s+)?interests?\b/,m=>{filters.minSharedInterests=Number(({one:1,two:2,three:3} as Record<string,number>)[m[1]]??m[1]);clauses.push("share at least "+filters.minSharedInterests+" interests");});
  const desiredGoals:string[]=[];
  for(const [phrase,value] of [["long term relationship","LONG_TERM"],["long term","LONG_TERM"],["marriage","MARRIAGE"],["companionship","COMPANIONSHIP"],["exploring","EXPLORING"]] as const){if(text.includes(phrase)){text=text.replace(phrase," ");desiredGoals.push(value);clauses.push(phrase);}}
  if(desiredGoals.length)filters.goals=[...new Set(desiredGoals)];
  const wantedLifestyle:string[]=[];
  for(const [phrase,value] of [["non smoker","NON_SMOKER"],["vegetarian","VEGETARIAN"],["early riser","EARLY_RISER"],["night owl","NIGHT_OWL"],["home oriented","HOME_ORIENTED"],["travel","TRAVEL"],["social","SOCIAL"]] as const){if(text.includes(phrase)){text=text.replace(phrase," ");wantedLifestyle.push(value);clauses.push(phrase);}}
  if(wantedLifestyle.length)filters.lifestyle=wantedLifestyle;
  const active=/\bactive\b/.test(text);text=text.replace(/\bactive\b/g," ");
  text=text.replace(/\b(show|find|me|profiles|people|adults|in|the|who|want|wants|a|an|and|with|for|are|is|have|please|of)\b/g," ").replace(/\s+/g," ").trim();
  const validated=searchFiltersSchema.safeParse(filters);
  const recognized=!text&&validated.success&&(active||clauses.length>0);
  return {recognized,filters:recognized?validated.data:searchFiltersSchema.parse({}),source:"Local fallback",message:recognized?"Applied the recognized local terms; matching uses active profiles only.":"No reliable interpretation was found. No results were broadened. Use structured filters or the supported example.",safeQuery:recognized?"Show active profiles"+(clauses.length?" with "+clauses.join(" and "):""):null};
}
export function matchesFilters(person:MatchingPerson,filters:SearchFilters,source?:MatchingPerson){
  if(filters.minAge!==undefined&&(person.reportedAge===null||person.reportedAge<filters.minAge))return false;
  if(filters.maxAge!==undefined&&(person.reportedAge===null||person.reportedAge>filters.maxAge))return false;
  if(filters.gender&&(!person.gender||normalize(filters.gender)!==normalize(person.gender)))return false;
  for(const key of ["city","region","country","education","communicationStyle"] as const)if(filters[key]&&(!person[key]||normalize(filters[key])!==normalize(person[key]!)))return false;
  if(filters.goals.length&&!filters.goals.some(g=>person.relationshipGoals.includes(g)))return false;
  if(filters.interests.length&&!normalizedSet(filters.interests).every(v=>normalizedSet(person.interests).includes(v)))return false;
  if(filters.lifestyle.length&&!filters.lifestyle.every(v=>person.lifestyle.includes(v)))return false;
  if(filters.sameLocation){const key=filters.sameLocation.toLowerCase() as "city"|"region"|"country";if(!source?.[key]||!person[key]||normalize(source[key]!)!==normalize(person[key]!))return false;}
  if(filters.minSharedInterests){if(!source||normalizedSet(source.interests).filter(v=>normalizedSet(person.interests).includes(v)).length<filters.minSharedInterests)return false;}
  return true;
}
