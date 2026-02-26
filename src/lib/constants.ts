export const DEFAULT_DEADLINE = "10:30";

export const DEFAULT_SLOTS = [
  { name: "ESCAPARATE_1", order: 1, required: true, allowMultiple: false },
  { name: "ESCAPARATE_2", order: 2, required: true, allowMultiple: false },
  { name: "INTERIOR_1", order: 3, required: true, allowMultiple: false },
  { name: "INTERIOR_2", order: 4, required: true, allowMultiple: false },
  { name: "CAJA", order: 5, required: true, allowMultiple: false }
] as const;
