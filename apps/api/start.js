import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const rootEnvPath = path.resolve(__dirname, "../../.env");
const apiEnvPath = path.resolve(__dirname, ".env");

// Load repo-root env first when present, then force apps/api/.env to win for
// API-local billing and integration wiring. This avoids stale shell/root values
// keeping legacy Stripe test price ids alive in runtime.
if (fs.existsSync(rootEnvPath)) {
  dotenv.config({ path: rootEnvPath });
}

if (fs.existsSync(apiEnvPath)) {
  dotenv.config({ path: apiEnvPath, override: true });
}

await import("./server.js");
