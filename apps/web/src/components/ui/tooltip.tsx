"use client";

import * as RadixTooltip from "@radix-ui/react-tooltip";
import type { ReactElement, ReactNode } from "react";

export const TooltipProvider = RadixTooltip.Provider;

export function Tooltip({ label, children }: { label: ReactNode; children: ReactElement }) {
  return (
    <RadixTooltip.Root>
      <RadixTooltip.Trigger asChild>{children}</RadixTooltip.Trigger>
      <RadixTooltip.Portal>
        <RadixTooltip.Content
          className="z-[100] max-w-xs animate-fade-in bg-ink px-2.5 py-1.5 text-xs font-medium text-paper shadow-lift"
          sideOffset={6}
          style={{ borderRadius: 2 }}
        >
          {label}
        </RadixTooltip.Content>
      </RadixTooltip.Portal>
    </RadixTooltip.Root>
  );
}
