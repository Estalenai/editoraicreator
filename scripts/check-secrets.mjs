#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import fs from "node:fs";

const stagedOnly = process.argv.includes("--staged");

function git(args) {
  return execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
}

function listFiles() {
  const args = stagedOnly
    ? ["diff", "--cached", "--name-only", "--diff-filter=ACMR", "-z"]
    : ["ls-files", "-z"];
  return git(args).split("\0").filter(Boolean);
}

function isEnvLike(file) {
  return /(^|\/)(\.env(\..*)?|.*\.(json|ya?ml|toml|ini|conf|txt))$/i.test(file);
}

const blockedPathRules = [
  { reason: "token.txt must never be committed", pattern: /(^|\/)token\.txt$/i },
  { reason: "*.token files must never be committed", pattern: /\.token$/i },
  { reason: ".vercel metadata must not be committed", pattern: /(^|\/)\.vercel(\/|$)/i },
  { reason: ".env files with real values must not be committed", pattern: /(^|\/)\.env$/i },
  { reason: ".env.local files must not be committed", pattern: /(^|\/)\.env\.local$/i },
  { reason: ".env.production files must not be committed", pattern: /(^|\/)\.env\.production$/i },
  { reason: ".env.development files must not be committed", pattern: /(^|\/)\.env\.development$/i },
  { reason: "private key or certificate files must not be committed", pattern: /\.(pem|key|p12|pfx|crt)$/i }
];

const genericContentRules = [
  { reason: "possible JWT token", pattern: /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/ },
  { reason: "possible GitHub token", pattern: /(ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})/ },
  { reason: "possible Stripe secret key", pattern: /sk_(live|test)_[A-Za-z0-9]{16,}/ },
  { reason: "private key material", pattern: /BEGIN [A-Z ]+PRIVATE KEY/ }
];

const envAssignmentRules = [
  { reason: "service role key assigned in env-like file", pattern: /(^|\n)\s*SUPABASE_SERVICE_ROLE_KEY\s*=\s*[^\s#]+/m },
  { reason: "Stripe secret assigned in env-like file", pattern: /(^|\n)\s*STRIPE_SECRET_KEY\s*=\s*[^\s#]+/m },
  { reason: "OpenAI key assigned in env-like file", pattern: /(^|\n)\s*OPENAI_API_KEY\s*=\s*[^\s#]+/m },
  { reason: "Anthropic key assigned in env-like file", pattern: /(^|\n)\s*ANTHROPIC_API_KEY\s*=\s*[^\s#]+/m },
  { reason: "JWT secret assigned in env-like file", pattern: /(^|\n)\s*JWT_SECRET\s*=\s*[^\s#]+/m }
];

const issues = [];
for (const file of listFiles()) {
  const normalized = file.replace(/\\/g, "/");
  for (const rule of blockedPathRules) {
    if (rule.pattern.test(normalized)) {
      issues.push(`${normalized}: ${rule.reason}`);
      break;
    }
  }

  if (!fs.existsSync(file) || fs.statSync(file).size > 1024 * 1024) continue;
  const buffer = fs.readFileSync(file);
  if (buffer.includes(0)) continue;
  const text = buffer.toString("utf8");

  for (const rule of genericContentRules) {
    if (rule.pattern.test(text)) {
      issues.push(`${normalized}: ${rule.reason}`);
    }
  }

  if (isEnvLike(normalized) && !normalized.endsWith('.env.example') && !normalized.endsWith('.env.examplenode')) {
    for (const rule of envAssignmentRules) {
      if (rule.pattern.test(text)) {
        issues.push(`${normalized}: ${rule.reason}`);
      }
    }
  }
}

if (issues.length > 0) {
  console.error("Secret scan failed:");
  for (const issue of [...new Set(issues)]) {
    console.error(`- ${issue}`);
  }
  process.exit(1);
}

console.log(stagedOnly ? "Secret scan passed for staged files." : "Secret scan passed.");
