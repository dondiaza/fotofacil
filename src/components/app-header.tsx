import Link from "next/link";
import { LogoutButton } from "@/components/logout-button";
import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

type HeaderLink = {
  href: string;
  label: string;
};

export function AppHeader(props: {
  title: string;
  subtitle?: ReactNode;
  links: HeaderLink[];
  currentPath: string;
}) {
  return (
    <header className="mb-4 panel px-4 py-3 sm:mb-6 sm:px-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="font-[var(--font-display)] text-xl font-semibold sm:text-2xl">{props.title}</h1>
          {props.subtitle ? <p className="text-sm text-muted">{props.subtitle}</p> : null}
        </div>
        <LogoutButton />
      </div>

      <nav className="mt-3 flex flex-wrap gap-2">
        {props.links.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className={cn(
              "rounded-full px-3 py-1.5 text-sm font-semibold transition",
              props.currentPath === link.href
                ? "bg-primary text-white"
                : "border border-line bg-white text-muted hover:text-text"
            )}
          >
            {link.label}
          </Link>
        ))}
      </nav>
    </header>
  );
}
