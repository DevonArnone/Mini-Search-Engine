"use client";

import * as Menu from "@radix-ui/react-dropdown-menu";
import { Check, Monitor, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import React, { useEffect, useState } from "react";

const OPTIONS = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "Match system", icon: Monitor },
] as const;

export function ThemeMenu() {
  const { theme, resolvedTheme, setTheme } = useTheme();
  // The stored preference is unknown during server rendering; show a neutral
  // icon until the client has read it.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const Icon = !mounted ? Monitor : resolvedTheme === "dark" ? Moon : Sun;

  return (
    <Menu.Root>
      <Menu.Trigger aria-label="Theme" className="icon-button">
        <Icon aria-hidden className="h-[1.125rem] w-[1.125rem]" />
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Content align="end" className="z-[100] min-w-44 animate-menu-in border border-rule-strong bg-paper-raised p-1 shadow-lift" sideOffset={6} style={{ borderRadius: 3 }}>
          <Menu.RadioGroup onValueChange={setTheme} value={mounted ? theme : undefined}>
            {OPTIONS.map(({ value, label, icon: OptionIcon }) => (
              <Menu.RadioItem
                className="flex min-h-10 cursor-default select-none items-center gap-2.5 px-2.5 text-sm text-ink outline-none data-[highlighted]:bg-paper-sunk"
                key={value}
                style={{ borderRadius: 2 }}
                value={value}
              >
                <OptionIcon aria-hidden className="h-4 w-4 text-ink-soft" />
                <span className="flex-1">{label}</span>
                <Menu.ItemIndicator>
                  <Check aria-hidden className="h-4 w-4" />
                </Menu.ItemIndicator>
              </Menu.RadioItem>
            ))}
          </Menu.RadioGroup>
        </Menu.Content>
      </Menu.Portal>
    </Menu.Root>
  );
}
