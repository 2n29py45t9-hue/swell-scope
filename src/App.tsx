import React, { useEffect, useMemo, useState } from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";

/* ============================================================
   Swell Scope – Schritt 1: Wellenhöhe für La Boca (Concón)
   UI nach Apple Human Interface Guidelines:
   - iOS 26 „Liquid Glass“ für Navigation & Controls als
     funktionale Schicht über dem Content – sparsam eingesetzt
   - Standard-Materialien im Content-Layer (kein Glas auf Glas)
   - Scroll-Edge-Effekt, spekulare Kanten, konzentrische Radien
   - Accessibility: „Transparenz reduzieren“ & „Bewegung reduzieren“
   Daten: Open-Meteo Marine API (gratis, ohne Key, ~8 km Grid)
   Fallback: synthetische Demo-Daten, falls offline
   ============================================================ */

// Der eine Spot: La Boca – Mündung des Río Aconcagua, Südseite, Concón (Valparaíso)
const SPOT = { name: "La Boca", region: "Concón · Valparaíso", lat: -32.92, lon: -71.53 };

const WD = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];

function clamp(v: number, a: number, b: number) {
  return Math.max(a, Math.min(b, v));
}
function pad2(n: number) {
  return n < 10 ? "0" + n : String(n);
}
function isoLocal(d: Date) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:00`;
}
function dateOnly(iso: string) {
  return iso.slice(0, 10);
}
function weekdayOf(dateStr: string) {
  return WD[new Date(dateStr + "T12:00:00").getDay()];
}
function fmtDayLabel(dateStr: string) {
  const d = new Date(dateStr + "T12:00:00");
  return `${WD[d.getDay()]}, ${pad2(d.getDate())}.${pad2(d.getMonth() + 1)}.`;
}

interface HourRow {
  x: string; // "YYYY-MM-DDTHH:00" (Spot-Ortszeit)
  h: number | null; // Wellenhöhe in m
}
interface DayRow {
  date: string;
  max: number | null;
}
interface WaveData {
  rows: HourRow[];
  days: DayRow[];
  nowX: string | null;
}

// ---------- Live-Daten (Open-Meteo Marine API) ----------
async function fetchWaveData(spot: { lat: number; lon: number }): Promise<WaveData> {
  const url =
    `https://marine-api.open-meteo.com/v1/marine?latitude=${spot.lat}&longitude=${spot.lon}` +
    `&hourly=wave_height&daily=wave_height_max&forecast_days=16&timezone=auto`;
  const res = await fetch(url);
  if (!res.ok) throw new Error("HTTP " + res.status);
  const j = await res.json();
  const h = j.hourly || {};
  const times: string[] = Array.isArray(h.time) ? h.time : [];
  const heights = h.wave_height ?? [];
  const rows: HourRow[] = times.map((t, i) => ({
    x: t,
    h: heights[i] != null ? heights[i] : null,
  }));
  const d = j.daily || {};
  const days: DayRow[] = ((d.time as string[]) || []).map((t: string, i: number) => ({
    date: t,
    max: (d.wave_height_max || [])[i] ?? null,
  }));
  const utcOffset = j.utc_offset_seconds ?? 0;
  const nowX = new Date(Date.now() + utcOffset * 1000).toISOString().slice(0, 13) + ":00";
  return { rows, days, nowX };
}

