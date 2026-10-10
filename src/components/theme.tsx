"use client";

import { createContext, useContext, useSyncExternalStore, type ReactNode } from "react";
import { IconButton } from "./ui";

export type ThemePreference = "light" | "dark" | "system";
const key = "matchmaker-visual-theme";
let temporaryPreference: ThemePreference | undefined;

function preference(): ThemePreference {
  if (temporaryPreference) return temporaryPreference;
  try { const value = localStorage.getItem(key); return value === "light" || value === "dark" ? value : "system"; } catch { return "system"; }
}
function resolved(value: ThemePreference) { return value === "system" ? (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light") : value; }
function applyTheme() { document.documentElement.dataset.theme = resolved(preference()); }
function snapshot() { const value = preference(); return `${value}:${resolved(value)}`; }
function subscribe(callback: () => void) {
  const media = matchMedia("(prefers-color-scheme: dark)");
  const update = () => { applyTheme(); callback(); };
  const storage = () => { temporaryPreference = undefined; update(); };
  window.addEventListener("matchmaker-theme", update);
  window.addEventListener("storage", storage);
  media.addEventListener("change", update);
  return () => { window.removeEventListener("matchmaker-theme", update); window.removeEventListener("storage", storage); media.removeEventListener("change", update); };
}

const ThemeContext = createContext<{ preference: ThemePreference; theme: string; setPreference: (value: ThemePreference) => void } | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const value = useSyncExternalStore(subscribe, snapshot, () => "system:light");
  const [selectedPreference, theme] = value.split(":");
  function setPreference(next: ThemePreference) {
    temporaryPreference = next;
    try { if (next === "system") localStorage.removeItem(key); else localStorage.setItem(key, next); } catch { /* The theme still works when browser storage is unavailable. */ }
    applyTheme();
    window.dispatchEvent(new Event("matchmaker-theme"));
  }
  return <ThemeContext.Provider value={{ preference: selectedPreference as ThemePreference, theme, setPreference }}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) throw new Error("ThemeProvider is required");
  return context;
}

export function ThemeToggle() {
  const { theme, setPreference } = useTheme();
  return <IconButton label={`Switch to ${theme === "dark" ? "light" : "dark"} theme`} icon={theme === "dark" ? "sun" : "moon"} onClick={() => setPreference(theme === "dark" ? "light" : "dark")} />;
}

