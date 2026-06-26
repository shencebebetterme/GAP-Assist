"use strict";

const assert = require("assert");
const path = require("path");
const { GapLanguageServerClient } = require("../src/lspClient");

const root = path.resolve(__dirname, "..");
const serverPath = path.join(root, "server", "lsp-server.js");

function createDocument(uri, languageId, version, getText) {
  return {
    uri: {
      toString: () => uri
    },
    languageId,
    version,
    getText
  };
}

async function main() {
  const client = new GapLanguageServerClient(serverPath, {
    cwd: root,
    timeoutMs: 5000
  });

  try {
    let text = [
      "G := SymmetricGroup(4);",
      "uses := function(obj)",
      "    return Size(obj);",
      "end;",
      "uses(G);",
      ""
    ].join("\n");

    const document = createDocument("memory://client-test.g", "gap", 1, () => text);
    const groupHover = await client.hover(document, { line: 0, character: 1 });
    assert(groupHover.contents.value.includes("IsPermGroup"), "client hover should return server inference for variables");

    const functionHover = await client.hover(document, { line: 1, character: 1 });
    assert(functionHover.contents.value.includes("Input filters"), "client hover should return function input filters");
    assert(functionHover.contents.value.includes("IsListOrCollection"), "client hover should include body-derived filters");
    assert(functionHover.contents.value.includes("IsPermGroup"), "client hover should include call-site filters");

    text = text.replace("SymmetricGroup(4)", "[1, 2, 3]");
    document.version = 2;

    const updatedHover = await client.hover(document, { line: 0, character: 1 });
    assert(updatedHover.contents.value.includes("IsList"), "client should synchronize changed documents");
  } finally {
    await client.dispose();
  }

  console.log("LSP client smoke test passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
