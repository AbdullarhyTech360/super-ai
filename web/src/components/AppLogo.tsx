import { useId } from 'react';

interface AppLogoProps {
  size?: number;
  className?: string;
}

const VIOLET = '#7a5cff';
const BLUE = '#2e7bff';

const AppLogo = ({ size = 32, className }: AppLogoProps) => {
  const gradientId = useId();
  const petals = [
    { a: 0, o: 0.85 },
    { a: 60, o: 0.6 },
    { a: 120, o: 0.85 },
    { a: 180, o: 0.6 },
    { a: 240, o: 0.85 },
    { a: 300, o: 0.6 },
  ];

  const starPath = (cx: number, cy: number, R: number) => {
    const r = R / Math.SQRT2;
    const d = r;
    return `M${cx} ${cy - R} L${cx + d} ${cy - d} L${cx + R} ${cy} L${cx + d} ${cy + d} L${cx} ${cy + R} L${cx - d} ${cy + d} L${cx - R} ${cy} L${cx - d} ${cy - d} Z`;
  };

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 96 96"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="96" x2="96" y2="0" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor={VIOLET} />
          <stop offset="1" stopColor={BLUE} />
        </linearGradient>
      </defs>
      {petals.map((p, i) => {
        const rad = (p.a * Math.PI) / 180;
        const cx = 48 + 26 * Math.sin(rad);
        const cy = 48 - 26 * Math.cos(rad);
        return (
          <g key={i} transform={`rotate(${p.a} ${cx} ${cy})`}>
            <rect
              x={cx - 7}
              y={cy - 9}
              width="14"
              height="18"
              rx="7"
              fill={p.a < 180 ? BLUE : VIOLET}
              opacity={Math.round(p.o * 100) / 100}
            />
          </g>
        );
      })}
      <circle cx="48" cy="48" r="10" fill={`url(#${gradientId})`} />
      <circle cx="45" cy="45" r="4" fill="#ffffff" opacity="0.4" />
      <path d={starPath(48, 48, 4)} fill="#ffffff" />
    </svg>
  );
};

export default AppLogo;
