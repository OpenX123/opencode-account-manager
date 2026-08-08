import { useSyncExternalStore } from "react";
import { IconMoon, IconSun } from "./icons";

type Theme = "light" | "dark";
const THEME_EVENT = "ocam-theme-change";

function getTheme(): Theme {
  return document.documentElement.dataset.theme === "dark" ? "dark" : "light";
}

function subscribe(callback: () => void): () => void {
  window.addEventListener(THEME_EVENT, callback);
  return () => window.removeEventListener(THEME_EVENT, callback);
}

export default function ThemeToggle({ compact = false }: { compact?: boolean }) {
  const theme = useSyncExternalStore(subscribe, getTheme, () => "light");

  const next = theme === "dark" ? "light" : "dark";
  const nextLabel = next === "dark" ? "深色" : "浅色";
  const applyTheme = () => {
    document.documentElement.dataset.theme = next;
    window.localStorage.setItem("ocam-theme", next);
    window.dispatchEvent(new Event(THEME_EVENT));
  };
  return (
    <button
      type="button"
      onClick={applyTheme}
      className={compact ? "btn-icon" : "btn-ghost justify-start text-xs"}
      title={`切换到${nextLabel}模式`}
      aria-label={`切换到${nextLabel}模式`}
      aria-pressed={theme === "dark"}
    >
      {theme === "dark" ? <IconSun width={15} height={15} /> : <IconMoon width={15} height={15} />}
      {!compact && (theme === "dark" ? "浅色模式" : "深色模式")}
    </button>
  );
}
