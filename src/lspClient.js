"use strict";

const childProcess = require("child_process");
const path = require("path");

class GapLanguageServerClient {
  constructor(serverPath, options = {}) {
    this.serverPath = serverPath;
    this.cwd = options.cwd || path.resolve(serverPath, "..", "..");
    this.timeoutMs = options.timeoutMs || 5000;
    this.process = undefined;
    this.nextId = 1;
    this.pending = new Map();
    this.syncedDocuments = new Map();
    this.buffer = Buffer.alloc(0);
    this.initializePromise = undefined;
    this.disposed = false;
  }

  async hover(document, position) {
    await this.ensureStarted();
    this.syncDocument(document);

    return this.sendRequest("textDocument/hover", {
      textDocument: {
        uri: document.uri.toString()
      },
      position: {
        line: position.line,
        character: position.character
      }
    });
  }

  async ensureStarted() {
    if (this.disposed) {
      throw new Error("GAP language server client has been disposed");
    }

    if (this.initializePromise) {
      return this.initializePromise;
    }

    this.process = childProcess.spawn(process.execPath, [this.serverPath], {
      cwd: this.cwd,
      env: {
        ...process.env,
        ELECTRON_RUN_AS_NODE: "1"
      },
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true
    });

    this.process.stdout.on("data", (chunk) => {
      this.buffer = Buffer.concat([this.buffer, chunk]);
      this.drainMessages();
    });

    this.process.stderr.on("data", () => {
      // The server is intentionally quiet; keep stderr from surfacing in hover UI.
    });

    this.process.on("exit", () => {
      this.rejectAllPending(new Error("GAP language server exited"));
      this.process = undefined;
      this.initializePromise = undefined;
      this.syncedDocuments.clear();
    });

    this.initializePromise = this.sendRequest("initialize", {
      processId: process.pid,
      rootUri: null,
      capabilities: {}
    }).then((result) => {
      this.sendNotification("initialized", {});
      return result;
    });

    return this.initializePromise;
  }

  syncDocument(document) {
    const uri = document.uri.toString();
    const version = typeof document.version === "number" ? document.version : 0;
    const text = document.getText();
    const previous = this.syncedDocuments.get(uri);

    if (!previous) {
      this.sendNotification("textDocument/didOpen", {
        textDocument: {
          uri,
          languageId: document.languageId || "gap",
          version,
          text
        }
      });
      this.syncedDocuments.set(uri, { version, text });
      return;
    }

    if (previous.version === version && previous.text === text) {
      return;
    }

    this.sendNotification("textDocument/didChange", {
      textDocument: {
        uri,
        version
      },
      contentChanges: [
        {
          text
        }
      ]
    });
    this.syncedDocuments.set(uri, { version, text });
  }

  sendRequest(method, params) {
    const id = this.nextId;
    this.nextId += 1;

    const promise = new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Timed out waiting for ${method}`));
      }, this.timeoutMs);

      this.pending.set(id, {
        method,
        resolve,
        reject,
        timer
      });
    });

    this.writeMessage({
      jsonrpc: "2.0",
      id,
      method,
      params
    });

    return promise;
  }

  sendNotification(method, params) {
    this.writeMessage({
      jsonrpc: "2.0",
      method,
      params
    });
  }

  drainMessages() {
    while (true) {
      const headerEnd = this.buffer.indexOf("\r\n\r\n");
      if (headerEnd < 0) {
        return;
      }

      const header = this.buffer.slice(0, headerEnd).toString("utf8");
      const lengthMatch = /Content-Length:\s*(\d+)/i.exec(header);
      if (!lengthMatch) {
        this.buffer = Buffer.alloc(0);
        this.rejectAllPending(new Error("GAP language server returned an invalid LSP header"));
        return;
      }

      const length = Number.parseInt(lengthMatch[1], 10);
      const start = headerEnd + 4;
      const end = start + length;
      if (this.buffer.length < end) {
        return;
      }

      const message = JSON.parse(this.buffer.slice(start, end).toString("utf8"));
      this.buffer = this.buffer.slice(end);
      this.handleMessage(message);
    }
  }

  handleMessage(message) {
    if (message.id === undefined) {
      return;
    }

    const pending = this.pending.get(message.id);
    if (!pending) {
      return;
    }

    clearTimeout(pending.timer);
    this.pending.delete(message.id);

    if (message.error) {
      pending.reject(new Error(message.error.message || `LSP request ${pending.method} failed`));
      return;
    }

    pending.resolve(message.result);
  }

  writeMessage(message) {
    if (!this.process || !this.process.stdin.writable) {
      throw new Error("GAP language server is not running");
    }

    const payload = JSON.stringify(message);
    this.process.stdin.write(`Content-Length: ${Buffer.byteLength(payload, "utf8")}\r\n\r\n${payload}`);
  }

  rejectAllPending(error) {
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(error);
    }
    this.pending.clear();
  }

  async dispose() {
    this.disposed = true;

    if (!this.process) {
      return;
    }

    try {
      await this.sendRequest("shutdown", null);
      this.sendNotification("exit", null);
    } catch (_) {
      this.process.kill();
    } finally {
      this.process = undefined;
      this.syncedDocuments.clear();
    }
  }
}

module.exports = {
  GapLanguageServerClient
};
