#!/usr/bin/env node
// Copies .env.<name> over .env so Expo picks it up. Used by the
// `npm run start:staging` / `npm run start:production` scripts. Works the
// same way on Windows, macOS, and Linux -- no shell-specific env var syntax.

const fs = require("fs");
const path = require("path");

const name = process.argv[2];

if (!name) {
  console.error("Usage: node scripts/select-env.js <staging|production>");
  process.exit(1);
}

const root = path.resolve(__dirname, "..");
const source = path.join(root, `.env.${name}`);
const destination = path.join(root, ".env");

if (!fs.existsSync(source)) {
  console.error(`Missing ${path.basename(source)}.`);
  console.error(`Copy .env.${name}.example to .env.${name}, fill in real values, and try again.`);
  process.exit(1);
}

fs.copyFileSync(source, destination);
console.log(`Using .env.${name} -> .env`);
