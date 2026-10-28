import { useEffect, useMemo, useState } from "react";
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
import "./styles.css";

/* ============================================================
   Swell Scope – Schritt 1: Wellenhöhe für La Boca (Concón)
   UI nach Apple Human Interface Guidelines:
   - iOS 26 „Liquid Glass" für Navigation & Controls als
     funktionale Schicht über dem Content – sparsam eingesetzt
   - Standard-Materialien im Content-Layer (kein Glas auf Glas)
   - Scroll-Edge-Effekt, spekulare Kanten, konzentrische Radien
   - Accessibility: „Transparenz reduzieren" & „Bewegung reduzieren"
   Daten: Open-Meteo Marine API (gratis, ohne Key, ~8 km Grid)
   Fallback: synthetische Demo-Daten, falls offline
   ============================================================ */

// Der eine Spot: La Boca – Mündung des Río Aconcagua, Südseite, Concón (Valparaíso)
const SPOT = { name: "La Boca", region: "Concón · Valparaíso", lat: -32.92, lon: -71.53 };

const WD = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];

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
  const rnd = mulberry32(
    Math.round((spot.lat + 100) * 1000) ^ Math.round((spot.lon + 200) * 1000)
  );
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

// ---------- Tooltip im iOS-Stil (Standard-Material für Lesbarkeit) ----------
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
        borderRadius: 14,
        padding: "8px 12px",
        boxShadow: "0 8px 24px rgba(0,0,0,0.22)",
        border: "0.5px solid var(--sepWeak)",
        fontSize: 13,
      }}
    >
      <div style={{ color: "var(--label2)", fontWeight: 600, marginBottom: 2 }}>
        {dt
          ? `${WD[dt.getDay()]}, ${pad2(dt.getDate())}.${pad2(dt.getMonth() + 1)}. · ${iso.slice(11, 16)} Uhr`
          : ""}
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
      {/* Liquid-Glass-Navigation (funktionale Schicht über dem Content) */}
      <header className="ios-nav" data-scrolled={scrolled}>
        <div className="mx-auto flex max-w-xl items-center justify-between px-4 py-2.5">
          <span className="ios-nav-title">{spot.name}</span>
          <div className="flex items-center gap-2">
            <span
              className="ios-pill"
              style={{
                background: demo
                  ? "color-mix(in srgb, var(--sysOrange) 16%, transparent)"
                  : "color-mix(in srgb, var(--sysGreen) 16%, transparent)",
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

      <main
        className="mx-auto max-w-xl px-4 pt-6"
        style={{ paddingBottom: "calc(4rem + env(safe-area-inset-bottom))" }}
      >
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
            <p className="ios-subtitle">{spot.region} · Mündung des Río Aconcagua</p>

            {/* Aktuelle Wellenhöhe */}
            <section className="ios-card mt-5">
              <div className="px-5 pt-4 pb-1">
                <div className="ios-caption">Wellenhöhe jetzt</div>
                <div className="mt-1 flex items-baseline gap-2">
                  <span
                    style={{
                      fontSize: 64,
                      fontWeight: 700,
                      letterSpacing: "-1.5px",
                      lineHeight: 1.05,
                      color: heightColor(nowRow?.h ?? null),
                    }}
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
              <div
                className="ios-cell-sep flex items-center gap-1.5 px-5 py-2.5"
                style={{ fontSize: 11, color: "var(--label3)" }}
              >
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
                      <button key={d.date} className="day-card" data-sel={isSel} onClick={() => setSelectedDay(i)}>
                        <span
                          style={{
                            fontSize: 10,
                            fontWeight: 700,
                            color: isSel || isToday ? "var(--sysBlue)" : "var(--label2)",
                          }}
                        >
                          {isToday ? "Heute" : weekdayOf(d.date)}
                        </span>
                        <span style={{ fontSize: 9, color: "var(--label3)" }}>
                          {d.date.slice(8, 10)}.{d.date.slice(5, 7)}.
                        </span>
                        <span style={{ height: 56, display: "flex", alignItems: "flex-end" }}>
                          <span
                            className="bar"
                            style={{
                              height: `${clamp((h / 4.5) * 100, 8, 100)}%`,
                              background: heightColor(h),
                            }}
                          />
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
                Wellenhöhe · 3 Tage ab{" "}
                {fmtDayLabel(chartRows.length ? dateOnly(chartRows[0].x) : selectedDate)}
              </h3>
              <div style={{ height: 256 }}>
                {chartRows.length === 0 ? (
                  <div
                    style={{
                      color: "var(--label3)",
                      display: "flex",
                      height: "100%",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
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
                          label={{
                            value: "jetzt",
                            fill: "var(--sysPink)",
                            fontSize: 10,
                            position: "insideTopLeft",
                          }}
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
              Rohdaten aus den Wellenmodellen von Open-Meteo (8-km-Grid, Aktualisierung alle 6
              Stunden) – kein Score, kein Algorithmus.{" "}
              {demo ? "Gerade laufen Demo-Daten, weil die Live-Quelle nicht erreichbar war." : ""}
            </p>
          </>
        )}
      </main>
    </div>
  );
}
