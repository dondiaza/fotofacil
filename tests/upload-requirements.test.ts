import test from "node:test";
import assert from "node:assert/strict";
import { evaluateDaySent } from "../src/lib/upload-requirements";

test("evaluateDaySent PHOTO: pending when no required group has photo", () => {
  const result = evaluateDaySent("PHOTO", [], ["ESCAPARATE", "FACHADA"]);
  assert.equal(result.status, "PENDING");
  assert.equal(result.isSent, false);
  assert.deepEqual(result.missingSlots, ["ESCAPARATE", "FACHADA"]);
});

test("evaluateDaySent PHOTO: partial when only one required group has photo", () => {
  const result = evaluateDaySent(
    "PHOTO",
    [{ kind: "PHOTO", slotName: "ESCAPARATE", isCurrentVersion: true }],
    ["ESCAPARATE", "FACHADA"]
  );
  assert.equal(result.status, "PARTIAL");
  assert.equal(result.isSent, false);
  assert.deepEqual(result.missingSlots, ["FACHADA"]);
});

test("evaluateDaySent PHOTO: complete when all required groups have at least one photo", () => {
  const result = evaluateDaySent(
    "PHOTO",
    [
      { kind: "PHOTO", slotName: "ESCAPARATE", isCurrentVersion: true },
      { kind: "PHOTO", slotName: "FACHADA", isCurrentVersion: true }
    ],
    ["ESCAPARATE", "FACHADA"]
  );
  assert.equal(result.status, "COMPLETE");
  assert.equal(result.isSent, true);
  assert.deepEqual(result.missingSlots, []);
});

test("evaluateDaySent BOTH: partial when groups complete but missing video", () => {
  const result = evaluateDaySent(
    "BOTH",
    [
      { kind: "PHOTO", slotName: "ESCAPARATE", isCurrentVersion: true },
      { kind: "PHOTO", slotName: "FACHADA", isCurrentVersion: true }
    ],
    ["ESCAPARATE", "FACHADA"]
  );
  assert.equal(result.status, "PARTIAL");
  assert.equal(result.isSent, false);
  assert.deepEqual(result.missingKinds, ["VIDEO"]);
});