// ---------- Demo-Daten (Offline-Fallback) ----------
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function makeDemoData(spot: { lat: number; lon: number }): WaveData {
  const rnd = mulberry32(Math.round((spot.lat + 100) * 1000) ^ Math.round((spot.lon + 200) * 1000));
  const rows: HourRow[] = [];
  const days: DayRow[] = [];
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours(), 0, 0);
  for (let d = 0; d < 16; d++) {
    const dayStart = new Date(start.getTime() + d * 86400000);
    const base = 1.6 + 1.3 * Math.sin((d + spot.lat) * 0.75) + rnd() * 0.4;
    days.push({
      date: `${dayStart.getFullYear()}-${pad2(dayStart.getMonth() + 1)}-${pad2(dayStart.getDate())}`,
      max: Math.max(0.3, base + 0.6),
    });
    for (let hh = 0; hh < 24; hh++) {
      const t = new Date(dayStart.getTime() + hh * 3600000);
      const phase = ((hh + 9) / 24) * Math.PI * 2;
      rows.push({
        x: isoLocal(t),
        h: Math.max(0.3, base + 0.35 * Math.sin(phase) + (rnd() - 0.5) * 0.3),
      });
    }
  }
  return { rows, days, nowX: isoLocal(now) };
}

// ---------- iOS-Designfarben (via CSS-Variablen, Light/Dark automatisch) ----------
function heightColor(h: number | null) {
  if (h == null) return "var(--sysGray)";
  if (h < 1) return "var(--sysGreen)";
  if (h < 2) return "var(--sysBlue)";
  if (h < 3.5) return "var(--sysOrange)";
  return "var(--sysRed)";
}

