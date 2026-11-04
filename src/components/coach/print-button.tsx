"use client";

import { ArrowRight, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";

export function PrintButton({ label = "Imprimer", className, showArrow = false }: { label?: string; className?: string; showArrow?: boolean }) {
  return (
    <Button onClick={() => window.print()} variant="outline" className={className}>
      <Printer className="h-4 w-4" />
      {label}
      {showArrow && <ArrowRight aria-hidden="true" className="h-4 w-4" />}
    </Button>
  );
}
