import { useEffect, useState } from "react";

export type ThemePreference = "system" | "light" | "dark";
function savedTheme(): ThemePreference {
  const value = localStorage.getItem("autoroll-theme");
  return value === "light" || value === "dark" || value === "system" ? value : "system";
}
function resolved(preference: ThemePreference) {
  return preference === "system" ? matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light" : preference;
}
export function ThemeToggle({ labeled = false }: { labeled?: boolean }) {
  const [preference, setPreference] = useState<ThemePreference>(savedTheme);
  useEffect(() => {
    const media = matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      const theme = resolved(preference);
      document.documentElement.dataset.theme = theme;
      document.documentElement.dataset.themePreference = preference;
      document.querySelector('meta[name="theme-color"]')?.setAttribute("content", theme === "dark" ? "#101318" : "#f4f6f8");
    };
    apply();
    media.addEventListener("change", apply);
    localStorage.setItem("autoroll-theme", preference);
    return () => media.removeEventListener("change", apply);
  }, [preference]);
  const next: ThemePreference = preference === "system" ? "light" : preference === "light" ? "dark" : "system";
  const icon = preference === "system" ? "◐" : preference === "light" ? "☀" : "☾";
  return <button className={`theme-control ${labeled ? "is-labeled" : ""}`} onClick={() => setPreference(next)} aria-label={`Appearance: ${preference}. Switch to ${next}.`} title={`Appearance: ${preference}`}>
    <span aria-hidden="true">{icon}</span>{labeled && <span>{preference[0].toUpperCase() + preference.slice(1)}</span>}
  </button>;
}
