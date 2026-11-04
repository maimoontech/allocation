/**
 * BMI shown as an analog speedometer, for Tab 6.
 *
 * Display only: the figure comes from `computeBmi` (or the stored value), and this draws it.
 * The bands are the WHO adult cut-offs the member is most likely to know — under 18.5,
 * 18.5 up to 25, and 25 and above.
 *
 * The readout window above the dial carries the exact value. It stays empty, rather than
 * showing a zero, until both height and weight are entered.
 */

import { BMI_BANDS, BMI_SCALE_MAX, BMI_SCALE_MIN, bmiCategory } from "./shared";

/** The dial sweeps 240°, from 8 o'clock to 4 o'clock, like a car speedometer. */
const SWEEP = 240;

const CX = 130;
const CY = 130;

/** Degrees clockwise from 12 o'clock for a BMI value, clamped to the printed scale. */
function angleFor(value: number) {
  const clamped = Math.min(BMI_SCALE_MAX, Math.max(BMI_SCALE_MIN, value));
  return -SWEEP / 2 + ((clamped - BMI_SCALE_MIN) / (BMI_SCALE_MAX - BMI_SCALE_MIN)) * SWEEP;
}

function point(angleDeg: number, radius: number) {
  const rad = (angleDeg * Math.PI) / 180;
  return { x: CX + radius * Math.sin(rad), y: CY - radius * Math.cos(rad) };
}

function arc(fromValue: number, toValue: number, radius: number) {
  const a1 = angleFor(fromValue);
  const a2 = angleFor(toValue);
  const start = point(a1, radius);
  const end = point(a2, radius);
  const large = a2 - a1 > 180 ? 1 : 0;
  return `M ${start.x} ${start.y} A ${radius} ${radius} 0 ${large} 1 ${end.x} ${end.y}`;
}

const TICKS = Array.from({ length: BMI_SCALE_MAX - BMI_SCALE_MIN + 1 }, (_, i) => BMI_SCALE_MIN + i);
const NUMERALS = TICKS.filter((v) => v % 5 === 0);

