#!/usr/bin/env node
// Pair the copy of Canopy on THIS machine with a page on the deployed site, so the chat you
// type there is answered by your own Claude Code. Nothing is sent to the deployer's computer:
// the browser talks to this process over loopback, and the pairing code never leaves your
// machine except when you paste it into your own browser.
//
//   npm run pair                      # pair with the default site, on port 3000
//   npm run pair -- --origin https://example.com --port 4000
//   npm run pair -- --dev             # run the dev server instead of the built app

import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";

const DEFAULT_ORIGIN = "https://climate-hackathon-2026.vercel.app";

export function parseArgs(argv) {
  const args = { origin: DEFAULT_ORIGIN, port: "3000", dev: false };
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    if (flag === "--dev") args.dev = true;
    else if (flag === "--origin") args.origin = argv[++i] ?? args.origin;
    else if (flag === "--port") args.port = argv[++i] ?? args.port;
  }
  return args;
}

/** Only an https site (or a local one you are developing against) may be paired with. */
export function checkOrigin(value) {
  let url;
  try { url = new URL(value); } catch { return "That origin is not a URL."; }
  if (url.pathname !== "/" || url.search || url.hash) return "Give just the site's origin, with no path.";
  const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (url.protocol !== "https:" && !loopback) return "Pair only with an https site.";
  return null;
}

export const connectCode = (port, token) => `http://127.0.0.1:${port}#${token}`;

function main() {
  const args = parseArgs(process.argv.slice(2));
  const problem = checkOrigin(args.origin);
  if (problem) { console.error(`${problem}\n`); process.exit(1); }
  const origin = new URL(args.origin).origin;
  const token = randomBytes(24).toString("base64url");

  console.log(`\n  Canopy is pairing with ${origin}\n`);
  console.log("  1. Open that site and choose \"Use my own Claude Code\".");
  console.log("  2. Paste this code:\n");
  console.log(`     ${connectCode(args.port, token)}\n`);
  console.log("  3. Your browser will ask to let the site reach your local network. Allow it.\n");
  console.log("  The code is a password for this app. Don't share it; it dies when you stop this process.\n");

  const child = spawn("npm", ["run", args.dev ? "dev" : "start", "--", "--port", args.port], {
    stdio: "inherit",
    env: { ...process.env, CANOPY_MODE: "local", CANOPY_ALLOW_ORIGIN: origin, CANOPY_PAIR_TOKEN: token },
  });
  child.on("exit", (code) => process.exit(code ?? 0));
}

if (import.meta.url === `file://${process.argv[1]}`) main();
