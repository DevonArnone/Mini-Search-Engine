"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import type { ReactNode, RefObject } from "react";

// A panel that slides in from the right. Radix supplies the focus trap,
// Escape handling, focus restoration, and background inertness.
export function Sheet({
  open,
  onOpenChange,
  title,
  description,
  returnFocusRef,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  // The control that opened the sheet; focus goes back to it on close.
  returnFocusRef?: RefObject<HTMLElement | null>;
  children: ReactNode;
}) {
  return (
    <Dialog.Root onOpenChange={onOpenChange} open={open}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[80] animate-fade-in bg-ink/40" />
        <Dialog.Content
          aria-describedby={undefined}
          onCloseAutoFocus={(event) => {
            if (!returnFocusRef?.current) return;
            event.preventDefault();
            returnFocusRef.current.focus();
          }}
          className="fixed inset-y-0 right-0 z-[90] flex w-[min(92vw,22.5rem)] animate-sheet-in flex-col border-l border-rule-strong bg-paper shadow-sheet focus:outline-none"
        >
          <div className="flex h-[var(--header-height)] shrink-0 items-center justify-between border-b border-rule pl-5 pr-2">
            <Dialog.Title className="font-display text-lg font-medium text-ink">{title}</Dialog.Title>
            <Dialog.Close aria-label={`Close ${title.toLowerCase()}`} className="icon-button">
              <X aria-hidden className="h-5 w-5" />
            </Dialog.Close>
          </div>
          {description ? <Dialog.Description className="sr-only">{description}</Dialog.Description> : null}
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">{children}</div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
