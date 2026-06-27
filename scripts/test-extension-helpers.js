"use strict";

const assert = require("assert");
const Module = require("module");

const originalLoad = Module._load;
Module._load = function patchedLoad(request, parent, isMain) {
  if (request === "vscode") {
    return {
      SemanticTokensLegend: class SemanticTokensLegend {},
      SemanticTokensBuilder: class SemanticTokensBuilder {
        build() {
          return {};
        }
      },
      MarkdownString: class MarkdownString {
        constructor() {
          this.value = "";
        }

        appendMarkdown(value) {
          this.value += value;
        }

        appendCodeblock(value) {
          this.value += value;
        }

        appendText(value) {
          this.value += value;
        }
      },
      Hover: class Hover {},
      Uri: {
        file: (value) => ({ fsPath: value }),
        parse: (value) => ({ toString: () => value })
      },
      commands: {
        registerCommand: () => ({ dispose() {} })
      },
      env: {
        openExternal: async () => undefined
      },
      languages: {
        registerDocumentSemanticTokensProvider: () => ({ dispose() {} }),
        registerHoverProvider: () => ({ dispose() {} })
      },
      window: {
        showWarningMessage: () => undefined
      },
      workspace: {
        getConfiguration: () => ({
          get: (_key, defaultValue) => defaultValue
        })
      }
    };
  }

  return originalLoad.call(this, request, parent, isMain);
};

try {
  const extension = require("../src/extension");
  assert.deepStrictEqual(extension.__test.groupEntries(undefined), [], "undocumented inferred symbols should not crash hover grouping");
  assert.deepStrictEqual(extension.__test.groupEntries([]), [], "empty documentation entries should group to an empty list");

  const config = {
    get(key, defaultValue) {
      if (key === "gapInstallationPath") {
        return "C:\\GAP";
      }
      return defaultValue;
    }
  };
  assert.strictEqual(
    extension.__test.resolveManualFilePath(
      config,
      { source: {} },
      { file: "chap2.html", manualId: "pkg:digraphs", manualRelativePath: "pkg/digraphs/doc" }
    ),
    "C:\\GAP\\pkg\\digraphs\\doc\\chap2.html",
    "package manual links should resolve under the configured GAP installation"
  );
} finally {
  Module._load = originalLoad;
}

console.log("Extension helper tests passed.");
