import { useCallback, useLayoutEffect, useRef, useState } from 'react';

export interface Point {
  x: number;
  y: number;
  /** Etiqueta que se muestra en el tooltip. */
  label: string;
  /** Valor ya formateado para el tooltip. */
  value: string;
}

interface Props {
  points: Point[];
  /** Color de la serie. Serie unica: el titulo la nombra, no hace falta leyenda. */
  color: string;
  /** Linea de referencia horizontal (objetivo, capital inicial...). */
  reference?: { y: number; label: string };
  /** Formateador del eje vertical. */
  formatY: (v: number) => string;
  /** Fuerza el rango vertical. Por defecto se ajusta a los datos. */
  domain?: [number, number];
  height?: number;
  ariaLabel: string;
}

const PAD = { top: 16, right: 16, bottom: 26, left: 46 };

/** Mide el ancho disponible para dibujar con coordenadas reales (texto sin deformar). */
function useWidth() {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(640);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    ro.observe(el);
    setWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);
  return [ref, width] as const;
}

export function LineChart({
  points,
  color,
  reference,
  formatY,
  domain,
  height = 220,
  ariaLabel,
}: Props) {
  const [ref, width] = useWidth();
  const [hover, setHover] = useState<number | null>(null);

  const w = Math.max(width, 260);
  const innerW = w - PAD.left - PAD.right;
  const innerH = height - PAD.top - PAD.bottom;

  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const xMin = Math.min(...xs, 0);
  const xMax = Math.max(...xs, 1);
  let [yMin, yMax] = domain ?? [Math.min(...ys), Math.max(...ys)];
  if (reference) {
    yMin = Math.min(yMin, reference.y);
    yMax = Math.max(yMax, reference.y);
  }
  if (yMin === yMax) {
    yMin -= 1;
    yMax += 1;
  }
  // Un poco de aire arriba y abajo para que la linea no toque los bordes.
  if (!domain) {
    const pad = (yMax - yMin) * 0.12;
    yMin -= pad;
    yMax += pad;
  }

  const sx = (x: number) => PAD.left + ((x - xMin) / (xMax - xMin || 1)) * innerW;
  const sy = (y: number) => PAD.top + innerH - ((y - yMin) / (yMax - yMin || 1)) * innerH;

  const onMove = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      if (points.length === 0) return;
      const rect = e.currentTarget.getBoundingClientRect();
      const px = e.clientX - rect.left;
      let best = 0;
      let bestD = Infinity;
      points.forEach((p, i) => {
        const d = Math.abs(sx(p.x) - px);
        if (d < bestD) {
          bestD = d;
          best = i;
        }
      });
      setHover(best);
    },
    [points, sx],
  );

  if (points.length === 0) {
    return (
      <div className="chartbox" ref={ref}>
        <p className="chartbox__empty">Todavia no hay datos suficientes.</p>
      </div>
    );
  }

  const line = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${sx(p.x).toFixed(1)},${sy(p.y).toFixed(1)}`).join(' ');
  const baseY = sy(Math.max(yMin, reference?.y ?? yMin));
  const area = `${line} L${sx(points[points.length - 1].x).toFixed(1)},${baseY.toFixed(1)} L${sx(points[0].x).toFixed(1)},${baseY.toFixed(1)} Z`;

  const ticks = 4;
  const gridY = Array.from({ length: ticks + 1 }, (_, i) => yMin + ((yMax - yMin) * i) / ticks);
  const last = points[points.length - 1];
  const active = hover !== null ? points[hover] : null;
  const gid = `grad-${color.replace('#', '')}`;

  return (
    <div className="chartbox" ref={ref}>
      <svg
        width={w}
        height={height}
        role="img"
        aria-label={ariaLabel}
        onPointerMove={onMove}
        onPointerLeave={() => setHover(null)}
        style={{ touchAction: 'pan-y' }}
      >
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.22" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* Rejilla recesiva: guia la lectura sin competir con los datos. */}
        {gridY.map((v, i) => (
          <g key={i}>
            <line
              x1={PAD.left}
              x2={w - PAD.right}
              y1={sy(v)}
              y2={sy(v)}
              className="chart-grid"
            />
            <text x={PAD.left - 8} y={sy(v)} className="chart-axis num" textAnchor="end" dominantBaseline="middle">
              {formatY(v)}
            </text>
          </g>
        ))}

        {reference && (
          <g>
            <line
              x1={PAD.left}
              x2={w - PAD.right}
              y1={sy(reference.y)}
              y2={sy(reference.y)}
              className="chart-ref"
            />
            <text x={w - PAD.right} y={sy(reference.y) - 6} className="chart-reftext" textAnchor="end">
              {reference.label}
            </text>
          </g>
        )}

        <path d={area} fill={`url(#${gid})`} />
        <path
          d={line}
          fill="none"
          stroke={color}
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Con pocos puntos, cada uno se marca; con muchos, la linea basta. */}
        {points.length <= 40 &&
          points.map((p, i) => (
            <circle key={i} cx={sx(p.x)} cy={sy(p.y)} r={4} fill={color} stroke="var(--surface-1)" strokeWidth={2} />
          ))}

        {/* Etiqueta directa del ultimo valor: evita tener que buscar en la leyenda. */}
        <circle cx={sx(last.x)} cy={sy(last.y)} r={4.5} fill={color} stroke="var(--surface-1)" strokeWidth={2} />

        {active && (
          <g pointerEvents="none">
            <line
              x1={sx(active.x)}
              x2={sx(active.x)}
              y1={PAD.top}
              y2={PAD.top + innerH}
              className="chart-crosshair"
            />
            <circle cx={sx(active.x)} cy={sy(active.y)} r={6} fill={color} stroke="var(--surface-1)" strokeWidth={2.5} />
          </g>
        )}

        <line x1={PAD.left} x2={w - PAD.right} y1={PAD.top + innerH} y2={PAD.top + innerH} className="chart-axisline" />
      </svg>

      {active && (
        <div
          className="chart-tip"
          style={{
            left: Math.min(Math.max(sx(active.x), 70), w - 70),
            top: sy(active.y) - 14,
          }}
        >
          <span className="chart-tip__label">{active.label}</span>
          <span className="chart-tip__value num">{active.value}</span>
        </div>
      )}
    </div>
  );
}
