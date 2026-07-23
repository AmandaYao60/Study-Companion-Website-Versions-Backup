import test from "node:test";
import assert from "node:assert/strict";

import {
  appendDebugLogMessage,
  formatSanitizedDebugLog,
  sanitizeDebugLogMessage,
} from "./debugEventLog.js";

test("debug event log sanitizes secrets and stack frames", () => {
  const message = sanitizeDebugLogMessage("Camera failed\n    at internal(file.js:10)\naccess_token=abc123 Bearer secret-token");

  assert.equal(message.includes("internal(file.js"), false);
  assert.equal(message.includes("abc123"), false);
  assert.equal(message.includes("secret-token"), false);
  assert.match(message, /access_token=\[redacted\]/);
  assert.match(message, /Bearer \[redacted\]/);
});

test("debug event log keeps capacity and coalesces immediate duplicates", () => {
  let nowMs = 1000;
  const now = () => nowMs;
  let entries = [];

  entries = appendDebugLogMessage(entries, "Camera ready", "success", { now });
  nowMs += 250;
  entries = appendDebugLogMessage(entries, "Camera ready", "success", { now });

  assert.equal(entries.length, 1);
  assert.equal(entries[0].count, 2);

  for (let index = 0; index < 110; index += 1) {
    nowMs += 1500;
    entries = appendDebugLogMessage(entries, `Event ${index}`, "debug", { now });
  }

  assert.equal(entries.length, 100);
  assert.equal(entries[0].message, "Event 109");
});

test("formatted sanitized log never emits unsanitized message text", () => {
  const entries = appendDebugLogMessage([], "password=hunter2", "error", { now: () => 2000 });
  const text = formatSanitizedDebugLog(entries);

  assert.equal(text.includes("hunter2"), false);
  assert.match(text, /password=\[redacted\]/);
});
