import "server-only";

import { COMMON_ROLES, DEGREES, WORK_MODES } from "@/lib/candidate-vocab";
import { roleFamilyFor } from "@/features/hire/role-family";

/**
 * Stage 4 — canonicalize both sides of a comparison.
 *
 * Pure. The alias table is an argument; the one function that loads it from
 * Prisma lives in `track-loaders.ts`. Runtime lookup is a static map. Ranking
 * stays deterministic.
 */

export type SkillAliasRow = {
  slug: string;
  name: string;
  aliases: string[];
};

/** Fold punctuation/case so "React.js", "reactjs" and "React" share a key. */
export function foldToken(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/\.js$/i, "js")
    .replace(/[^a-z0-9+#]+/g, "");
}

/**
 * Curated leftovers — what `Skill.aliases` and the profile vocabularies miss.
 * Authored offline; never produced by a model at runtime.
 */
export const ALIASES: Record<string, string> = {
  react: "skill.react",
  reactjs: "skill.react",
  reactnative: "skill.react",
  node: "skill.node",
  nodejs: "skill.node",
  nodejsjs: "skill.node",
  javascript: "skill.javascript",
  js: "skill.javascript",
  typescript: "skill.typescript",
  ts: "skill.typescript",
  python: "skill.python",
  py: "skill.python",
  postgres: "skill.postgres",
  postgresql: "skill.postgres",
  psql: "skill.postgres",
  golang: "skill.go",
  go: "skill.go",
  k8s: "skill.kubernetes",
  kubernetes: "skill.kubernetes",
  tf: "skill.tensorflow",
  tensorflow: "skill.tensorflow",
  pytorch: "skill.pytorch",
  langchain: "skill.langchain",
  langgraph: "skill.langgraph",
  nextjs: "skill.nextjs",
  next: "skill.nextjs",
  expressjs: "skill.express",
  express: "skill.express",
  mongodb: "skill.mongodb",
  mongo: "skill.mongodb",
  mysql: "skill.mysql",
  redis: "skill.redis",
  aws: "skill.aws",
  gcp: "skill.gcp",
  azure: "skill.azure",
  docker: "skill.docker",
  sql: "skill.sql",
  java: "skill.java",
  cpp: "skill.cpp",
  cplusplus: "skill.cpp",
  csharp: "skill.csharp",
  "c#": "skill.csharp",
  html: "skill.html",
  css: "skill.css",
  django: "skill.django",
  flask: "skill.flask",
  fastapi: "skill.fastapi",
  pandas: "skill.pandas",
  numpy: "skill.numpy",
  spark: "skill.spark",
  airflow: "skill.airflow",
  databricks: "skill.databricks",

  sde: "role.software_engineer",
  softwaredeveloper: "role.software_engineer",
  softwareengineer: "role.software_engineer",
  softwareeng: "role.software_engineer",
  swe: "role.software_engineer",
  backendengineer: "role.software_engineer",
  backenddeveloper: "role.software_engineer",
  backend: "role.software_engineer",
  backenddev: "role.software_engineer",
  frontendengineer: "role.frontend",
  frontenddeveloper: "role.frontend",
  frontend: "role.frontend",
  fullstackengineer: "role.fullstack",
  fullstackdeveloper: "role.fullstack",
  fullstack: "role.fullstack",
  dataanalyst: "role.data_analyst",
  dataengineer: "role.data_engineer",
  datascientist: "role.data_scientist",
  mlengineer: "role.ml_engineer",
  machinelearningengineer: "role.ml_engineer",
  aiengineer: "role.ml_engineer",
  productmanager: "role.product_manager",
  engineeringmanager: "role.engineering_manager",
  seniormanager: "role.manager",
  manager: "role.manager",
  vp: "role.vp",
  vicepresident: "role.vp",
  svp: "role.vp",
  director: "role.director",

  intern: "seniority.intern",
  internship: "seniority.intern",
  junior: "seniority.junior",
  jr: "seniority.junior",
  mid: "seniority.mid",
  midlevel: "seniority.mid",
  senior: "seniority.senior",
  sr: "seniority.senior",
  lead: "seniority.lead",
  principal: "seniority.lead",
  staff: "seniority.lead",
  vplevel: "seniority.vp",

  remote: "workmode.remote",
  hybrid: "workmode.hybrid",
  onsite: "workmode.onsite",
  onsitework: "workmode.onsite",
  flexible: "workmode.flexible",

  delhi: "loc.delhi",
  newdelhi: "loc.delhi",
  ncr: "loc.delhi",
  bangalore: "loc.bengaluru",
  bengaluru: "loc.bengaluru",
  mumbai: "loc.mumbai",
  bombay: "loc.mumbai",
  hyderabad: "loc.hyderabad",
  pune: "loc.pune",
  chennai: "loc.chennai",
  kolkata: "loc.kolkata",
  gurgaon: "loc.gurugram",
  gurugram: "loc.gurugram",
  noida: "loc.noida",
};

function seedFromVocab(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const role of COMMON_ROLES) {
    const folded = foldToken(role);
    const slug =
      ALIASES[folded] ??
      `role.${folded.replace(/engineer$|developer$|intern$/, "") || folded}`;
    out[folded] = slug.startsWith("role.") ? slug : `role.${folded}`;
  }
  for (const degree of DEGREES) {
    out[foldToken(degree)] = `edu.${foldToken(degree)}`;
  }
  for (const mode of WORK_MODES) {
    const folded = foldToken(mode);
    out[folded] = ALIASES[folded] ?? `workmode.${folded}`;
  }
  return out;
}

