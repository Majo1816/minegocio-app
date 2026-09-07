import React from "react";

// Iconos tomados 1:1 del sistema de diseño de Café Tierra Querida
const ICONS = {
  home: { paths: ["M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z", "M9 22L9 12L15 12L15 22"] },
  logout: { paths: ["M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4", "M16 17L21 12L16 7", "M21 12L9 12"] },
  arrowDown: { paths: ["M12 5v14", "M19 12l-7 7-7-7"] },
  cart: { paths: ["M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"], circles: [{ cx: 9, cy: 21, r: 1 }, { cx: 20, cy: 21, r: 1 }] },
  receipt: { paths: ["M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z", "M14 2L14 8L20 8", "M8 13L16 13", "M8 17L12 17"] },
  package: { paths: ["M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z", "M3.27 6.96L12 12.01L20.73 6.96", "M12 22.08L12 12"] },
  crate: { paths: ["M21 8V21H3V8", "M1 3h22v5H1z", "M10 12L14 12"] },
  bars: { paths: ["M18 20L18 10", "M12 20L12 4", "M6 20L6 14"] },
  mic: { paths: ["M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z", "M19 10v2a7 7 0 0 1-14 0v-2", "M12 19L12 23"] },
  check: { paths: ["M20 6L9 17L4 12"] },
  alertTriangle: { paths: ["M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z", "M12 9L12 13", "M12 17L12.01 17"] },
  chevronRight: { paths: ["M9 5l7 7-7 7"] },
  users: { paths: ["M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2", "M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z", "M23 21v-2a4 4 0 0 0-3-3.87", "M16 3.13a4 4 0 0 1 0 7.75"] },
  truck: { paths: ["M1 3h15v13H1z", "M16 8h4l3 3v5h-7V8z"], circles: [{ cx: 5.5, cy: 18.5, r: 2.5 }, { cx: 18.5, cy: 18.5, r: 2.5 }] },
  plus: { paths: ["M12 5v14", "M5 12h14"] },
  minus: { paths: ["M5 12h14"] },
  calendar: { paths: ["M3 4h18v18H3z", "M16 2L16 6", "M8 2L8 6", "M3 10L21 10"] },
};

export default function Icon({ name, size = 18, color = "currentColor", className = "" }) {
  const def = ICONS[name];
  if (!def) return null;
  return (
    <svg
      width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color}
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      className={className} style={{ display: "inline-block", verticalAlign: "middle", flexShrink: 0 }}
      aria-hidden="true"
    >
      {def.paths.map((d, i) => <path key={i} d={d} />)}
      {def.circles?.map((c, i) => <circle key={i} cx={c.cx} cy={c.cy} r={c.r} />)}
    </svg>
  );
}

export function GoogleIcon({ size = 19 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" style={{ flexShrink: 0 }}>
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.9 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.1 8 3l5.7-5.7C34.6 6.1 29.6 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.7-.4-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.6 15.9 18.9 13 24 13c3.1 0 5.8 1.1 8 3l5.7-5.7C34.6 6.1 29.6 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.5 0 10.4-1.9 14.3-5.1l-6.6-5.6C29.6 35 26.9 36 24 36c-5.3 0-9.7-3.1-11.3-7.6l-6.5 5C9.6 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.3-2.3 4.3-4.2 5.7l6.6 5.6C41.6 36 44 30.6 44 24c0-1.3-.1-2.7-.4-3.5z" />
    </svg>
  );
}
