import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { PROCESSING_LABEL, STATUS_LABEL } from "@/lib/catalog";

export function StatusBadge({ status }: { status: string }) {
  const tone =
    status === "approved"
      ? "bg-success text-success-foreground"
      : status === "rejected"
        ? "bg-destructive text-destructive-foreground"
        : "bg-warning text-warning-foreground";

  return <Badge className={cn("border-transparent", tone)}>{STATUS_LABEL[status] ?? status}</Badge>;
}

export function ProcessingBadge({ status }: { status: string }) {
  return (
    <Badge variant="outline" className="border-border bg-secondary text-secondary-foreground">
      {PROCESSING_LABEL[status] ?? status}
    </Badge>
  );
}
