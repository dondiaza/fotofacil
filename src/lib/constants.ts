export const DEFAULT_DEADLINE = "10:30";

export const DEFAULT_SLOTS = [
  { name: "ESCAPARATE", order: 1, required: true, allowMultiple: true },
  { name: "FACHADA", order: 2, required: true, allowMultiple: true },
  { name: "INTERIOR", order: 3, required: true, allowMultiple: true },
  { name: "CAJA", order: 4, required: true, allowMultiple: true },
  { name: "GENERAL", order: 5, required: true, allowMultiple: true }
] as const;
