import { cn } from "@/lib/utils";

const map = {
  PENDING: "bg-amber-50 text-warning",
  PARTIAL: "bg-sky-50 text-primary",
  COMPLETE: "bg-emerald-50 text-success"
};

export function StatusChip({ status }: { status: "PENDING" | "PARTIAL" | "COMPLETE" }) {
  const label = status === "PENDING" ? "Pendiente" : status === "PARTIAL" ? "Parcial" : "Completo";
  return <span className={cn("chip", map[status])}>{label}</span>;
}
