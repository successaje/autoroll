import { createContext, useContext, useEffect, useMemo, useState } from "react";

export type Route =
  | { name: "home" }
  | { name: "markets" }
  /** `side` preselects Up (true) or Down (false) when the user picked a
   *  direction on the market tile. Not encoded in the URL — it is a handoff
   *  between two screens, not a shareable location. */
  | { name: "market"; asset: "BTC" | "ETH"; side?: boolean }
  | { name: "portfolio" }
  | { name: "position"; id: number }
  | { name: "activity" }
  | { name: "status" };

function parseRoute(): Route {
  const path = location.pathname.replace(/\/+$/, "") || "/";
  const market = path.match(/^\/app\/market\/(BTC|ETH)$/i);
  const position = path.match(/^\/app\/position\/(\d+)$/);
  if (market) return { name: "market", asset: market[1].toUpperCase() as "BTC" | "ETH" };
  if (position) return { name: "position", id: Number(position[1]) };
  if (path === "/app/portfolio") return { name: "portfolio" };
  if (path === "/app/activity") return { name: "activity" };
  if (path === "/status") return { name: "status" };
  if (path === "/app" || path === "/app/markets") return { name: "markets" };
  return { name: "home" };
}

function routePath(route: Route): string {
  switch (route.name) {
    case "home": return "/";
    case "markets": return "/app/markets";
    case "market": return `/app/market/${route.asset}`;
    case "portfolio": return "/app/portfolio";
    case "position": return `/app/position/${route.id}`;
    case "activity": return "/app/activity";
    case "status": return "/status";
  }
}

const Navigation = createContext({ route: { name: "home" } as Route, go: (_: Route, _replace?: boolean) => {}, back: () => {} });
export const useNavigation = () => useContext(Navigation);

export function NavigationProvider({ children }: { children: React.ReactNode }) {
  const [route, setRoute] = useState(parseRoute);
  useEffect(() => {
    const sync = () => setRoute(parseRoute());
    addEventListener("popstate", sync);
    return () => removeEventListener("popstate", sync);
  }, []);
  const value = useMemo(() => ({
    route,
    go(next: Route, replace = false) {
      const watch = new URLSearchParams(location.search).get("watch");
      const path = `${routePath(next)}${watch ? `?watch=${encodeURIComponent(watch)}` : ""}`;
      if (path === location.pathname && !replace) return;
      history[replace ? "replaceState" : "pushState"]({}, "", path);
      setRoute(next);
      scrollTo({ top: 0, behavior: "instant" });
    },
    back() {
      if (history.length > 1) history.back();
      else {
        history.replaceState({}, "", "/app/markets");
        setRoute({ name: "markets" });
      }
    },
  }), [route]);
  return <Navigation.Provider value={value}>{children}</Navigation.Provider>;
}