export function BmiMeter({ bmi }: { bmi: number | null }) {
  const category = bmi == null ? null : bmiCategory(bmi);
  const band = BMI_BANDS.find((b) => b.id === category) ?? null;
  const needleAngle = angleFor(bmi ?? BMI_SCALE_MIN);

  return (
    <figure className="mx-auto w-full max-w-[300px]">
      {/* Readout window: empty until there is a value to show. */}
      <div className="mx-auto mb-[-14px] w-40 rounded-t-lg border border-b-0 border-[#3a3a3a] bg-[#2a2a2a] px-2 pt-2">
        <div
          aria-hidden="true"
          className="flex h-12 flex-col items-center justify-center rounded border border-[#111] bg-[#f4f6f0] shadow-[inset_0_2px_4px_rgba(0,0,0,0.35)]"
        >
          {bmi != null ? (
            <>
              <span className="text-xl font-semibold leading-none tabular-nums text-[#1b1b1b]">
                {bmi.toFixed(1)}
              </span>
              <span className="mt-0.5 text-[11px] font-semibold" style={{ color: band?.colour }}>
                {band?.label}
              </span>
            </>
          ) : null}
        </div>
      </div>

      <svg
        viewBox="0 0 260 260"
        role="meter"
        aria-label="Body mass index meter"
        aria-valuemin={BMI_SCALE_MIN}
        aria-valuemax={BMI_SCALE_MAX}
        aria-valuenow={bmi ?? undefined}
        aria-valuetext={
          bmi == null ? "Not calculated yet" : `${bmi.toFixed(1)}, ${band?.label ?? ""}`
        }
        className="block w-full"
      >
        <defs>
          <linearGradient id="bmi-bezel" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#5a5a5a" />
            <stop offset="1" stopColor="#1a1a1a" />
          </linearGradient>
          <radialGradient id="bmi-face" cx="0.5" cy="0.45" r="0.6">
            <stop offset="0" stopColor="#30343a" />
            <stop offset="1" stopColor="#121417" />
          </radialGradient>
        </defs>

        {/* Bezel and face */}
        <circle cx={CX} cy={CY} r={124} fill="url(#bmi-bezel)" />
        <circle cx={CX} cy={CY} r={116} fill="url(#bmi-face)" />

        {/* Coloured bands */}
        {BMI_BANDS.map((b) => (
          <path
            key={b.id}
            d={arc(b.from, b.to, 101)}
            fill="none"
            stroke={b.colour}
            strokeWidth={10}
          />
        ))}

        {/* Ticks: a long one every 5, a short one every 1 */}
        {TICKS.map((v) => {
          const major = v % 5 === 0;
          const a = angleFor(v);
          const outer = point(a, 94);
          const inner = point(a, major ? 82 : 88);
          return (
            <line
              key={v}
              x1={outer.x}
              y1={outer.y}
              x2={inner.x}
              y2={inner.y}
              stroke={major ? "#f2f2f2" : "#8a8a8a"}
              strokeWidth={major ? 2.5 : 1.2}
              strokeLinecap="round"
            />
          );
        })}

        {/* The 18.5 boundary falls between ticks, so it gets its own marker. */}
        {(() => {
          const a = angleFor(18.5);
          const outer = point(a, 94);
          const inner = point(a, 84);
          return (
            <line x1={outer.x} y1={outer.y} x2={inner.x} y2={inner.y} stroke="#f2f2f2" strokeWidth={2} />
          );
        })()}

        {NUMERALS.map((v) => {
          const p = point(angleFor(v), 68);
          return (
            <text
              key={v}
              x={p.x}
              y={p.y}
              textAnchor="middle"
              dominantBaseline="central"
              fill="#e6e6e6"
              fontSize="14"
              fontWeight="600"
            >
              {v}
            </text>
          );
        })}

        {/* Unit, where a speedometer prints km/h */}
        <text x={CX} y={CY + 46} textAnchor="middle" fill="#e6e6e6" fontSize="13" fontWeight="600">
          BMI
        </text>
        <text x={CX} y={CY + 62} textAnchor="middle" fill="#9a9a9a" fontSize="10">
          kg/m²
        </text>

        {/* Needle */}
        <g
          className="motion-safe:transition-transform motion-safe:duration-700 motion-safe:ease-[cubic-bezier(0.34,1.36,0.64,1)]"
          style={{ transform: `rotate(${needleAngle}deg)`, transformOrigin: `${CX}px ${CY}px` }}
        >
          <polygon
            points={`${CX - 4},${CY + 4} ${CX},${CY - 92} ${CX + 4},${CY + 4} ${CX},${CY + 18}`}
            // Grey at rest, so an empty meter does not read as a BMI of 10.
            fill={bmi == null ? "#8a8a8a" : "#e81123"}
          />
        </g>
        <circle cx={CX} cy={CY} r={11} fill="#d9d9d9" stroke="#1a1a1a" strokeWidth={2} />
        <circle cx={CX} cy={CY} r={4} fill="#e81123" />
      </svg>

      <figcaption>
        <ul className="mt-1 flex flex-wrap justify-center gap-x-4 gap-y-1 text-xs">
          {BMI_BANDS.map((b) => (
            <li
              key={b.id}
              className={`flex items-center gap-1.5 ${
                category === b.id ? "font-semibold text-textPrimary" : "text-textMuted"
              }`}
            >
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: b.colour }} />
              {b.label} <span className="font-normal text-textMuted">{b.range}</span>
            </li>
          ))}
        </ul>
        {bmi == null ? (
          <p className="mt-2 text-center text-xs text-textMuted">
            Enter your height and weight to see your BMI.
          </p>
        ) : null}
      </figcaption>
    </figure>
  );
}
