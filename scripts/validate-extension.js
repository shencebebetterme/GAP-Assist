"use strict";

const fs = require("fs");
const path = require("path");
const { getEntries, isIdentifier } = require("../src/docs");

const ROOT = path.resolve(__dirname, "..");
const REQUIRED_FILES = [
  "package.json",
  "language-configuration.json",
  "syntaxes/gap.tmLanguage.json",
  "src/docs.js",
  "src/extension.js",
  "data/gap-docs.json"
];

function main() {
  const failures = [];

  for (const file of REQUIRED_FILES) {
    if (!fs.existsSync(path.join(ROOT, file))) {
      failures.push(`Missing required file: ${file}`);
    }
  }

  const packageJson = readJson("package.json", failures);
  const languageConfiguration = readJson("language-configuration.json", failures);
  const grammar = readJson("syntaxes/gap.tmLanguage.json", failures);
  const docs = readJson("data/gap-docs.json", failures);

  if (packageJson) {
    if (packageJson.main !== "./src/extension.js") {
      failures.push("package.json main must point to ./src/extension.js");
    }
    if (!packageJson.contributes || !Array.isArray(packageJson.contributes.languages)) {
      failures.push("package.json must contribute a GAP language");
    }
    if (!packageJson.contributes || !Array.isArray(packageJson.contributes.grammars)) {
      failures.push("package.json must contribute a TextMate grammar");
    }
  }

  if (languageConfiguration && !languageConfiguration.comments) {
    failures.push("language-configuration.json must define comments");
  }

  if (grammar) {
    if (grammar.scopeName !== "source.gap") {
      failures.push("GAP grammar scopeName must be source.gap");
    }
    if (!Array.isArray(grammar.patterns) || !grammar.repository) {
      failures.push("GAP grammar must contain patterns and repository");
    }
  }

  if (docs) {
    validateDocs(docs, failures);
  }

  if (failures.length > 0) {
    for (const failure of failures) {
      console.error(`- ${failure}`);
    }
    process.exit(1);
  }

  console.log(`Validated GAP extension files.`);
  console.log(`Documentation names: ${docs.names.length}`);
  console.log(`Reference entries: ${Object.values(docs.entries).reduce((sum, entries) => sum + entries.length, 0)}`);
}

function validateDocs(docs, failures) {
  if (!docs.entries || typeof docs.entries !== "object") {
    failures.push("data/gap-docs.json must contain an entries object");
    return;
  }

  if (!Array.isArray(docs.names) || docs.names.length < 500) {
    failures.push("data/gap-docs.json should contain at least 500 documented GAP names");
    return;
  }

  for (const required of ["NameFunction", "DeclareOperation", "Size", "IsGroup"]) {
    const entries = getEntries(docs, required);
    if (!entries || entries.length === 0) {
      failures.push(`Missing required GAP documentation entry: ${required}`);
      continue;
    }
    if (!entries[0].signature || !entries[0].description) {
      failures.push(`Documentation entry ${required} must have a signature and description`);
    }
  }

  const identifierNames = docs.names.filter(isIdentifier);
  if (identifierNames.length < 400) {
    failures.push("Too few identifier-like GAP symbols for semantic highlighting");
  }
}

function readJson(relativePath, failures) {
  const fullPath = path.join(ROOT, relativePath);
  try {
    return JSON.parse(fs.readFileSync(fullPath, "utf8"));
  } catch (error) {
    failures.push(`${relativePath} is not valid JSON: ${error.message}`);
    return undefined;
  }
}

main();
