import test from "node:test";
import assert from "node:assert/strict";
import { buildRequirementLookup, resolveRequirementFromLookup } from "../src/lib/requirement-resolution";

test("requirement lookup precedence: store > cluster > global", () => {
  const lookup = buildRequirementLookup(
    [{ storeId: "store-1", weekday: 1, requirement: "VIDEO" }],
    [{ clusterId: "cluster-1", weekday: 1, requirement: "PHOTO" }],
    [{ weekday: 1, requirement: "NONE" }]
  );

  const requirement = resolveRequirementFromLookup({
    storeId: "store-1",
    clusterId: "cluster-1",
    weekday: 1,
    lookup
  });

  assert.equal(requirement, "VIDEO");
});

test("requirement lookup uses most recent global rule (ordered by updatedAt desc)", () => {
  const lookup = buildRequirementLookup(
    [],
    [],
    [
      { weekday: 5, requirement: "BOTH" },
      { weekday: 5, requirement: "PHOTO" }
    ]
  );

  const requirement = resolveRequirementFromLookup({
    storeId: "store-1",
    clusterId: null,
    weekday: 5,
    lookup
  });

  assert.equal(requirement, "BOTH");
});

test("existing upload day requirement has priority over lookup maps", () => {
  const lookup = buildRequirementLookup(
    [{ storeId: "store-1", weekday: 2, requirement: "VIDEO" }],
    [{ clusterId: "cluster-1", weekday: 2, requirement: "PHOTO" }],
    [{ weekday: 2, requirement: "NONE" }]
  );

  const requirement = resolveRequirementFromLookup({
    storeId: "store-1",
    clusterId: "cluster-1",
    weekday: 2,
    existingRequirement: "BOTH",
    lookup
  });

  assert.equal(requirement, "BOTH");
});
