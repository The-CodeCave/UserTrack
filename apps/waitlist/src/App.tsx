import { useEffect, useState } from "react";
import Landing from "./pages/Landing";
import Impressum from "./pages/Impressum";
import Privacy from "./pages/Privacy";

const TITLES: Record<string, string> = {
  "/impressum": "Impressum — UserTrack",
  "/privacy": "Privacy Policy — UserTrack",
};

function usePath() {
  const [path, setPath] = useState(window.location.pathname);
  useEffect(() => {
    const onPop = () => setPath(window.location.pathname);
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);
  return path.replace(/\/+$/, "") || "/";
}

export function navigate(to: string) {
  window.history.pushState(null, "", to);
  window.dispatchEvent(new PopStateEvent("popstate"));
  window.scrollTo(0, 0);
}

export default function App() {
  const path = usePath();
  useEffect(() => {
    document.title = TITLES[path] ?? "UserTrack — See which SaaS are actually growing";
  }, [path]);
  if (path === "/impressum") return <Impressum />;
  if (path === "/privacy") return <Privacy />;
  return <Landing />;
}
