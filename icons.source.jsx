import React from "react";

const paths = {
  home: "M4 11.5 12 4l8 7.5 M6 10v9h5v-5h2v5h5v-9",
  "arrow-down-circle": "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Z M12 8v7 M8.5 12 12 15.5 15.5 12",
  "shopping-cart": "M3 4h2l2.2 11.4a2 2 0 0 0 2 1.6h7.6a2 2 0 0 0 2-1.6L21 8H6 M9.5 21a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z M17 21a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z",
  receipt: "M6 3h12v18l-2.5-1.5L13 21l-2.5-1.5L8 21l-2-1.5V3Z M9 8h6 M9 12h6 M9 16h4",
  package: "M3.5 7.5 12 3l8.5 4.5V16.5L12 21l-8.5-4.5Z M3.5 7.5 12 12l8.5-4.5 M12 12v9",
  "chart-bar": "M4 20V10 M10 20V4 M16 20v-7 M22 20H2",
  microphone: "M12 15a3 3 0 0 0 3-3V6a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3Z M6 11v1a6 6 0 0 0 12 0v-1 M12 18v3 M9 21h6",
  "alert-triangle": "M12 3 22 20H2Z M12 9v5 M12 17.2v.1",
  "chevron-right": "M9 5l7 7-7 7",
  users: "M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z M3 20c0-3.3 2.7-5.5 6-5.5s6 2.2 6 5.5 M16.5 8.5a2.8 2.8 0 1 0 0-5.6 2.8 2.8 0 0 0 0 5.6Z M15.5 14.3c2.5.4 4.5 2.3 4.5 5.2",
  truck: "M2.5 6.5h10v9h-10Z M12.5 10.5h4l3 3v2h-7Z M6 19.5a1.7 1.7 0 1 0 0-3.4 1.7 1.7 0 0 0 0 3.4Z M16.5 19.5a1.7 1.7 0 1 0 0-3.4 1.7 1.7 0 0 0 0 3.4Z",
  settings: "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z M12 2v3 M12 19v3 M4.2 4.2l2.1 2.1 M17.7 17.7l2.1 2.1 M2 12h3 M19 12h3 M4.2 19.8l2.1-2.1 M17.7 6.3l2.1-2.1",
  logout: "M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4 M16 17l5-5-5-5 M21 12H9",
};

export default function Icon({ name, size = 18, color = "currentColor", className = "" }) {
  const d = paths[name];
  if (!d) return null;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      style={{ display: "inline-block", verticalAlign: "middle", flexShrink: 0 }}
      aria-hidden="true"
    >
      {d.split(" M").map((seg, i) => (
        <path key={i} d={i === 0 ? seg : "M" + seg} />
      ))}
    </svg>
  );
}
