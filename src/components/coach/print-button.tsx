"use client";

import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";

export function PrintButton({ label = "Imprimer", className }: { label?: string; className?: string }) {
  return (
    <Button onClick={() => window.print()} variant="outline" className={className}>
      <Printer className="h-4 w-4" />
      {label}
    </Button>
  );
}
