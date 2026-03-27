#!/usr/bin/env node

process.env.EAC_CAPTURE_FORCE_STABLE = process.env.EAC_CAPTURE_FORCE_STABLE || "1";

if (!process.argv.includes("--route")) {
  process.argv.push("--route", "admin");
}

await import("./capture-postdeploy-validation.mjs");
