import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

// Load env from repo root first (monorepo-friendly), then from local apps/api/.env (override).
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const rootEnv = path.resolve(__dirname, '..', '..', '.env');
// 1) root .env (recommended)
dotenv.config({ path: rootEnv });
// 2) local .env (optional override)
dotenv.config();

// Now boot the actual server (imports that validate env will run after this).
await import('./server.js');
