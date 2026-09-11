import { createContext, useContext, useEffect, useState } from "react";
export type Page = "position" | "trade" | "activity";
const readPage = (): Page => {
  const page = new URLSearchParams(location.search).get("page");
  return page === "trade" || page === "activity" ? page : "position";
};
const Navigation = createContext({ page: "position" as Page, go: (_: Page) => {}, back: () => {} });
export const useNavigation = () => useContext(Navigation);
export function NavigationProvider({ children }: { children: React.ReactNode }) {
  const [page, setPage] = useState(readPage);
  useEffect(() => {
    const sync = () => setPage(readPage());
    window.addEventListener("popstate", sync);
    return () => window.removeEventListener("popstate", sync);
  }, []);
  function go(next: Page, replace = false) {
    if (next === page && !replace) return;
    const url = new URL(location.href);
    url.searchParams.set("page", next);
    url.hash = "";
    const depth = replace ? 0 : (history.state?.autorollDepth ?? 0) + 1;
    history[replace ? "replaceState" : "pushState"]({ ...history.state, autorollDepth: depth }, "", url);
    setPage(next);
    window.scrollTo(0, 0);
  }
  function back() {
    if (history.state?.autorollDepth > 0) history.back();
    else go("position", true);
  }
  return <Navigation.Provider value={{ page, go, back }}>{children}</Navigation.Provider>;
}
