import type { AnchorHTMLAttributes } from "react";
import { navigate } from "./App";

export function Link({ href, ...rest }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) {
  const internal = href.startsWith("/");
  return (
    <a
      href={href}
      {...rest}
      onClick={internal ? (e) => { if (!e.metaKey && !e.ctrlKey) { e.preventDefault(); navigate(href); } } : undefined}
    />
  );
}
