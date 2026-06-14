import { useEffect, useMemo, useState } from "react";
import { AppRoutes } from "./router/AppRoutes";

const LAUNCH_AT_UTC_MS = Date.UTC(2026, 5, 14, 17, 30, 0);
const PREVIEW_QUERY_KEY = "preview";
const PREVIEW_QUERY_VALUE = "admin";
const PREVIEW_STORAGE_KEY = "zsms_launch_preview_access";

function formatCountdownParts(msRemaining: number) {
  const totalSeconds = Math.max(0, Math.floor(msRemaining / 1000));
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return { days, hours, minutes, seconds };
}

function hasPreviewBypass() {
  if (typeof window === "undefined") return false;
  const params = new URLSearchParams(window.location.search);
  return (
    window.sessionStorage.getItem(PREVIEW_STORAGE_KEY) === "1" ||
    params.get(PREVIEW_QUERY_KEY) === PREVIEW_QUERY_VALUE
  );
}

export default function App() {
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [previewAccess, setPreviewAccess] = useState(() => hasPreviewBypass());

  useEffect(() => {
    const timer = window.setInterval(() => {
      setNowMs(Date.now());
    }, 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get(PREVIEW_QUERY_KEY) !== PREVIEW_QUERY_VALUE) return;

    window.sessionStorage.setItem(PREVIEW_STORAGE_KEY, "1");
    setPreviewAccess(true);

    const url = new URL(window.location.href);
    url.searchParams.delete(PREVIEW_QUERY_KEY);
    const nextUrl = `${url.pathname}${url.search}${url.hash}`;
    window.history.replaceState({}, "", nextUrl);
  }, []);

  const isLive = nowMs >= LAUNCH_AT_UTC_MS || previewAccess;
  const countdown = useMemo(() => formatCountdownParts(LAUNCH_AT_UTC_MS - nowMs), [nowMs]);

  if (!isLive) {
    const countdownItems = [
      { label: "Days", value: countdown.days },
      { label: "Hours", value: countdown.hours },
      { label: "Minutes", value: countdown.minutes },
      { label: "Seconds", value: countdown.seconds }
    ];

    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 px-4 py-8 text-white">
        <div className="w-full max-w-4xl rounded-3xl border border-white/10 bg-white/5 p-8 text-center shadow-2xl backdrop-blur md:p-12">
          <div className="text-sm font-semibold uppercase tracking-[0.35em] text-sky-200">Countdown Timer</div>
          <h1 className="mt-4 text-3xl font-bold leading-tight md:text-5xl">
            Site Will be Live on Sunday 14-Jun-26 at 10:30pm PST
          </h1>
          <p className="mt-4 text-sm text-slate-200 md:text-base">
            This page will automatically close and the site will open at 10:30 PM Pakistan Standard Time.
          </p>

          <div className="mt-8 grid grid-cols-2 gap-4 md:grid-cols-4">
            {countdownItems.map((item) => (
              <div key={item.label} className="rounded-2xl border border-white/10 bg-slate-900/70 px-4 py-6">
                <div className="text-3xl font-bold md:text-5xl">{String(item.value).padStart(2, "0")}</div>
                <div className="mt-2 text-xs font-semibold uppercase tracking-[0.25em] text-slate-300">{item.label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return <AppRoutes />;
}
