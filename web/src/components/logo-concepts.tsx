import { useId, type ReactNode } from 'react';

const VIOLET = '#7a5cff';
const BLUE = '#2e7bff';
const MID = '#5568ff';

export interface LogoConcept {
  id: string;
  label: string;
  name: string;
  tagline: string;
  meaning: string;
  node: ReactNode;
}

const StarSpark = ({
  cx,
  cy,
  R = 4,
  r = 3,
  fill = '#ffffff',
}: {
  cx: number;
  cy: number;
  R?: number;
  r?: number;
  fill?: string;
}) => {
  const d = Math.SQRT2 * r;
  return (
    <path
      d={`M${cx} ${cy - R} L${cx + d} ${cy - d} L${cx + R} ${cy} L${cx + d} ${cy + d} L${cx} ${cy + R} L${cx - d} ${cy + d} L${cx - R} ${cy} L${cx - d} ${cy - d} Z`}
      fill={fill}
    />
  );
};

const gradStop = (id: string) => (
  <linearGradient id={id} x1="0" y1="96" x2="96" y2="0" gradientUnits="userSpaceOnUse">
    <stop offset="0" stopColor={VIOLET} />
    <stop offset="1" stopColor={BLUE} />
  </linearGradient>
);

/* A — Éternité: the endless dialogue. A tilted ribbon of light that loops
   through the "S" into infinity, tied with a white spark at its crossing. */
const Eternite = () => {
  const id = useId();
  return (
    <svg width={112} height={112} viewBox="0 0 96 96" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <defs>{gradStop(id)}</defs>
      <g transform="rotate(-12 48 48)">
        <path
          d="M30 48 C30 30, 44 22, 48 22 C52 22, 66 30, 66 48 C66 66, 52 74, 48 74 C44 74, 30 66, 30 48 Z"
          stroke={`url(#${id})`}
          strokeWidth="9"
          strokeLinecap="round"
          fill="none"
          opacity="0.95"
        />
      </g>
      <StarSpark cx={48} cy={48} R={7} r={4} fill="#ffffff" />
    </svg>
  );
};

/* B — Ignition: the launch of an idea. A comet of light lifts off from a quiet
   question, leaving a trail that answers the sky. */
const Ignition = () => {
  const id = useId();
  return (
    <svg width={112} height={112} viewBox="0 0 96 96" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <defs>{gradStop(id)}</defs>
      <path d="M24 58 C42 54, 56 46, 64 30" stroke={`url(#${id})`} strokeWidth="2.5" strokeLinecap="round" opacity="0.4" fill="none" />
      <path d="M16 66 C36 64, 58 52, 68 22" stroke={`url(#${id})`} strokeWidth="6" strokeLinecap="round" fill="none" />
      <circle cx="70" cy="18" r="10" fill={`url(#${id})`} />
      <circle cx="67" cy="15" r="4" fill="#ffffff" opacity="0.45" />
    </svg>
  );
};

/* C — Bridge: the light between two minds. Two voices face each other beneath
   an arch of falling light, a spark where their arcs meet. */
const Bridge = () => {
  const id = useId();
  return (
    <svg width={112} height={112} viewBox="0 0 96 96" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <defs>{gradStop(id)}</defs>
      <rect x="10" y="46" width="22" height="18" rx="6" fill={VIOLET} />
      <path d="M16 62 L24 62 L22 68 Z" fill={VIOLET} />
      <rect x="64" y="46" width="22" height="18" rx="6" fill={BLUE} />
      <path d="M72 62 L80 62 L74 68 Z" fill={BLUE} />
      <path
        d="M28 58 C34 32, 62 32, 68 58"
        stroke={`url(#${id})`}
        strokeWidth="5"
        strokeLinecap="round"
        fill="none"
        opacity="0.9"
      />
      <StarSpark cx={48} cy={33} R={7} r={4} fill="#ffffff" />
    </svg>
  );
};

