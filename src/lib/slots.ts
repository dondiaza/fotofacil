type SlotTemplateLite = {
  name: string;
  required: boolean;
};

type UploadFileLite = {
  slotName: string;
};

export type DayStatus = "PENDING" | "PARTIAL" | "COMPLETE";

export function computeDayStatus(slots: SlotTemplateLite[], files: UploadFileLite[]): DayStatus {
  const required = slots.filter((slot) => slot.required);
  if (required.length === 0) {
    return files.length > 0 ? "COMPLETE" : "PENDING";
  }

  const uploadedBySlot = new Set(files.map((file) => file.slotName));
  const requiredCount = required.length;
  const completed = required.filter((slot) => uploadedBySlot.has(slot.name)).length;

  if (completed === 0 && files.length === 0) {
    return "PENDING";
  }
  if (completed < requiredCount) {
    return "PARTIAL";
  }
  return "COMPLETE";
}

export function sortSlots<T extends { order: number; name: string }>(slots: T[]) {
  return [...slots].sort((a, b) => {
    if (a.order !== b.order) {
      return a.order - b.order;
    }
    return a.name.localeCompare(b.name);
  });
}
