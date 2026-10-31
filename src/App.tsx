




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
   Swell Scope – Paso 1: altura de ola en La Boca (Concón)
   + Página de detalle del día: gráfico cada 15 min y detalles del clima
   UI nach Apple Human Interface Guidelines:
   - iOS 26 „Liquid Glass“ für Navigation & Controls als
     funktionale Schicht über dem Content – sparsam eingesetzt
   - Standard-Materialien im Content-Layer (kein Glas auf Glas)
   - Scroll-Edge-Effekt, spekulare Kanten, konzentrische Radien
   - Accessibility: „Transparenz reduzieren“ & „Bewegung reduzieren“
   Datos: Open-Meteo Marine API + Forecast API (gratis, sin key)
   Fallback: datos de demostración sintéticos si no hay conexión
   ============================================================ */

// Der eine Spot: La Boca – Mündung des Río Aconcagua, Südseite, Concón (Valparaíso)
const SPOT = { name: "La Boca", region: "Concón · Valparaíso", lat: -32.92, lon: -71.53 };

const WD = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];

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
  return `${WD[d.getDay()]}, ${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}`;
}
// Kurzdatum spanisch: 28/10
function fmtShortDate(dateStr: string) {
  return `${dateStr.slice(8, 10)}/${dateStr.slice(5, 7)}`;
}
// Dezimaltrennzeichen Komma (es-CL / es-ES)
function num1(v: number | null) {
  return v == null ? "–" : v.toFixed(1).replace(".", ",");
}
// Ganzzahl – Höhen werden durchgehend in cm angezeigt
function num0(v: number | null) {
  return v == null ? "–" : String(Math.round(v));
}
// Viertelstündige Interpolation: aus Stundwerten 15-Min-Schritte erzeugen
// (Open-Meteo liefert Wellendaten nur stündlich – die Zwischenwerte sind
//  linear interpoliert und im Tooltip mit „≈“ gekennzeichnet)
function quarterHourly(rows: HourRow[]): HourRow[] {
  const out: HourRow[] = [];
  for (let i = 0; i < rows.length; i++) {
    const a = rows[i];
    out.push({ ...a, interp: false });
    const b = rows[i + 1];
    if (!b || a.h == null || b.h == null) continue;
    for (let m = 15; m < 60; m += 15) {
      out.push({
        x: `${a.x.slice(0, 13)}:${pad2(m)}`,
        h: a.h + ((b.h - a.h) * m) / 60,
        interp: true,
      });
    }
  }
  return out;
}
// Himmelsrichtung (Wind kommt aus dieser Richtung)
function dirText(deg: number | null) {
  if (deg == null) return "–";
  const dirs = ["N", "NE", "E", "SE", "S", "SO", "O", "NO"];
  return dirs[Math.round((deg % 360) / 45) % 8];
}
// WMO-Wettercode → Beschreibung (ohne Emojis)
function wmoInfo(code: number | null): { label: string } {
  if (code == null) return { label: "Sin datos" };
  if (code === 0) return { label: "Despejado" };
  if (code === 1) return { label: "Mayormente despejado" };
  if (code === 2) return { label: "Parcialmente nublado" };
  if (code === 3) return { label: "Nublado" };
  if (code === 45 || code === 48) return { label: "Niebla" };
  if (code >= 51 && code <= 57) return { label: "Llovizna" };
  if (code >= 61 && code <= 67) return { label: "Lluvia" };
  if (code >= 71 && code <= 77) return { label: "Nieve" };
  if (code >= 80 && code <= 82) return { label: "Chubascos" };
  if (code >= 85 && code <= 86) return { label: "Chubascos de nieve" };
  if (code >= 95) return { label: "Tormenta" };
  return { label: "Sin datos" };
}

