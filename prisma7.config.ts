import nextEnv from "@next/env";
const { loadEnvConfig } = nextEnv;
import { defineConfig } from "prisma/config";
import { databasePath } from "./src/server/config";
loadEnvConfig(process.cwd());
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations/sqlite" },
  datasource: { url: "file:" + databasePath().split(String.fromCharCode(92)).join("/") },
});
