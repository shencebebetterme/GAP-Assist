"use strict";

const assert = require("assert");
const path = require("path");
const { GapLanguageServerClient } = require("../src/lspClient");

const root = path.resolve(__dirname, "..");
const serverPath = path.join(root, "server", "lsp-server.js");

function hasHoverToken(markdown, value) {
  return markdown.includes(`>${value}</span>`);
}

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
      "n := 5;",
      "m := n + 10;",
      "str := \"hello\";",
      "gens := GeneratorsOfGroup(G);",
      "f := function(n)",
      "    local values;",
      "    values := List([1 .. n], i -> Factorial(i));",
      "    return values;",
      "end;",
      "uses := function(obj)",
      "    return Size(obj);",
      "end;",
      "uses(G);",
      ""
    ].join("\n");

    const document = createDocument("memory://client-test.g", "gap", 1, () => text);
    const groupHover = await client.hover(document, { line: 0, character: 1 });
    assert(hasHoverToken(groupHover.contents.value, "G"), "client hover should return server inference for variables");
    assert(hasHoverToken(groupHover.contents.value, "symmetric permutation group"), "client hover should style inferred group types");
    assert(!groupHover.contents.value.includes("Source:"), "client hover should not include internal source lines");

    const operatorHover = await client.hover(document, { line: 2, character: 1 });
    assert(hasHoverToken(operatorHover.contents.value, "m"), "client hover should infer integer arithmetic");
    assert(hasHoverToken(operatorHover.contents.value, "integer"), "client hover should style integer arithmetic");

    const stringHover = await client.hover(document, { line: 3, character: 1 });
    assert(hasHoverToken(stringHover.contents.value, "str"), "client hover should infer string assignments");
    assert(hasHoverToken(stringHover.contents.value, "string"), "client hover should style string assignments");

    const gensHover = await client.hover(document, { line: 4, character: 1 });
    assert(hasHoverToken(gensHover.contents.value, "gens"), "client hover should return server inference for globals");
    assert(hasHoverToken(gensHover.contents.value, "list of group generators"), "client hover should style global container type");
    assert(hasHoverToken(gensHover.contents.value, "group element"), "client hover should style global container element type");
    assert(hasHoverToken(gensHover.contents.value, "element"), "client hover should include the container element row");

    const localHover = await client.hover(document, { line: 7, character: 6 });
    assert(hasHoverToken(localHover.contents.value, "values"), "client hover should return server inference for local variables");
    assert(hasHoverToken(localHover.contents.value, "list"), "client hover should style local container type");
    assert(hasHoverToken(localHover.contents.value, "positive integer"), "client hover should style local container element type");

    const functionHover = await client.hover(document, { line: 10, character: 1 });
    assert(functionHover.contents.value.includes("vscode-charts-purple"), "client hover should return a highlighted function signature");
    assert(hasHoverToken(functionHover.contents.value, "obj"), "client hover should include the parameter name");
    assert(hasHoverToken(functionHover.contents.value, "list or collection"), "client hover should style body-derived function input requirement");
    assert(!functionHover.contents.value.includes("permutation group"), "client hover should not narrow requirements to one call-site type");
    assert(!functionHover.contents.value.includes("Input filters"), "client hover should not repeat function input filters");
    assert(!functionHover.contents.value.includes("Confidence:"), "client hover should not include confidence lines");

    text = text.replace("SymmetricGroup(4)", "[1, 2, 3]");
    document.version = 2;

    const updatedHover = await client.hover(document, { line: 0, character: 1 });
    assert(hasHoverToken(updatedHover.contents.value, "G"), "client should synchronize changed documents");
    assert(hasHoverToken(updatedHover.contents.value, "list"), "client should synchronize changed documents");
    assert(hasHoverToken(updatedHover.contents.value, "integer"), "client should synchronize changed documents");
  } finally {
    await client.dispose();
  }

  console.log("LSP client smoke test passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