const CSS = `
.sroot {
  color-scheme: light dark;
  --sysBlue: #007aff; --sysGreen: #34c759; --sysOrange: #ff9500; --sysRed: #ff3b30;
  --sysPink: #ff2d55;
  --sysGray: #8e8e93;
  --bg: #f2f2f7; --bg2: #ffffff;
  --label: #000000; --label2: rgba(60,60,67,0.6); --label3: rgba(60,60,67,0.3);
  --sep: rgba(60,60,67,0.29); --sepWeak: rgba(60,60,67,0.12);
  --fill: rgba(118,118,128,0.12); --fill2: rgba(118,118,128,0.08);
  /* Liquid Glass (Regular-Variante): funktionale Schicht für Navigation & Controls */
  --glass: rgba(255,255,255,0.55); --glassScrolled: rgba(255,255,255,0.72);
  --glassSpec: rgba(255,255,255,0.85); --glassRim: rgba(255,255,255,0.6);
  --glassShadow: 0 4px 18px rgba(0,0,0,0.1);
  --btnGlass: rgba(255,255,255,0.5);
  --tint: #e9f2fb; /* dezenter Ozean-Ton im Content-Layer */
}
@media (prefers-color-scheme: dark) {
  .sroot {
    --sysBlue: #0a84ff; --sysGreen: #30d158; --sysOrange: #ff9f0a; --sysRed: #ff453a;
    --sysPink: #ff375f;
    --sysGray: #98989d;
    --bg: #000000; --bg2: #1c1c1e;
    --label: #ffffff; --label2: rgba(235,235,245,0.6); --label3: rgba(235,235,245,0.3);
    --sep: rgba(84,84,88,0.6); --sepWeak: rgba(84,84,88,0.3);
    --fill: rgba(118,118,128,0.24); --fill2: rgba(118,118,128,0.16);
    --glass: rgba(28,28,30,0.5); --glassScrolled: rgba(28,28,30,0.7);
    --glassSpec: rgba(255,255,255,0.16); --glassRim: rgba(255,255,255,0.14);
    --glassShadow: 0 4px 18px rgba(0,0,0,0.4);
    --btnGlass: rgba(70,70,74,0.45);
    --tint: #0b1725;
  }
}
.sroot {
  min-height: 100vh;
  /* Content-Layer: sanfter Ozean-Verlauf, damit das Liquid-Glass der
     Navigation Inhalt durchscheinen lassen kann */
  background: linear-gradient(180deg, var(--tint) 0%, var(--bg) 380px);
  color: var(--label);
  font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "SF Pro Display", system-ui, "Segoe UI", Roboto, sans-serif;
  -webkit-font-smoothing: antialiased;
  font-variant-numeric: tabular-nums;
}
/* Liquid-Glass-Navigation (funktionale Ebene über dem Content) */
.ios-nav {
  position: sticky; top: 0; z-index: 20;
  backdrop-filter: saturate(180%) blur(24px);
  -webkit-backdrop-filter: saturate(180%) blur(24px);
  background: var(--glass);
  border-bottom: 0.5px solid var(--sepWeak);
  box-shadow: inset 0 0.5px 0 var(--glassSpec);
  transition: background 0.25s ease, box-shadow 0.25s ease;
}
/* Scroll-Edge-Effekt: stärkere Trennung, sobald Inhalt durchläuft */
.ios-nav[data-scrolled="true"] {
  background: var(--glassScrolled);
  box-shadow: inset 0 0.5px 0 var(--glassSpec), var(--glassShadow);
}
.ios-nav-title { font-size: 17px; font-weight: 600; letter-spacing: -0.2px; }
/* Refresh als Liquid-Glass-Control mit spekularem Rand */
.ios-refresh {
  width: 36px; height: 36px; border-radius: 9999px;
  backdrop-filter: saturate(160%) blur(12px);
  -webkit-backdrop-filter: saturate(160%) blur(12px);
  background: var(--btnGlass); color: var(--sysBlue);
  border: 0.5px solid var(--glassRim);
  box-shadow: inset 0 1px 0.5px var(--glassSpec), 0 2px 8px rgba(0,0,0,0.12);
  display: flex; align-items: center; justify-content: center;
  font-size: 16px; line-height: 1; cursor: pointer;
  transition: transform 0.45s cubic-bezier(0.2,0.8,0.2,1), filter 0.2s ease, background 0.2s ease;
}
.ios-refresh:active { transform: scale(0.88) rotate(180deg); filter: brightness(1.2); }
.ios-refresh[disabled] { opacity: 0.35; }
.ios-large-title {
  font-size: 34px; font-weight: 700; letter-spacing: 0.37px;
  margin: 0; line-height: 1.1;
}
.ios-subtitle { color: var(--label2); font-size: 15px; margin: 4px 0 0; }
.ios-caption { color: var(--label3); font-size: 13px; }
.ios-section-head {
  /* iOS 26: Titel-Schreibweise statt GROSSBUCHSTABEN */
  font-size: 13px; font-weight: 600;
  color: var(--label2); letter-spacing: -0.08px;
}
.ios-card {
  background: var(--bg2);
  border-radius: 20px; /* iOS 26: rundere, konzentrische Ecken */
  overflow: hidden;
  box-shadow: 0 1px 3px rgba(0,0,0,0.05);
}
.ios-cell-sep { border-top: 0.5px solid var(--sepWeak); }
.ios-pill {
  font-size: 12px; font-weight: 600; padding: 3px 10px; border-radius: 9999px;
  /* getönte Glass-Variante – Tint nur zur Hervorhebung (Live-Status) */
  backdrop-filter: saturate(180%) blur(10px);
  -webkit-backdrop-filter: saturate(180%) blur(10px);
  border: 0.5px solid color-mix(in srgb, currentColor 35%, transparent);
  box-shadow: inset 0 0.5px 0 var(--glassSpec);
}
.day-card {
  width: 64px; flex-shrink: 0; border-radius: 14px; background: var(--bg2);
  border: 2px solid transparent; cursor: pointer;
  display: flex; flex-direction: column; align-items: center;
  padding: 8px 0 7px; gap: 3px;
  transition: border-color 0.15s ease, transform 0.15s ease, box-shadow 0.15s ease;
}
.day-card:active { transform: scale(0.94); }
.day-card[data-sel="true"] {
  border-color: var(--sysBlue);
  box-shadow: 0 2px 12px color-mix(in srgb, var(--sysBlue) 28%, transparent);
}
.hscroll {
  display: flex; gap: 8px; overflow-x: auto; padding-bottom: 4px;
  -ms-overflow-style: none; scrollbar-width: none;
}
.hscroll::-webkit-scrollbar { display: none; }
.bar {
  width: 22px; border-radius: 5px 5px 2px 2px;
  min-height: 4px; opacity: 0.9;
}

/* Systemeinstellung „Transparenz reduzieren“: solide Flächen statt Glas */
@media (prefers-reduced-transparency: reduce) {
  .ios-nav, .ios-refresh, .ios-pill {
    backdrop-filter: none; -webkit-backdrop-filter: none;
    background: var(--bg2); box-shadow: none; border-color: var(--sepWeak);
  }
}
/* Systemeinstellung „Bewegung reduzieren“: kein Morphing, keine Rotation */
@media (prefers-reduced-motion: reduce) {
  .ios-nav, .ios-refresh, .day-card { transition: none; }
  .ios-refresh:active { transform: none; filter: none; }
  .day-card:active { transform: none; }
}
`;