interface HourRow {
  x: string; // "YYYY-MM-DDTHH:MM" (Spot-Ortszeit)
  h: number | null; // Wellenhöhe in cm
  interp?: boolean; // true = zwischen Stundenwerten interpoliert (Viertelstunde)
}
interface DayRow {
  date: string;
  max: number | null;
}
interface DayWeather {
  date: string;
  tMax: number | null;
  tMin: number | null;
  precip: number | null;
  windMax: number | null;
  gustsMax: number | null;
  windDir: number | null;
  sunrise: string | null;
  sunset: string | null;
  code: number | null;
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
    `&hourly=wave_height&daily=wave_height_max&forecast_days=7&timezone=auto`;
  const res = await fetch(url);
  if (!res.ok) throw new Error("HTTP " + res.status);
  const j = await res.json();
  const h = j.hourly || {};
  const times: string[] = Array.isArray(h.time) ? h.time : [];
  const heights = h.wave_height ?? [];
  const rows: HourRow[] = times.map((t, i) => ({
    x: t,
    h: heights[i] != null ? heights[i] * 100 : null, // API liefert m → Anzeige in cm
  }));
  const d = j.daily || {};
  const days: DayRow[] = ((d.time as string[]) || []).map((t: string, i: number) => ({
    date: t,
    max: (d.wave_height_max || [])[i] != null ? (d.wave_height_max || [])[i] * 100 : null, // m → cm
  }));
  const utcOffset = j.utc_offset_seconds ?? 0;
  const nowX = new Date(Date.now() + utcOffset * 1000).toISOString().slice(0, 13) + ":00";
  return { rows, days, nowX };
}

