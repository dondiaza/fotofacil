import { RequirementKind } from "@prisma/client";

export type StoreRuleRow = {
  storeId: string | null;
  weekday: number;
  requirement: RequirementKind;
};

export type ClusterRuleRow = {
  clusterId: string | null;
  weekday: number;
  requirement: RequirementKind;
};

export type GlobalRuleRow = {
  weekday: number;
  requirement: RequirementKind;
};

export type RequirementLookup = {
  storeRuleMap: Map<string, RequirementKind>;
  clusterRuleMap: Map<string, RequirementKind>;
  globalRuleMap: Map<number, RequirementKind>;
};

export function buildRequirementLookup(
  storeRules: StoreRuleRow[],
  clusterRules: ClusterRuleRow[],
  globalRulesByUpdatedDesc: GlobalRuleRow[]
): RequirementLookup {
  const storeRuleMap = new Map<string, RequirementKind>();
  const clusterRuleMap = new Map<string, RequirementKind>();
  const globalRuleMap = new Map<number, RequirementKind>();

  for (const rule of storeRules) {
    if (!rule.storeId) continue;
    storeRuleMap.set(`${rule.storeId}:${rule.weekday}`, rule.requirement);
  }

  for (const rule of clusterRules) {
    if (!rule.clusterId) continue;
    clusterRuleMap.set(`${rule.clusterId}:${rule.weekday}`, rule.requirement);
  }

  // Keep first per weekday because rows are expected in updatedAt DESC.
  for (const rule of globalRulesByUpdatedDesc) {
    if (!globalRuleMap.has(rule.weekday)) {
      globalRuleMap.set(rule.weekday, rule.requirement);
    }
  }

  return {
    storeRuleMap,
    clusterRuleMap,
    globalRuleMap
  };
}

export function resolveRequirementFromLookup(params: {
  storeId: string;
  clusterId: string | null;
  weekday: number;
  lookup: RequirementLookup;
  existingRequirement?: RequirementKind | null;
}) {
  const existing = params.existingRequirement;
  if (existing) {
    return existing;
  }
  return (
    params.lookup.storeRuleMap.get(`${params.storeId}:${params.weekday}`) ||
    (params.clusterId ? params.lookup.clusterRuleMap.get(`${params.clusterId}:${params.weekday}`) : undefined) ||
    params.lookup.globalRuleMap.get(params.weekday) ||
    RequirementKind.NONE
  );
}
