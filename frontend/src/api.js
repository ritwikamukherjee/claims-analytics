export async function getJSON(path) {
  const res = await fetch(`/api${path}`);
  if (!res.ok) {
    let msg = `Request failed (${res.status})`;
    try {
      const body = await res.json();
      if (body.error) msg = body.error;
    } catch (_) {}
    throw new Error(msg);
  }
  return res.json();
}

export const fmtUSD = (v) => {
  if (v == null || isNaN(v)) return "-";
  const n = Number(v);
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (Math.abs(n) >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n.toFixed(0)}`;
};

export const fmtUSDfull = (v) =>
  v == null || isNaN(v)
    ? "-"
    : Number(v).toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

export const fmtNum = (v) =>
  v == null || isNaN(v) ? "-" : Number(v).toLocaleString("en-US");

export const fmtPct = (v, digits = 1) =>
  v == null || isNaN(v) ? "-" : `${Number(v).toFixed(digits)}%`;

// value already a fraction 0..1
export const fmtRate = (v, digits = 1) =>
  v == null || isNaN(v) ? "-" : `${(Number(v) * 100).toFixed(digits)}%`;