// ---------- Live-Wetter (Open-Meteo Forecast API) ----------
async function fetchWeather(spot: { lat: number; lon: number }): Promise<DayWeather[]> {
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${spot.lat}&longitude=${spot.lon}` +
    `&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,wind_speed_10m_max,wind_gusts_10m_max,wind_direction_10m_dominant,sunrise,sunset` +
    `&forecast_days=7&timezone=auto`;
  const res = await fetch(url);
  if (!res.ok) throw new Error("HTTP " + res.status);
  const j = await res.json();
  const d = j.daily || {};
  const times: string[] = (d.time as string[]) || [];
  const g = (k: string, i: number) => (d as any)[k]?.[i] ?? null;
  return times.map((t: string, i: number) => ({
    date: t,
    tMax: g("temperature_2m_max", i),
    tMin: g("temperature_2m_min", i),
    precip: g("precipitation_sum", i),
    windMax: g("wind_speed_10m_max", i),
    gustsMax: g("wind_gusts_10m_max", i),
    windDir: g("wind_direction_10m_dominant", i),
    sunrise: g("sunrise", i),
    sunset: g("sunset", i),
    code: g("weather_code", i),
  }));
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
  for (let d = 0; d < 7; d++) {
    const dayStart = new Date(start.getTime() + d * 86400000);
    const base = 1.6 + 1.3 * Math.sin((d + spot.lat) * 0.75) + rnd() * 0.4;
    days.push({
      date: `${dayStart.getFullYear()}-${pad2(dayStart.getMonth() + 1)}-${pad2(dayStart.getDate())}`,
      max: Math.max(0.3, base + 0.6) * 100, // m → cm
    });
    for (let hh = 0; hh < 24; hh++) {
      const t = new Date(dayStart.getTime() + hh * 3600000);
      const phase = ((hh + 9) / 24) * Math.PI * 2;
      rows.push({
        x: isoLocal(t),
        h: Math.max(0.3, base + 0.35 * Math.sin(phase) + (rnd() - 0.5) * 0.3) * 100, // m → cm
      });
    }
  }
  return { rows, days, nowX: isoLocal(now) };
}
function makeDemoWeather(days: DayRow[]): DayWeather[] {
  const rnd = mulberry32(20261028);
  const codes = [0, 1, 2, 3, 61, 80];
  return days.map((d, i) => ({
    date: d.date,
    tMax: 16 + Math.sin(i * 0.9) * 3 + rnd() * 2,
    tMin: 10 + Math.sin(i * 0.9) * 2 + rnd() * 2,
    precip: Math.max(0, rnd() * 2 - 1),
    windMax: 14 + rnd() * 16,
    gustsMax: 22 + rnd() * 22,
    windDir: Math.round(rnd() * 359),
    sunrise: d.date + "T06:41",
    sunset: d.date + "T19:58",
    code: codes[Math.floor(rnd() * codes.length)],
  }));
}

// ---------- iOS-Designfarben (via CSS-Variablen, Light/Dark automatisch) ----------
function heightColor(h: number | null) {
  if (h == null) return "var(--sysGray)";
  if (h < 100) return "var(--wv-1)";
  if (h < 200) return "var(--wv-2)";
  if (h < 350) return "var(--wv-3)";
  return "var(--wv-4)";
}

// ---------- Tooltip im iOS-Stil ----------
function ChartTooltip({ active, payload }: any) {
  if (!active || !payload || !payload.length) return null;
  const v = payload[0];
  const iso = v?.payload?.x as string;
  const dt = iso ? new Date(iso) : null;
  const h = v.payload?.h;
  return (
    <div className="chart-tip">
      <div className="chart-tip-key">
        {dt ? `${WD[dt.getDay()]}, ${pad2(dt.getDate())}/${pad2(dt.getMonth() + 1)} · ${iso.slice(11, 16)} h` : ""}
      </div>
      <div className="chart-tip-val">
        {v?.payload?.interp ? <span className="chart-tip-accent">≈ </span> : null}
        {num0(h)} cm
      </div>
    </div>
  );
}

// ---------- Wiederverwendbare Bausteine ----------

type Tab = "home" | "waves" | "weather";

// Stunden-Diagramm eines Tages (Home: heute · Wellen: gewählter Tag)
function WaveChart({
  dayRows,
  nowX,
  hasNow,
  height = 256,
  gradientId,
}: {
  dayRows: HourRow[];
  nowX: string | null;
  hasNow: boolean;
  height?: number;
  gradientId: string;
}) {
  if (dayRows.length === 0) {
    return (
      <div
        style={{
          height,
          color: "var(--label3)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        Sin datos disponibles
      </div>
    );
  }
  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={dayRows} margin={{ top: 6, right: 8, bottom: 0, left: -14 }}>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--chart)" stopOpacity={0.38} />
              <stop offset="100%" stopColor="var(--chart)" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="var(--sepWeak)" vertical={false} />
          <XAxis
            dataKey="x"
            tickFormatter={(v: string) => v.slice(11, 13)}
            tick={{ fill: "var(--label2)", fontSize: 11 }}
            interval={8}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            tick={{ fill: "var(--label2)", fontSize: 11 }}
            domain={[0, "auto"]}
            tickFormatter={(v: number) => String(Math.round(v))}
            unit=" cm"
            width={48}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip content={<ChartTooltip />} />
          {hasNow && nowX && (
            <ReferenceLine
              x={nowX}
              stroke="var(--accent)"
              strokeWidth={1.5}
              strokeDasharray="4 3"
              label={{ value: "ahora", fill: "var(--accent)", fontSize: 10, fontWeight: 700, position: "insideTopLeft" }}
            />
          )}
          <Area
            type="monotone"
            dataKey="h"
            name="Altura de ola"
            stroke="var(--chart)"
            strokeWidth={2.2}
            fill={`url(#${gradientId})`}
            connectNulls
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

// Tagesleiste mit Wellen-Maximum – überall identisch (Home, Wellen)
function WaveDayStrip({
  days,
  todayDate,
  selected,
  onSelect,
}: {
  days: DayRow[];
  todayDate: string;
  selected: string;
  onSelect: (date: string) => void;
}) {
  return (
    <div className="hscroll">
      {days.map((d) => {
        const isToday = todayDate === d.date;
        const isSel = selected === d.date;
        const h = d.max ?? 0;
        return (
          <button
            key={d.date}
            className="day-card"
            data-sel={isSel}
            aria-pressed={isSel}
            aria-label={`${isToday ? "Hoy" : weekdayOf(d.date)}, ${fmtShortDate(d.date)}`}
            onClick={() => onSelect(d.date)}
          >
            <span
              style={{
                fontSize: 10,
                fontWeight: 700,
                color: isSel || isToday ? "var(--tint-strong)" : "var(--label2)",
              }}
            >
              {isToday ? "Hoy" : weekdayOf(d.date)}
            </span>
            <span style={{ fontSize: 9, color: "var(--label3)" }}>
              {fmtShortDate(d.date)}
            </span>
            <span style={{ height: 56, display: "flex", alignItems: "flex-end" }}>
              <span
                className="bar"
                style={{ height: `${clamp((h / 450) * 100, 8, 100)}%`, background: heightColor(h) }}
              />
            </span>
            <span style={{ fontSize: 12, fontWeight: 600, color: "var(--label)" }}>
              {num0(d.max)}
            </span>
          </button>
        );
      })}
    </div>
  );
}

// Tagesleiste mit Wetter (Symbol, Max/Min, Regen)
function WeatherDayStrip({
  days,
  weather,
  todayDate,
  selected,
  onSelect,
}: {
  days: DayRow[];
  weather: DayWeather[];
  todayDate: string;
  selected: string;
  onSelect: (date: string) => void;
}) {
  return (
    <div className="hscroll">
      {days.map((d) => {
        const w = weather.find((x) => x.date === d.date);
        const isToday = todayDate === d.date;
        const isSel = selected === d.date;
        return (
          <button
            key={d.date}
            className="day-card wcard"
            data-sel={isSel}
            aria-pressed={isSel}
            aria-label={`${isToday ? "Hoy" : weekdayOf(d.date)}, ${fmtShortDate(d.date)}`}
            onClick={() => onSelect(d.date)}
          >
            <span
              style={{
                fontSize: 10,
                fontWeight: 700,
                color: isSel || isToday ? "var(--tint-strong)" : "var(--label2)",
              }}
            >
              {isToday ? "Hoy" : weekdayOf(d.date)}
            </span>
            <span style={{ fontSize: 9, color: "var(--label3)" }}>
              {fmtShortDate(d.date)}
            </span>
            <span style={{ fontSize: 12, fontWeight: 600, color: "var(--label)" }}>
              {w?.tMax != null ? `${Math.round(w.tMax)}°` : "–"}
            </span>
            <span style={{ fontSize: 10, color: "var(--label3)" }}>
              {w?.tMin != null ? `${Math.round(w.tMin)}°` : ""}
            </span>
            <span style={{ fontSize: 9, fontWeight: 600, color: "var(--tint-strong)", minHeight: 12 }}>
              {w?.precip != null ? `${num1(w.precip)} mm` : ""}
            </span>
          </button>
        );
      })}
    </div>
  );
}

// Wetterdetails eines Tages (Detailseite + Wetter-Tab)
function WeatherDetails({ w }: { w: DayWeather | undefined }) {
  if (!w) {
    return (
      <div className="detail-row">
        <span className="detail-k">Datos del clima no disponibles por ahora</span>
      </div>
    );
  }
  const cond = wmoInfo(w.code);
  const cell = (k: string, v: string, key: string) => (
    <div key={key} className="ios-cell-sep detail-row">
      <span className="detail-k">{k}</span>
      <span className="detail-v">{v}</span>
    </div>
  );
  return (
    <>
      <div className="detail-cond">
        <span>{cond.label}</span>
      </div>
      {cell(
        "Temperatura",
        `${w.tMax != null ? w.tMax.toFixed(0) : "–"}° / ${w.tMin != null ? w.tMin.toFixed(0) : "–"}°`,
        "temp"
      )}
      {cell(
        "Viento (máx)",
        `${w.windMax != null ? `${Math.round(w.windMax)} km/h · ${dirText(w.windDir)}` : "–"}`,
        "wind"
      )}
      {cell("Rachas (máx)", `${w.gustsMax != null ? `${Math.round(w.gustsMax)} km/h` : "–"}`, "gusts")}
      {cell("Lluvia", `${w.precip != null ? `${num1(w.precip)} mm` : "–"}`, "rain")}
      {cell(
        "Sol",
        `${(w.sunrise ?? "").slice(11, 16) || "–"} – ${(w.sunset ?? "").slice(11, 16) || "–"}`,
        "sun"
      )}
    </>
  );
}

// Tab-Bar unten (Liquid Glass, Safe-Area) – Home · Olas · Clima
function TabBar({ tab, onChange }: { tab: Tab; onChange: (t: Tab) => void }) {
  const items: { id: Tab; label: string }[] = [
    { id: "home", label: "Inicio" },
    { id: "waves", label: "Olas" },
    { id: "weather", label: "Clima" },
  ];
  const icon = (id: Tab, active: boolean) => {
    const stroke = active ? "var(--tint-strong)" : "var(--label2)";
    const common = {
      width: 25,
      height: 25,
      viewBox: "0 0 24 24",
      fill: "none",
      stroke,
      strokeWidth: 1.8,
      strokeLinecap: "round" as const,
      strokeLinejoin: "round" as const,
      "aria-hidden": true,
    };
    if (id === "home") {
      return (
        <svg {...common}>
          <path d="M3.4 10.6 12 3.4l8.6 7.2" />
          <path d="M5.6 9.6V20h12.8V9.6" />
          <path d="M9.8 20v-5.2h4.4V20" />
        </svg>
      );
    }
    if (id === "waves") {
      return (
        <svg {...common}>
          <path d="M2.6 8.2c1.7-1.5 3.4-1.5 5.1 0s3.4 1.5 5.1 0 3.4-1.5 5.1 0 3.4 1.5 3.5 0" />
          <path d="M2.6 13.2c1.7-1.5 3.4-1.5 5.1 0s3.4 1.5 5.1 0 3.4-1.5 5.1 0 3.4 1.5 3.5 0" />
          <path d="M2.6 18.2c1.7-1.5 3.4-1.5 5.1 0s3.4 1.5 5.1 0 3.4-1.5 5.1 0 3.4 1.5 3.5 0" />
        </svg>
      );
    }
    return (
      <svg {...common}>
        <circle cx="8.2" cy="7.6" r="2.9" />
        <path d="M8.2 2.2v1.3M8.2 11.7v1.3M3.4 7.6H2.1M14.3 7.6h-1.3M4.8 4.2 3.9 3.3M11.6 4.2l.9-.9" />
        <path d="M7.6 20.4h8.6a3.4 3.4 0 0 0 .4-6.8 4.6 4.6 0 0 0-8.7 1.2 3 3 0 0 0-.3 5.6Z" />
      </svg>
    );
  };
  return (
    <nav className="tab-bar" aria-label="Navegación principal">
      <div className="tab-bar-inner">
        {items.map((it) => {
          const active = tab === it.id;
          return (
            <button
              key={it.id}
              className="tab-item"
              data-active={active}
              aria-current={active ? "page" : undefined}
              onClick={() => onChange(it.id)}
            >
              <span className="tab-ico">{icon(it.id, active)}</span>
              <span>{it.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}

// ---------- Tages-Detailseite: Diagramm + Wetterdetails ----------
function DayDetail({
  day,
  weather,
  rows,
  nowX,
  spot,
}: {
  day: DayRow;
  weather: DayWeather | undefined;
  rows: HourRow[];
  nowX: string | null;
  spot: typeof SPOT;
}) {
  const dayRows = useMemo(
    () => quarterHourly(rows).filter((r) => dateOnly(r.x) === day.date),
    [rows, day.date]
  );
  const hasNow = dayRows.some((r) => r.x === nowX);
  return (
    <>
      {/* Großer Titel des Tages */}
      <h1 className="ios-large-title">{fmtDayLabel(day.date)}</h1>
      <p className="ios-subtitle">{spot.region} · Detalles del día</p>

      {/* Stunden-Diagramm der Wellenhöhe */}
      <section className="ios-card mt-5">
        <div className="px-5 pt-4 pb-1">
          <div className="ios-caption">Altura de ola · cada 15 min</div>
          <div style={{ fontSize: 13, color: "var(--label2)", marginBottom: 8 }}>
            Máximo del día {day.max != null ? `${num0(day.max)} cm` : "–"}
          </div>
        </div>
        <div className="px-2 pb-3">
          <WaveChart dayRows={dayRows} nowX={nowX} hasNow={hasNow} height={220} gradientId="waveGradDay" />
        </div>
      </section>

      {/* Wetterdetails des Tages */}
      <h3 className="ios-section-head mt-6 mb-2 px-1">Detalles del clima</h3>
      <section className="ios-card">
        <WeatherDetails w={weather} />
      </section>
    </>
  );
}

export default function App() {
  const [data, setData] = useState<WaveData | null>(null);
  const [weather, setWeather] = useState<DayWeather[]>([]);
  const [demo, setDemo] = useState(false);
  const [loading, setLoading] = useState(true);
  const [reloadKey, setReloadKey] = useState(0);
  // Tag der geöffneten Detailseite (null = keine Detailseite).
  // Das Diagramm auf Home zeigt immer nur heute (keine Tagesauswahl).
  const [detailDate, setDetailDate] = useState<string | null>(null);
  // Tagesauswahl in den Tabs „Olas" und „Clima" (null = heute)
  const [waveDate, setWaveDate] = useState<string | null>(null);
  const [weatherDate, setWeatherDate] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("home");
  const [scrolled, setScrolled] = useState(false);

  const spot = SPOT;
  const detailOpen = detailDate != null;

  useEffect(() => {
    let alive = true;
    setLoading(true);
    (async () => {
      let d: WaveData;
      let demoMode = false;
      try {
        d = await fetchWaveData(spot);
      } catch {
        d = makeDemoData(spot);
        demoMode = true;
      }
      // Wetter separat: bei Live-Wellen ohne Wetter einfach leer (Detailseite zeigt Hinweis),
      // im Demo-Modus synthetische Wetterdaten passend zum Demo-Wellenbild.
      let w: DayWeather[] = [];
      if (demoMode) {
        w = makeDemoWeather(d.days);
      } else {
        try {
          w = await fetchWeather(spot);
        } catch {
          w = [];
        }
      }
      if (!alive) return;
      setData(d);
      setWeather(w);
      setDemo(demoMode);
      setLoading(false);
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

  // Beim Öffnen einer Detailseite bzw. Tab-Wechsel oben starten
  useEffect(() => {
    if (detailOpen) window.scrollTo({ top: 0 });
  }, [detailOpen]);

  const rows = data?.rows ?? [];
  const nowRow = useMemo(() => {
    if (!data?.nowX) return null;
    const i = rows.findIndex((r) => r.x >= data.nowX!);
    return i >= 0 ? rows[i] : null;
  }, [rows, data?.nowX]);

  const todayKey = nowRow ? dateOnly(nowRow.x) : null;
  const todayMax = data?.days.find((d) => d.date === todayKey)?.max ?? null;
  const todayDate = todayKey ?? dateOnly(isoLocal(new Date()));

  // Gewählte Tage der Tabs (Fallback: heute, falls Tag nicht in den Daten)
  const hasDay = (d: string | null) => !!d && !!data?.days.some((x) => x.date === d);
  const waveSel = hasDay(waveDate) ? (waveDate as string) : todayDate;
  const weatherSel = hasDay(weatherDate) ? (weatherDate as string) : todayDate;

  const detailDayRow = useMemo(() => {
    if (!data?.days.length || !detailDate) return null;
    return data.days.find((d) => d.date === detailDate) ?? null;
  }, [data, detailDate]);
  const detailWeather = useMemo(
    () => weather.find((w) => w.date === detailDayRow?.date),
    [weather, detailDayRow]
  );

  // Home: ausschließlich heute · Olas: gewählter Tag – viertelstündig interpoliert
  const homeRows = useMemo(
    () => quarterHourly(rows).filter((r) => dateOnly(r.x) === todayDate),
    [rows, todayDate]
  );
  const waveRows = useMemo(
    () => quarterHourly(rows).filter((r) => dateOnly(r.x) === waveSel),
    [rows, waveSel]
  );
  const homeHasNow = homeRows.some((r) => r.x === data?.nowX);
  const waveHasNow = waveRows.some((r) => r.x === data?.nowX);

  const waveSelMax = data?.days.find((d) => d.date === waveSel)?.max ?? null;
  const weatherSelW = weather.find((w) => w.date === weatherSel);
  const weatherSelMax = data?.days.find((d) => d.date === weatherSel)?.max ?? null;
  const isTodaySel = (d: string) => d === todayDate;

  const changeTab = (t: Tab) => {
    setTab(t);
    setDetailDate(null);
    window.scrollTo({ top: 0 });
  };

  const navTitle = detailOpen ? "Detalles" : tab === "waves" ? "Olas" : tab === "weather" ? "Clima" : spot.name;

  return (
    <div className="sroot">

      {/* Liquid-Glass-Navigation (funktionale Schicht über dem Content) */}
      <header
        className="ios-nav"
        data-scrolled={scrolled}
        data-title={detailOpen || scrolled ? "true" : "false"}
      >
        <div className="nav-bar mx-auto max-w-xl px-4">
          <div className="nav-slot nav-slot-start">
            {detailOpen && (
              <button className="ios-back" onClick={() => setDetailDate(null)}>
                <span style={{ fontSize: 22, lineHeight: 1, marginRight: 2 }}>‹</span> Atrás
              </button>
            )}
          </div>
          <span className="ios-nav-title">{navTitle}</span>
          <div className="nav-slot nav-slot-end">
            <span
              className="ios-pill"
              style={{
                background: demo
                  ? "color-mix(in srgb, var(--tint-soft) 16%, transparent)"
                  : "color-mix(in srgb, var(--accent) 16%, transparent)",
                color: demo ? "var(--tint-soft)" : "var(--accent)",
              }}
            >
              {demo ? "DEMO" : "LIVE"}
            </span>
            <button
              onClick={() => setReloadKey((k) => k + 1)}
              disabled={loading}
              className="ios-refresh"
              title="Actualizar datos"
            >
              ↻
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-xl px-4 pt-6" style={{ paddingBottom: "calc(6rem + env(safe-area-inset-bottom))" }}>
        {loading && !data ? (
          <div className="space-y-4">
            <div className="h-28 rounded-2xl animate-pulse" style={{ background: "var(--fill2)" }} />
            <div className="h-24 rounded-2xl animate-pulse" style={{ background: "var(--fill2)" }} />
            <div className="h-64 rounded-2xl animate-pulse" style={{ background: "var(--fill2)" }} />
          </div>
        ) : detailOpen && detailDayRow ? (
          <div className="page-anim">
            <DayDetail
              day={detailDayRow}
              weather={detailWeather}
              rows={rows}
              nowX={data?.nowX ?? null}
              spot={spot}
            />
          </div>
        ) : tab === "waves" ? (
          /* ---------------- Tab: Olas ---------------- */
          <div className="page-anim" key="waves">
            <h1 className="ios-large-title">Olas</h1>
            <p className="ios-subtitle">{spot.region} · Altura cada 15 minutos y previsión de 7 días</p>

            {data && data.days.length > 0 && (
              <section className="mt-5">
                <h3 className="ios-section-head mb-2 px-1">Máximo por día · elegir día</h3>
                <WaveDayStrip
                  days={data.days}
                  todayDate={todayDate}
                  selected={waveSel}
                  onSelect={(d) => setWaveDate(d)}
                />
              </section>
            )}

            <section className="ios-card mt-4 p-4">
              <h3 className="section-title" style={{ marginBottom: 10 }}>
                Altura de ola · {isTodaySel(waveSel) ? "hoy" : fmtDayLabel(waveSel)}
              </h3>
              <div className="ios-caption" style={{ marginTop: -6, marginBottom: 12 }}>
                {fmtDayLabel(waveSel)} · Máximo del día {waveSelMax != null ? `${num0(waveSelMax)} cm` : "–"}
              </div>
              <WaveChart dayRows={waveRows} nowX={data?.nowX ?? null} hasNow={waveHasNow} height={280} gradientId="waveGradWaves" />
            </section>

            <p className="ios-caption mt-3 px-1">
              Toca un día arriba para avanzar a los próximos días en la previsión de 7 días.
            </p>
          </div>
        ) : tab === "weather" ? (
          /* ---------------- Tab: Clima ---------------- */
          <div className="page-anim" key="weather">
            <h1 className="ios-large-title">Clima</h1>
            <p className="ios-subtitle">{spot.region} · Clima y previsión de 7 días</p>

            {data && data.days.length > 0 && (
              <section className="mt-5">
                <h3 className="ios-section-head mb-2 px-1">Clima · elegir día</h3>
                <WeatherDayStrip
                  days={data.days}
                  weather={weather}
                  todayDate={todayDate}
                  selected={weatherSel}
                  onSelect={(d) => setWeatherDate(d)}
                />
              </section>
            )}

            <h3 className="ios-section-head mt-6 mb-2 px-1">
              Detalles del clima · {isTodaySel(weatherSel) ? "hoy" : fmtDayLabel(weatherSel)}
            </h3>
            <section className="ios-card">
              <WeatherDetails w={weatherSelW} />
            </section>

            <h3 className="ios-section-head mt-6 mb-2 px-1">Olas del día elegido</h3>
            <section className="ios-card p-4">
              <div className="ios-caption" style={{ marginBottom: 8 }}>
                {fmtDayLabel(weatherSel)} · Máximo del día {weatherSelMax != null ? `${num0(weatherSelMax)} cm` : "–"}
              </div>
              <WaveChart
                dayRows={quarterHourly(rows).filter((r) => dateOnly(r.x) === weatherSel)}
                nowX={data?.nowX ?? null}
                hasNow={quarterHourly(rows).some((r) => r.x === data?.nowX && dateOnly(r.x) === weatherSel)}
                height={200}
                gradientId="waveGradWeather"
              />
            </section>

            <p className="ios-caption mt-3 px-1">
              Toca un día arriba para avanzar a los próximos días en la previsión de 7 días.
            </p>
          </div>
        ) : (
          /* ---------------- Tab: Home ---------------- */
          <div className="page-anim" key="home">
            <h1 className="ios-large-title">{spot.name}</h1>
            <p className="ios-subtitle">{spot.region} · Desembocadura del Río Aconcagua</p>

            {/* Aktuelle Wellenhöhe – Hero-Karte in der Palette */}
            <section className="ios-card hero mt-5">
              <div className="px-5 pt-4 pb-1">
                <div className="flex items-center justify-between">
                  <div className="hero-caption">Altura de ola ahora</div>
                  <span className="now-chip">Ahora</span>
                </div>
                <div className="mt-1 flex items-baseline gap-2">
                  <span className="hero-value">{num0(nowRow?.h ?? null)}</span>
                  <span className="hero-unit">cm</span>
                </div>
                <div className="hero-meta">
                  {nowRow ? `${nowRow.x.slice(11, 16)} h` : "Sin datos"}
                  {todayMax != null && <> · máx hoy {num0(todayMax)} cm</>}
                </div>
              </div>
              <div className="hero-legend flex items-center gap-1.5 px-5 py-2.5" style={{ fontSize: 11 }}>
                <span className="bar" style={{ background: "var(--wv-1)", width: 18, height: 4 }} /> &lt;100
                <span className="ml-1 bar" style={{ background: "var(--wv-2)", width: 18, height: 4 }} /> 100–200
                <span className="ml-1 bar" style={{ background: "var(--wv-3)", width: 18, height: 4 }} /> 200–350
                <span className="ml-1 bar" style={{ background: "var(--wv-4)", width: 18, height: 4 }} /> 350+
                <span className="ml-1">cm</span>
                {loading && <span className="ml-auto">Actualizando…</span>}
              </div>
            </section>

            {/* Tagesübersicht */}
            {data && data.days.length > 0 && (
              <section className="mt-6">
                <h3 className="ios-section-head mb-2 px-1">Máximo por día · 7 días</h3>
                <WaveDayStrip
                  days={data.days}
                  todayDate={todayDate}
                  selected={todayDate}
                  onSelect={(d) => setDetailDate(d)}
                />
              </section>
            )}

            {/* Trend-Chart – immer nur heute */}
            <section className="ios-card mt-6 p-4">
              <h3 className="section-title" style={{ marginBottom: 12 }}>Altura de ola · hoy</h3>
              <div className="ios-caption" style={{ marginTop: -8, marginBottom: 12 }}>
                {fmtDayLabel(todayDate)} · cada 15 min
              </div>
              <WaveChart dayRows={homeRows} nowX={data?.nowX ?? null} hasNow={homeHasNow} height={256} gradientId="waveGrad" />
            </section>

            {/* Quellenangabe als Caption */}
            <p className="ios-caption mt-4 px-1" style={{ lineHeight: 1.5 }}>
              Datos brutos de los modelos de olas y clima de Open-Meteo (grilla de 8 km, actualización cada 6 horas) – sin score,
              sin algoritmo. {demo ? "Ahora se muestran datos de demostración porque la fuente en vivo no estaba disponible." : ""}
            </p>
          </div>
        )}
      </main>

      {/* Tab-Bar unten – wie in iOS-Apps */}
      <TabBar tab={tab} onChange={changeTab} />
    </div>
  );
}
