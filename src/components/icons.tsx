import type { SVGProps } from 'react';

type IconProps = SVGProps<SVGSVGElement>;

function base(props: IconProps) {
  return {
    width: 22,
    height: 22,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.8,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
    ...props,
  };
}

export const HomeIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M3 11.5 12 4l9 7.5" />
    <path d="M5.5 10v9.5h13V10" />
  </svg>
);

export const ChartIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M6 4v16M6 8h-1.5v7H6M6 8h1.5v7H6" />
    <path d="M12 6v12M12 9h-1.5v5H12M12 9h1.5v5H12" />
    <path d="M18 3v15M18 6h-1.5v8H18M18 6h1.5v8H18" />
  </svg>
);

export const BookIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5z" />
    <path d="M4 20.5A2.5 2.5 0 0 0 6.5 23H20v-5" />
    <path d="M8 7.5h8M8 11h6" />
  </svg>
);

export const FlaskIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M9 3h6M10 3v6.5L4.8 18.2A1.8 1.8 0 0 0 6.4 21h11.2a1.8 1.8 0 0 0 1.6-2.8L14 9.5V3" />
    <path d="M7.5 15h9" />
  </svg>
);

export const GearIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
  </svg>
);

export const InfoIcon = (p: IconProps) => (
  <svg {...base({ width: 18, height: 18, ...p })}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 11v5M12 7.5v.5" />
  </svg>
);

export const CloseIcon = (p: IconProps) => (
  <svg {...base({ width: 18, height: 18, ...p })}>
    <path d="M6 6l12 12M18 6 6 18" />
  </svg>
);

/** 走勢預測：實線是過去，虛線是未來的可能範圍 */
export const LabIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <rect x="4" y="8" width="16" height="11" rx="3" />
    <path d="M12 8V5.5" />
    <circle cx="12" cy="4.2" r="1.2" />
    <path d="M9.5 12.5v1M14.5 12.5v1M9.5 16h5" />
  </svg>
);

export const ForecastIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M3 17l4-5 3 2 4-6" />
    <path d="M14 8l3 2 4-3M14 8l3 6 4 1" strokeDasharray="2 2.2" />
  </svg>
);

export const RulerIcon = (p: IconProps) => (
  <svg {...base({ width: 18, height: 18, ...p })}>
    <path d="M3 16.5 16.5 3 21 7.5 7.5 21z" />
    <path d="M7.5 12l2 2M10.5 9l2 2M13.5 6l2 2" />
  </svg>
);

export const SlidersIcon = (p: IconProps) => (
  <svg {...base({ width: 18, height: 18, ...p })}>
    <path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0" />
    <circle cx="16" cy="6" r="2" />
    <circle cx="10" cy="12" r="2" />
    <circle cx="18" cy="18" r="2" />
  </svg>
);

export const PlusIcon = (p: IconProps) => (
  <svg {...base({ width: 18, height: 18, ...p })}>
    <path d="M12 5v14M5 12h14" />
  </svg>
);

export const ChevronRightIcon = (p: IconProps) => (
  <svg {...base({ width: 18, height: 18, ...p })}>
    <path d="m9 6 6 6-6 6" />
  </svg>
);

export const LogoMark = (p: IconProps) => (
  <svg width={28} height={28} viewBox="0 0 32 32" aria-hidden {...p}>
    <rect width="32" height="32" rx="8" fill="#0f172a" />
    <path d="M9 7v18" stroke="#f05252" strokeWidth="1.6" />
    <rect x="6.5" y="11" width="5" height="9" rx="1" fill="#f05252" />
    <path d="M16 5v20" stroke="#22c55e" strokeWidth="1.6" />
    <rect x="13.5" y="9" width="5" height="8" rx="1" fill="#22c55e" />
    <path d="M23 8v17" stroke="#f05252" strokeWidth="1.6" />
    <rect x="20.5" y="12" width="5" height="10" rx="1" fill="#f05252" />
    <path d="M5 23c5-2 7-8 11-9s7 2 11-4" stroke="#60a5fa" strokeWidth="1.8" fill="none" strokeLinecap="round" />
  </svg>
);