/* D — Sapling: the seed is a question. Two young leaves, shaped like the first
   lines of a conversation, rise to open a single spark of blossom. */
const Sapling = () => {
  const id = useId();
  return (
    <svg width={112} height={112} viewBox="0 0 96 96" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <defs>{gradStop(id)}</defs>
      <path d="M50 46 C50 56, 52 64, 50 72" stroke={`url(#${id})`} strokeWidth="5" strokeLinecap="round" fill="none" />
      <path d="M43 77 L52 74 L57 82 Z" fill={`url(#${id})`} opacity="0.85" />
      <g transform="rotate(24 60 42)">
        <rect x="42" y="32" width="22" height="15" rx="7" stroke={BLUE} strokeWidth="4.5" fill="none" />
        <path d="M50 45 L44 53" stroke={BLUE} strokeWidth="4.5" strokeLinecap="round" />
        <circle cx="53" cy="40" r="3" fill={BLUE} />
      </g>
      <g transform="rotate(-24 36 42)">
        <rect x="32" y="36" width="22" height="15" rx="7" stroke={VIOLET} strokeWidth="4.5" fill="none" />
        <path d="M46 45 L41 53" stroke={VIOLET} strokeWidth="4.5" strokeLinecap="round" />
        <circle cx="43" cy="44" r="3" fill={VIOLET} />
      </g>
      <StarSpark cx={35} cy={36} R={4} r={2} fill={MID} />
      <StarSpark cx={59} cy={28} R={4.5} r={2.2} fill={BLUE} />
    </svg>
  );
};

/* E — Prism: one light, many perspectives. A radiant heart of dialogue from
   which six petals of perspective unfurl, each a colour of the same truth. */
const Prism = () => {
  const id = useId();
  const petals = [
    { a: 0, o: 0.85 },
    { a: 60, o: 0.6 },
    { a: 120, o: 0.85 },
    { a: 180, o: 0.6 },
    { a: 240, o: 0.85 },
    { a: 300, o: 0.6 },
  ];
  return (
    <svg width={112} height={112} viewBox="0 0 96 96" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <defs>{gradStop(id)}</defs>
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
      <circle cx="48" cy="48" r="10" fill={`url(#${id})`} />
      <circle cx="45" cy="45" r="4" fill="#ffffff" opacity="0.4" />
      <StarSpark cx={48} cy={48} R={4} r={2.2} fill="#ffffff" />
    </svg>
  );
};

export const logoConcepts: LogoConcept[] = [
  {
    id: 'A',
    label: 'Option A',
    name: 'Éternité',
    tagline: 'The endless dialogue',
    meaning:
      'A ribbon of light loops through the "S" into infinity — intelligence that never stops learning, conversation with no beginning or end.',
    node: <Eternite />,
  },
  {
    id: 'B',
    label: 'Option B',
    name: 'Ignition',
    tagline: 'The launch of an idea',
    meaning:
      'A comet of light lifts off from a quiet question. Every answer begins as a single spark of curiosity.',
    node: <Ignition />,
  },
  {
    id: 'C',
    label: 'Option C',
    name: 'Bridge',
    tagline: 'Light between two minds',
    meaning:
      'Two voices face each other beneath an arch of light — a bridge instantly built the moment two people begin to speak.',
    node: <Bridge />,
  },
  {
    id: 'D',
    label: 'Option D',
    name: 'Sapling',
    tagline: 'The seed is a question',
    meaning:
      'Two young leaves grow from a chat, opening into a spark of blossom. Nurture a question and it becomes a garden.',
    node: <Sapling />,
  },
  {
    id: 'E',
    label: 'Option E',
    name: 'Prism',
    tagline: 'One light, many perspectives',
    meaning:
      'One radiant heart of dialogue from which petals of perspective unfurl — the same truth, seen from every angle.',
    node: <Prism />,
  },
];