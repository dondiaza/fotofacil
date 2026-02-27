import assert from "node:assert/strict";
import test from "node:test";
import { parseResponseJson } from "@/lib/client-json";

test("parseResponseJson returns parsed payload for valid JSON", async () => {
  const response = new Response(JSON.stringify({ ok: true, count: 2 }), {
    status: 200,
    headers: { "Content-Type": "application/json" }
  });
  const json = await parseResponseJson<{ ok: boolean; count: number }>(response);
  assert.deepEqual(json, { ok: true, count: 2 });
});

test("parseResponseJson returns null for empty or invalid JSON payload", async () => {
  const empty = await parseResponseJson(new Response("", { status: 200 }));
  assert.equal(empty, null);

  const invalid = await parseResponseJson(new Response("{", { status: 200 }));
  assert.equal(invalid, null);
});
