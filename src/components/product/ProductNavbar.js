"use client";

import React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAppState } from "../../context/AppContext";

const ADMIN_ROUTES = ["/app/settings", "/app/account"];

const iconButtonClass = (isActive) => `inline-flex h-10 w-10 items-center justify-center rounded-full border text-sm font-semibold transition-all ${
  isActive
    ? "border-cyan-400/40 bg-cyan-400/10 text-cyan-200"
    : "border-white/10 bg-slate-900 text-slate-400 hover:border-white/20 hover:text-white"
}`;

const isAdminRoute = (path) => ADMIN_ROUTES.some((route) => path === route || path.startsWith(`${route}/`));

const validateReturnTo = (value) => {
  if (!value || typeof value !== "string") return "/app";
  if (!value.startsWith("/app")) return "/app";
  if (value.includes("://")) return "/app";

  const pathOnly = value.split("?")[0].split("#")[0];
  if (isAdminRoute(pathOnly)) return "/app";

  return value;
};

const getCurrentProductPath = () => {
  if (typeof window === "undefined") return "/app";
  return `${window.location.pathname}${window.location.search}${window.location.hash}`;
};

const getStoredReturnTo = () => {
  if (typeof window === "undefined") return "/app";
  const params = new URLSearchParams(window.location.search);
  return validateReturnTo(params.get("returnTo"));
};

const buildAdminHref = (targetPath, currentPathname) => {
  const currentProductPath = getCurrentProductPath();
  const returnTo = isAdminRoute(currentPathname) ? getStoredReturnTo() : validateReturnTo(currentProductPath);
  return `${targetPath}?returnTo=${encodeURIComponent(returnTo)}`;
};

export default function ProductNavbar() {
  const pathname = usePathname();
  const router = useRouter();
  const { isDebugMode, setIsDebugMode } = useAppState();
  const isSettings = pathname.startsWith("/app/settings");
  const isAccount = pathname.startsWith("/app/account");

  const handleSettingsClick = () => {
    router.push(isSettings ? getStoredReturnTo() : buildAdminHref("/app/settings", pathname));
  };

  const handleAccountClick = () => {
    router.push(isAccount ? getStoredReturnTo() : buildAdminHref("/app/account", pathname));
  };

  return (
    <header className="sticky top-0 z-40 border-b border-white/10 bg-slate-950/80 backdrop-blur-xl">
      <div className="mx-auto flex min-h-16 max-w-7xl items-center justify-between gap-3 px-4 py-3 sm:px-6 lg:px-8">
        <Link href="/app" aria-label="Return to Study Workspace" className="shrink-0 text-lg font-black tracking-tight text-white transition-colors hover:text-cyan-100">
          Aegis<span className="font-light text-cyan-300">Mind</span>
        </Link>

        <div className="flex min-w-0 items-center justify-end gap-2">
          <button
            type="button"
            onClick={() => setIsDebugMode(!isDebugMode)}
            className={`rounded-full border px-3 py-2 text-xs font-semibold transition-all ${
              isDebugMode
                ? "border-cyan-400/30 bg-cyan-400/10 text-cyan-200"
                : "border-white/10 bg-slate-900 text-slate-400 hover:text-white"
            }`}
          >
            <span>{isDebugMode ? "Debug On" : "Debug Off"}</span>
          </button>

          <button type="button" onClick={handleSettingsClick} aria-label={isSettings ? "Close settings" : "Open settings"} title="Settings" className={iconButtonClass(isSettings)}>
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M10.5 6h3m-8.2 8.7 2.1 2.1m9.2-9.2 2.1-2.1M4 12h3m10 0h3m-3.4 4.8 2.1 2.1M5.3 5.3l2.1 2.1M12 8.5a3.5 3.5 0 1 1 0 7 3.5 3.5 0 0 1 0-7Z" />
            </svg>
          </button>

          <button type="button" onClick={handleAccountClick} aria-label={isAccount ? "Close account" : "Open account"} title="Account" className={iconButtonClass(isAccount)}>
            <span aria-hidden="true">AF</span>
          </button>
        </div>
      </div>
    </header>
  );
}
