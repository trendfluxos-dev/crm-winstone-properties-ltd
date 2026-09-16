import { Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";

/**
 * Light / dark switch. Presentation only — it toggles the `dark` class that the
 * Winstone tokens in src/styles.css already define, and remembers the choice.
 */
const STORAGE_KEY = "winstone-theme";

export function applyStoredTheme() {
  if (typeof window === "undefined") return;
  const stored = window.localStorage.getItem(STORAGE_KEY);
  const dark =
    stored === "dark" ||
    (stored !== "light" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", dark);
}

export function ThemeToggle() {
  const [dark, setDark] = useState(false);

  useEffect(() => {
    applyStoredTheme();
    setDark(document.documentElement.classList.contains("dark"));
  }, []);

  const toggle = () => {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
    window.localStorage.setItem(STORAGE_KEY, next ? "dark" : "light");
  };

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
      title={dark ? "Light mode" : "Dark mode"}
      className="inline-flex size-8 shrink-0 items-center justify-center rounded-md border border-border bg-surface text-muted-foreground transition-colors duration-200 hover:border-primary/35 hover:text-foreground"
    >
      {dark ? <Sun className="size-4" /> : <Moon className="size-4" />}
    </button>
  );
}