const VOCAB_SEED = seedFromVocab();

function lookupMap(table: SkillAliasRow[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const [k, v] of Object.entries(VOCAB_SEED)) map.set(k, v);
  for (const [k, v] of Object.entries(ALIASES)) map.set(k, v);
  for (const row of table) {
    const slug = row.slug.startsWith("skill.") ? row.slug : `skill.${row.slug}`;
    map.set(foldToken(row.slug), slug);
    map.set(foldToken(row.name), slug);
    for (const alias of row.aliases) {
      const f = foldToken(alias);
      if (f) map.set(f, slug);
    }
  }
  return map;
}

/**
 * Canonical slug for a token. An unknown token survives unchanged rather than
 * being dropped — we would rather compare "graphql" to "graphql" than lose it.
 */
export function canonicalize(
  raw: string,
  table: SkillAliasRow[],
  prefix?: "skill" | "role" | "seniority" | "edu" | "workmode" | "loc",
): string {
  const folded = foldToken(raw);
  if (!folded) return raw.trim();
  const hit = lookupMap(table).get(folded);
  if (hit) return hit;
  if (prefix) return `${prefix}.${folded}`;
  return folded;
}

export function canonicalizeSkill(raw: string, table: SkillAliasRow[]): string {
  return canonicalize(raw, table, "skill");
}

export function canonicalizeRole(raw: string, table: SkillAliasRow[]): string {
  const direct = canonicalize(raw, table, "role");
  if (direct.startsWith("role.")) return direct;
  // Fallback bucket for titles the canon misses — not the primary comparison.
  const family = roleFamilyFor(raw);
  if (family !== "OTHER" && family !== "STUDENT") {
    return `role.family.${family.toLowerCase()}`;
  }
  return direct;
}

export function canonicalizeSeniority(raw: string, table: SkillAliasRow[]): string {
  return canonicalize(raw, table, "seniority");
}

export function canonicalizeDegree(raw: string, table: SkillAliasRow[]): string {
  return canonicalize(raw, table, "edu");
}

export function canonicalizeWorkMode(raw: string, table: SkillAliasRow[]): string {
  return canonicalize(raw, table, "workmode");
}

export function canonicalizeLocation(raw: string, table: SkillAliasRow[]): string {
  return canonicalize(raw, table, "loc");
}

export const __test = { foldToken, lookupMap };
