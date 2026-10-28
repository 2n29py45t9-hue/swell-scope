# Swell Scope 🌊

Surf-Forecast-App für **La Boca** – die Mündung des Río Aconcagua in Concón, Valparaíso (Chile).

Rohdaten statt geheimer Score-Algorithmen: Die App zeigt die Wellenhöhe direkt aus den
Wellenmodellen von Open-Meteo (8-km-Grid, Aktualisierung alle 6 Stunden) – kein Score,
kein Algorithmus. Der Call bleibt bei dir.

Die UI folgt Apples Human Interface Guidelines (Designing for iOS): SF-Systemfont,
automatischer Light-/Dark-Mode mit iOS-Systemfarben, großer Titel, transluzente
Navigationsleiste, gruppierte Karten, Safe-Area-Support.

## Features (Schritt 1)

- Aktuelle Wellenhöhe, farbcodiert nach Größenordnung, plus Tagesmaximum
- Tab-Bar unten (Liquid Glass, Safe-Area): **Home · Wellen · Wetter**
- 7-Tage-Übersicht des Tagesmaximums, auf Home und Wellen identisch
- Home: Tages-Chart für heute (stündlich) mit „jetzt“-Markierung – fest auf den aktuellen Tag
- Wellen: Tagesleiste zum Springen auf einen der nächsten Tage + Stunden-Chart des Tages
- Wetter: Tagesleiste mit Symbol/Max/Min/Regen, Wetterdetails und Wellen-Chart des gewählten Tags
- LIVE/DEMO-Badge mit automatischem Offline-Fallback auf Demo-Daten

## Stack

- React 19 + TypeScript + Vite
- Recharts für die Trend-Charts
- [Open-Meteo Marine API](https://open-meteo.com/en/docs/marine-weather-api) (gratis, ohne API-Key)
- Supabase-Projekt `swell-scope` (sa-east-1) – vorbereitet für Journal & Sync
- Deploy über Vercel

## Entwicklung

```bash
npm install
npm run dev
```

## Build

```bash
npm run build   # → dist/
```

## Roadmap

- [ ] Periode & Richtung
- [ ] Wind mit Onshore/Offshore-Logik
- [ ] Tide & Sonnenauf-/untergang
- [ ] Surf-Journal mit Auto-Import (Supabase)
- [ ] Similar Sessions
