# Swell Scope 🌊

App de pronóstico de surf para **La Boca** – la desembocadura del Río Aconcagua en Concón, Valparaíso (Chile).

Datos brutos en vez de algoritmos de score secretos: la app muestra la altura de ola directamente desde los
modelos de olas de Open-Meteo (grilla de 8 km, actualización cada 6 horas) – sin score,
sin algoritmo. La decisión es tuya.

La interfaz sigue las Apple Human Interface Guidelines (Designing for iOS): tipografía del sistema SF,
modo claro/oscuro automático con colores del sistema iOS, título grande, barra de navegación translúcida,
tarjetas agrupadas y soporte de safe area.

## Funciones (paso 1)

- Altura de ola actual, con color según el tamaño, más el máximo del día
- Tab bar inferior (Liquid Glass, safe area): **Inicio · Olas · Clima**
- Resumen de 7 días del máximo diario, idéntico en Inicio y Olas
- Inicio: gráfico del día de hoy (por hora) con marca de „ahora“ – fijo en el día actual
- Olas: barra de días para saltar a los próximos días + gráfico por hora del día elegido
- Clima: barra de días con símbolo/máx/mín/lluvia, detalles del clima y gráfico de olas del día elegido
- Detalle del día con gráfico por hora y datos de clima
- Badge LIVE/DEMO con fallback automático a datos de demostración sin conexión

## Stack

- React 19 + TypeScript + Vite
- Recharts para los gráficos
- [Open-Meteo Marine API](https://open-meteo.com/en/docs/marine-weather-api) (gratis, sin API key)
- Proyecto Supabase `swell-scope` (sa-east-1) – preparado para journal y sync
- Deploy en Vercel

## Desarrollo

```bash
npm install
npm run dev
```

## Build

```bash
npm run build   # → dist/
```

## Roadmap

- [ ] Período y dirección
- [ ] Viento con lógica onshore/offshore
- [ ] Marea y salida/puesta del sol
- [ ] Journal de surf con auto-import (Supabase)
- [ ] Similar Sessions
