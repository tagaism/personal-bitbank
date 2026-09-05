import { execSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { stdin } from "node:process";

const STANDALONE = new Set(["main"]);
const TYPES = [
  "feat",
  "fix",
  "docs",
  "style",
  "refactor",
  "perf",
  "test",
  "build",
  "ci",
  "chore",
  "revert",
  "hotfix",
  "release",
];
const BRANCH_PATTERN = new RegExp(
  `^(${TYPES.join("|")})\\/[a-z0-9][a-z0-9._-]*$`,
);

export function isValidBranchName(name) {
  return STANDALONE.has(name) || BRANCH_PATTERN.test(name);
}

export function branchNameError(name) {
  const suggested = `feat/${name}`;
  return [
    `Invalid branch name: "${name}"`,
    "Allowed:",
    "  main",
    "  <type>/<description>  e.g. feat/csv-import, fix/holdings-mismatch",
    `  types: ${TYPES.join(", ")}`,
    "Description must be lowercase kebab-case (letters, numbers, '.', '_', '-').",
    "Git does not run hooks when a branch is created. Rename this branch:",
    `  git branch -m ${suggested}`,
  ].join("\n");
}

function currentBranch() {
  return execSync("git rev-parse --abbrev-ref HEAD", {
    encoding: "utf8",
  }).trim();
}

async function branchesFromPushStdin() {
  const chunks = [];
  for await (const chunk of stdin) chunks.push(chunk);
  const text = Buffer.concat(chunks).toString("utf8").trim();
  if (!text) return [];

  const names = [];
  for (const line of text.split("\n")) {
    const [localRef, localSha] = line.split(" ");
    if (!localRef || !localSha) continue;
    if (/^0+$/.test(localSha)) continue;
    if (!localRef.startsWith("refs/heads/")) continue;
    names.push(localRef.slice("refs/heads/".length));
  }
  return names;
}

function reject(name) {
  console.error(branchNameError(name));
  process.exit(1);
}

export async function main(argv = process.argv.slice(2)) {
  if (argv.includes("--push")) {
    const names = await branchesFromPushStdin();
    const toCheck = names.length > 0 ? names : [currentBranch()];
    for (const name of toCheck) {
      if (name === "HEAD") continue;
      if (!isValidBranchName(name)) reject(name);
    }
    return;
  }

  const name = argv[0] ?? currentBranch();
  if (name === "HEAD") return;
  if (!isValidBranchName(name)) reject(name);
}

const invokedDirectly =
  process.argv[1] !== undefined &&
  fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (invokedDirectly) {
  await main();
}