// ---------- Tooltip im iOS-Stil ----------
function ChartTooltip({ active, payload }: any) {
  if (!active || !payload || !payload.length) return null;
  const v = payload[0];
  const iso = v?.payload?.x as string;
  const dt = iso ? new Date(iso) : null;
  const h = v.payload?.h;
  return (
    <div
      style={{
        background: "var(--bg2)",
        borderRadius: 12,
        padding: "8px 12px",
        boxShadow: "0 8px 24px rgba(0,0,0,0.22)",
        border: "0.5px solid var(--sepWeak)",
        fontSize: 13,
      }}
    >
      <div style={{ color: "var(--label2)", fontWeight: 600, marginBottom: 2 }}>
        {dt ? `${WD[dt.getDay()]}, ${pad2(dt.getDate())}.${pad2(dt.getMonth() + 1)}. · ${iso.slice(11, 16)} Uhr` : ""}
      </div>
      <div style={{ color: "var(--label)", fontWeight: 700 }}>
        {h == null ? "–" : h.toFixed(1)} m
      </div>
    </div>
  );
}

export default function App() {
  const [data, setData] = useState<WaveData | null>(null);
  const [demo, setDemo] = useState(false);
  const [loading, setLoading] = useState(true);
  const [reloadKey, setReloadKey] = useState(0);
  const [selectedDay, setSelectedDay] = useState(0);
  const [scrolled, setScrolled] = useState(false);

  const spot = SPOT;

  useEffect(() => {
    let alive = true;
    setLoading(true);
    (async () => {
      try {
        const d = await fetchWaveData(spot);
        if (!alive) return;
        setData(d);
        setDemo(false);
      } catch {
        if (!alive) return;
        setData(makeDemoData(spot));
        setDemo(true);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [reloadKey]);

  // Scroll-Edge-Effekt: Liquid-Glass-Navigation verstärkt sich,
  // sobald Inhalt darunter durchläuft (analog UIScrollEdgeElementContainer)
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 4);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const rows = data?.rows ?? [];
  const nowRow = useMemo(() => {
    if (!data?.nowX) return null;
    const i = rows.findIndex((r) => r.x >= data.nowX!);
    return i >= 0 ? rows[i] : null;
  }, [rows, data?.nowX]);

  const todayKey = nowRow ? dateOnly(nowRow.x) : null;
  const todayMax = data?.days.find((d) => d.date === todayKey)?.max ?? null;

  const selectedDate = useMemo(() => {
    if (!data?.days.length) return dateOnly(new Date().toISOString().slice(0, 10));
    return data.days[Math.min(selectedDay, data.days.length - 1)].date;
  }, [data, selectedDay]);

  // 3 Tage ab ausgewähltem Tag
  const chartRows = useMemo(() => {
    const start = selectedDate + "T00:00";
    const endD = new Date(selectedDate + "T12:00");
    endD.setDate(endD.getDate() + 3);
    const end = isoLocal(endD);
    return rows.filter((r) => r.x >= start && r.x < end);
  }, [rows, selectedDate]);

  const hasNow = chartRows.some((r) => r.x === data?.nowX);

  return (
    <div className="sroot">
      <style>{CSS}</style>

      {/* Liquid-Glass-Navigation (funktionale Schicht über dem Content) */}
      <header className="ios-nav" data-scrolled={scrolled}>
        <div className="mx-auto flex max-w-xl items-center justify-between px-4 py-2.5">
          <span className="ios-nav-title">{spot.name}</span>
          <div className="flex items-center gap-2">
            <span
              className="ios-pill"
              style={{
                background: demo ? "color-mix(in srgb, var(--sysOrange) 16%, transparent)" : "color-mix(in srgb, var(--sysGreen) 16%, transparent)",
                color: demo ? "var(--sysOrange)" : "var(--sysGreen)",
              }}
            >
              {demo ? "DEMO" : "LIVE"}
            </span>
            <button
              onClick={() => setReloadKey((k) => k + 1)}
              disabled={loading}
              className="ios-refresh"
              title="Daten aktualisieren"
            >
              ↻
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-xl px-4 pb-16 pt-6" style={{ paddingBottom: "calc(4rem + env(safe-area-inset-bottom))" }}>
        {loading && !data ? (
          <div className="space-y-4">
            <div className="h-28 rounded-2xl animate-pulse" style={{ background: "var(--fill2)" }} />
            <div className="h-24 rounded-2xl animate-pulse" style={{ background: "var(--fill2)" }} />
            <div className="h-64 rounded-2xl animate-pulse" style={{ background: "var(--fill2)" }} />
          </div>
        ) : (
          <>
            {/* Großer Titel */}
            <h1 className="ios-large-title">{spot.name}</h1>
            <p className="ios-subtitle">
              {spot.region} · Mündung des Río Aconcagua
            </p>

            {/* Aktuelle Wellenhöhe */}
            <section className="ios-card mt-5">
              <div className="px-5 pt-4 pb-1">
                <div className="ios-caption">Wellenhöhe jetzt</div>
                <div className="mt-1 flex items-baseline gap-2">
                  <span
                    style={{ fontSize: 64, fontWeight: 700, letterSpacing: "-1.5px", lineHeight: 1.05, color: heightColor(nowRow?.h ?? null) }}
                  >
                    {nowRow?.h == null ? "–" : nowRow.h.toFixed(1)}
                  </span>
                  <span style={{ fontSize: 22, color: "var(--label2)", fontWeight: 600 }}>m</span>
                </div>
                <div style={{ fontSize: 14, color: "var(--label2)", marginBottom: 12 }}>
                  {nowRow ? `${nowRow.x.slice(11, 16)} Uhr` : "Keine Daten"}
                  {todayMax != null && <> · heute max {todayMax.toFixed(1)} m</>}
                </div>
              </div>
              <div className="ios-cell-sep flex items-center gap-1.5 px-5 py-2.5" style={{ fontSize: 11, color: "var(--label3)" }}>
                <span className="bar" style={{ background: "var(--sysGreen)", width: 18, height: 4 }} /> &lt;1
                <span className="ml-1 bar" style={{ background: "var(--sysBlue)", width: 18, height: 4 }} /> 1–2
                <span className="ml-1 bar" style={{ background: "var(--sysOrange)", width: 18, height: 4 }} /> 2–3,5
                <span className="ml-1 bar" style={{ background: "var(--sysRed)", width: 18, height: 4 }} /> 3,5+
                <span className="ml-1">m</span>
                {loading && <span className="ml-auto">Aktualisiere…</span>}
              </div>
            </section>

            {/* Tagesübersicht */}
            {data && data.days.length > 0 && (
              <section className="mt-6">
                <h3 className="ios-section-head mb-2 px-1">Maximum pro Tag · 16 Tage</h3>
                <div className="hscroll">
                  {data.days.map((d, i) => {
                    const isSel = i === selectedDay;
                    const isToday = todayKey === d.date;
                    const h = d.max ?? 0;
                    return (
                      <button
                        key={d.date}
                        className="day-card"
                        data-sel={isSel}
                        onClick={() => setSelectedDay(i)}
                      >
                        <span style={{ fontSize: 10, fontWeight: 700, color: isSel || isToday ? "var(--sysBlue)" : "var(--label2)" }}>
                          {isToday ? "Heute" : weekdayOf(d.date)}
                        </span>
                        <span style={{ fontSize: 9, color: "var(--label3)" }}>
                          {d.date.slice(8, 10)}.{d.date.slice(5, 7)}.
                        </span>
                        <span style={{ height: 56, display: "flex", alignItems: "flex-end" }}>
                          <span className="bar" style={{ height: `${clamp((h / 4.5) * 100, 8, 100)}%`, background: heightColor(h) }} />
                        </span>
                        <span style={{ fontSize: 12, fontWeight: 600, color: "var(--label)" }}>
                          {d.max != null ? d.max.toFixed(1) : "–"}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </section>
            )}

            {/* Trend-Chart */}
            <section className="ios-card mt-6 p-4">
              <h3 style={{ fontSize: 17, fontWeight: 600, marginBottom: 12 }}>
                Wellenhöhe · 3 Tage ab {fmtDayLabel(chartRows.length ? dateOnly(chartRows[0].x) : selectedDate)}
              </h3>
              <div style={{ height: 256 }}>
                {chartRows.length === 0 ? (
                  <div style={{ color: "var(--label3)", display: "flex", height: "100%", alignItems: "center", justifyContent: "center" }}>
                    Keine Daten verfügbar
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={chartRows} margin={{ top: 6, right: 6, bottom: 0, left: -14 }}>
                      <defs>
                        <linearGradient id="waveGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="var(--sysBlue)" stopOpacity={0.35} />
                          <stop offset="100%" stopColor="var(--sysBlue)" stopOpacity={0.02} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid stroke="var(--sepWeak)" vertical={false} />
                      <XAxis
                        dataKey="x"
                        tickFormatter={(v: string) =>
                          v.endsWith("00:00") ? weekdayOf(dateOnly(v)) : v.slice(11, 13)
                        }
                        tick={{ fill: "var(--label2)", fontSize: 11 }}
                        interval={5}
                        axisLine={false}
                        tickLine={false}
                      />
                      <YAxis
                        tick={{ fill: "var(--label2)", fontSize: 11 }}
                        domain={[0, "auto"]}
                        tickFormatter={(v: number) => v.toFixed(1)}
                        unit=" m"
                        width={40}
                        axisLine={false}
                        tickLine={false}
                      />
                      <Tooltip content={<ChartTooltip />} />
                      {hasNow && data?.nowX && (
                        <ReferenceLine
                          x={data.nowX}
                          stroke="var(--sysPink)"
                          strokeDasharray="4 3"
                          label={{ value: "jetzt", fill: "var(--sysPink)", fontSize: 10, position: "insideTopLeft" }}
                        />
                      )}
                      <Area
                        type="monotone"
                        dataKey="h"
                        name="Wellenhöhe"
                        stroke="var(--sysBlue)"
                        strokeWidth={2}
                        fill="url(#waveGrad)"
                        connectNulls
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                )}
              </div>
            </section>

            {/* Quellenangabe als Caption */}
            <p className="ios-caption mt-4 px-1" style={{ lineHeight: 1.5 }}>
              Rohdaten aus den Wellenmodellen von Open-Meteo (8-km-Grid, Aktualisierung alle 6 Stunden) – kein Score,
              kein Algorithmus. {demo ? "Gerade laufen Demo-Daten, weil die Live-Quelle nicht erreichbar war." : ""}
            </p>
          </>
        )}
      </main>
    </div>
  );
}
