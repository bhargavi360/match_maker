import fs from "node:fs";
import crypto from "node:crypto";
if (fs.existsSync(".env.local")) throw new Error(".env.local already exists; review it manually. Nothing was overwritten.");
const lines = [
  "BETTER_AUTH_URL=http://127.0.0.1:3100",
  "BETTER_AUTH_SECRET=" + crypto.randomBytes(32).toString("hex"),
  "MATCHMAKER_SETUP_TOKEN=" + crypto.randomBytes(32).toString("hex"),
  "CONTACT_ENCRYPTION_KEY=" + crypto.randomBytes(32).toString("base64"),
  "CONTACT_KEY_ID=local-v1",
];
fs.writeFileSync(".env.local", lines.join("\n") + "\n", { flag: "wx", mode: 0o600 });
console.log("Fresh development configuration created in ignored .env.local. Secrets were not printed. Keep this file private.");
