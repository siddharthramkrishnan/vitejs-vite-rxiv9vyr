import { useState, useEffect, useMemo } from 'react';

const TODAY = new Date('2026-06-03');
const SHEET_ID =
  '2PACX-1vQ3kQLUJGUpIEU45v5omXE41qAbRZEUA7v0Y7754cpjIh2-tUzedjz4o17tCJaMcw';

const TL_URL = '/sheets?output=csv&gid=639842286';
const ML_URL = '/sheets?output=csv&gid=1886208268';
const PLN_URL = '/sheets?output=csv&gid=1817920579';

// ── CSV PARSER ────────────────────────────────────────────────────────────────
function parseCSV(text) {
  const lines = text.trim().split('\n');
  return lines.map((l) => {
    const cols = [];
    let cur = '';
    let inQ = false;
    for (let i = 0; i < l.length; i++) {
      if (l[i] === '"') {
        inQ = !inQ;
      } else if (l[i] === ',' && !inQ) {
        cols.push(cur.trim());
        cur = '';
      } else cur += l[i];
    }
    cols.push(cur.trim());
    return cols;
  });
}

function parseTL(rows) {
  let headerIdx = rows.findIndex((r) =>
    r.some(
      (c) =>
        c.toLowerCase().includes('file number') ||
        c.toLowerCase().includes('s.no')
    )
  );
  if (headerIdx === -1) headerIdx = 2;
  const data = [];
  let portal = 'SUGAM';
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r || r.every((c) => !c)) continue;
    if (r[0]?.toString().toUpperCase().includes('NSWS')) {
      portal = 'NSWS';
      continue;
    }
    if (r[0]?.toString().toUpperCase().includes('SUGAM')) {
      portal = 'SUGAM';
      continue;
    }
    const name = r[2];
    if (!name?.trim()) continue;
    data.push({
      id: `TL-${i}`,
      portal,
      sno: r[0]?.trim(),
      fileNo: r[1]?.trim(),
      name: name.trim(),
      risk: r[3]?.trim(),
      brand: r[4]?.trim() || '—',
      tech: r[5]?.trim() || '—',
      licNo: r[6]?.trim() || '—',
      issued: r[7]?.trim(),
      expiry: r[8]?.trim(),
      pdfUrl: r[11]?.trim() || '',
    });
  }
  return data;
}

function parseML(rows) {
  let headerIdx = rows.findIndex((r) =>
    r.some(
      (c) =>
        c.toLowerCase().includes('file number') ||
        c.toLowerCase().includes('application')
    )
  );
  if (headerIdx === -1) headerIdx = 1;
  const data = [];
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r || r.every((c) => !c)) continue;
    const name = r[2];
    if (!name?.trim()) continue;
    data.push({
      id: `ML-${i}`,
      sno: r[0]?.trim(),
      fileNo: r[1]?.trim(),
      name: name.trim(),
      brand: r[3]?.trim() || '—',
      code: r[4]?.trim(),
      tech: r[5]?.trim() || '—',
      licNo: r[6]?.trim() || '—',
      approved: r[7]?.trim(),
      expiry: r[8]?.trim(),
      kitMonths: r[9]?.trim(),
      pdfUrl: r[10]?.trim() || '',
    });
  }
  return data;
}

function parsePlan(rows) {
  let headerIdx = rows.findIndex((r) =>
    r.some((c) => c.toLowerCase().includes('product'))
  );
  if (headerIdx === -1) headerIdx = 0;
  const data = [];
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r || r.every((c) => !c)) continue;
    const name = r[1];
    if (!name?.trim()) continue;
    data.push({
      id: `PLN-${i}`,
      sno: r[0]?.trim(),
      name: name.trim(),
      type: r[2]?.trim(),
      body: r[3]?.trim(),
      targetDate: r[4]?.trim(),
      status: r[5]?.trim() || 'Planned',
    });
  }
  return data;
}

// ── HELPERS ───────────────────────────────────────────────────────────────────
function parseDate(s) {
  if (!s) return null;
  s = s.trim();
  const monYY = s.match(/^([A-Za-z]+)[- ](\d{2,4})$/);
  if (monYY) {
    const months = {
      jan: 0,
      feb: 1,
      mar: 2,
      apr: 3,
      may: 4,
      jun: 5,
      jul: 6,
      aug: 7,
      sep: 8,
      oct: 9,
      nov: 10,
      dec: 11,
    };
    const mon = months[monYY[1].toLowerCase().slice(0, 3)];
    let yr = parseInt(monYY[2]);
    if (yr < 100) yr += 2000;
    if (mon !== undefined) return new Date(yr, mon, 1);
  }
  const dmy = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (dmy)
    return new Date(parseInt(dmy[3]), parseInt(dmy[2]) - 1, parseInt(dmy[1]));
  const d = new Date(s);
  return isNaN(d) ? null : d;
}
const daysUntil = (d) => (d ? Math.ceil((d - TODAY) / 86400000) : null);
const isApplied2026 = (s) => s && s.includes('/2026/');

function getExpiryStatus(expiry) {
  const d = parseDate(expiry);
  if (!d) return 'unknown';
  const days = daysUntil(d);
  if (days < 0) return 'expired';
  if (days <= 90) return 'critical';
  if (days <= 180) return 'warning';
  return 'active';
}

const STATUS_META = {
  expired: {
    label: 'Expired',
    color: '#ef4444',
    bg: '#fef2f2',
    dot: '#ef4444',
  },
  critical: {
    label: 'Critical',
    color: '#f97316',
    bg: '#fff7ed',
    dot: '#f97316',
  },
  warning: {
    label: 'Expiring Soon',
    color: '#eab308',
    bg: '#fefce8',
    dot: '#eab308',
  },
  active: { label: 'Active', color: '#22c55e', bg: '#f0fdf4', dot: '#22c55e' },
  unknown: {
    label: 'Unknown',
    color: '#94a3b8',
    bg: '#f8fafc',
    dot: '#94a3b8',
  },
};

const PLAN_STATUS_META = {
  Applied: { color: '#22c55e', bg: '#f0fdf4', border: '#86efac' },
  Planned: { color: '#3b82f6', bg: '#eff6ff', border: '#93c5fd' },
  Submitted: { color: '#8b5cf6', bg: '#f5f3ff', border: '#c4b5fd' },
  Approved: { color: '#16a34a', bg: '#dcfce7', border: '#4ade80' },
  Delayed: { color: '#f97316', bg: '#fff7ed', border: '#fdba74' },
};

const RISK_COLOR = { A: '#6366f1', B: '#3b82f6', C: '#f97316' };

// ── COMPONENTS ────────────────────────────────────────────────────────────────
function Badge({ status }) {
  const m = STATUS_META[status] || STATUS_META.unknown;
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        padding: '2px 10px',
        borderRadius: 20,
        fontSize: 11,
        fontWeight: 600,
        color: m.color,
        background: m.bg,
        border: `1px solid ${m.color}33`,
      }}
    >
      <span
        style={{ width: 7, height: 7, borderRadius: '50%', background: m.dot }}
      />
      {m.label}
    </span>
  );
}

function PlanBadge({ status }) {
  const m = PLAN_STATUS_META[status] || PLAN_STATUS_META['Planned'];
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        padding: '3px 12px',
        borderRadius: 20,
        fontSize: 12,
        fontWeight: 700,
        color: m.color,
        background: m.bg,
        border: `1px solid ${m.border}`,
      }}
    >
      {status === 'Applied' || status === 'Approved'
        ? '✅'
        : status === 'Delayed'
        ? '⚠️'
        : '🔵'}{' '}
      {status}
    </span>
  );
}

function RiskBadge({ risk }) {
  if (!risk || risk === '—')
    return <span style={{ color: '#94a3b8', fontSize: 12 }}>—</span>;
  return (
    <span
      style={{
        display: 'inline-block',
        padding: '2px 8px',
        borderRadius: 4,
        fontSize: 11,
        fontWeight: 700,
        color: '#fff',
        background: RISK_COLOR[risk] || '#94a3b8',
      }}
    >
      {risk}
    </span>
  );
}

function ExpiryBar({ expiry }) {
  const d = parseDate(expiry);
  if (!d) return <span style={{ color: '#94a3b8', fontSize: 12 }}>—</span>;
  const days = daysUntil(d);
  if (days < 0)
    return (
      <span style={{ color: '#ef4444', fontSize: 12, fontWeight: 600 }}>
        Expired {Math.abs(days)}d ago
      </span>
    );
  const status = getExpiryStatus(expiry);
  const color = STATUS_META[status]?.dot || '#94a3b8';
  const width = Math.min(100, Math.max(2, (days / 1825) * 100));
  return (
    <div>
      <div style={{ fontSize: 11, color: '#64748b', marginBottom: 3 }}>
        {days < 365 ? `${days} days` : `${(days / 365).toFixed(1)} yrs`} ·{' '}
        {d.toLocaleDateString('en-IN', {
          day: '2-digit',
          month: 'short',
          year: 'numeric',
        })}
      </div>
      <div
        style={{
          height: 5,
          background: '#f1f5f9',
          borderRadius: 3,
          width: 110,
        }}
      >
        <div
          style={{
            height: '100%',
            width: `${width}%`,
            background: color,
            borderRadius: 3,
          }}
        />
      </div>
    </div>
  );
}

function PdfBtn({
  url,
  color = '#2563eb',
  bg = '#eff6ff',
  border = '#bfdbfe',
}) {
  if (!url) return <span style={{ color: '#cbd5e1', fontSize: 11 }}>—</span>;
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 3,
        padding: '2px 8px',
        borderRadius: 5,
        background: bg,
        color,
        border: `1px solid ${border}`,
        fontSize: 10,
        fontWeight: 600,
        textDecoration: 'none',
      }}
    >
      📄 View PDF
    </a>
  );
}

function Spinner() {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 60,
        gap: 16,
      }}
    >
      <div
        style={{
          width: 40,
          height: 40,
          border: '4px solid #e2e8f0',
          borderTop: '4px solid #2563eb',
          borderRadius: '50%',
          animation: 'spin 0.8s linear infinite',
        }}
      />
      <div style={{ color: '#64748b', fontSize: 14 }}>
        Fetching live data from Google Sheets…
      </div>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}

function SectionCard({ children, style }) {
  return (
    <div
      style={{
        background: '#fff',
        borderRadius: 12,
        boxShadow: '0 1px 4px rgba(0,0,0,.07)',
        padding: 20,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

function SectionTitle({ icon, title, count, color = '#0f172a' }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        marginBottom: 16,
      }}
    >
      <div
        style={{ width: 4, height: 22, background: color, borderRadius: 2 }}
      />
      <span style={{ fontSize: 15, fontWeight: 700, color: '#0f172a' }}>
        {icon} {title}
      </span>
      {count !== undefined && (
        <span
          style={{
            marginLeft: 4,
            background: '#f1f5f9',
            color: '#475569',
            borderRadius: 20,
            padding: '1px 10px',
            fontSize: 12,
            fontWeight: 600,
          }}
        >
          {count}
        </span>
      )}
    </div>
  );
}

const filterBtn = (active) => ({
  padding: '5px 14px',
  borderRadius: 20,
  fontSize: 12,
  fontWeight: 600,
  cursor: 'pointer',
  border: '1px solid',
  transition: 'all .15s',
  background: active ? '#2563eb' : '#fff',
  color: active ? '#fff' : '#64748b',
  borderColor: active ? '#2563eb' : '#e2e8f0',
});

// ── MAIN ─────────────────────────────────────────────────────────────────────
export default function RegulatoryDashboard() {
  const [tlRaw, setTlRaw] = useState([]);
  const [mlRaw, setMlRaw] = useState([]);
  const [planRaw, setPlanRaw] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [tab, setTab] = useState('overview');
  const [tlFilter, setTlFilter] = useState('active');
  const [mlFilter, setMlFilter] = useState('active');
  const [search, setSearch] = useState('');

  const fetchWithTimeout = async (url, ms = 10000) => {
    const ctrl = new AbortController();
    const id = setTimeout(() => ctrl.abort(), ms);
    try {
      const r = await fetch(url, { signal: ctrl.signal });
      clearTimeout(id);
      return r;
    } catch (e) {
      clearTimeout(id);
      throw e;
    }
  };

  const fetchSheet = async (gid) => {
    const url = `https://docs.google.com/spreadsheets/d/e/2PACX-1vQ3kQLUJGUpIEU45v5omXE41qAbRZEUA7v0Y7754cpjIh2-tUzedjz4o17tCJaMcw/pub?output=csv&gid=${gid}`;
    const r = await fetchWithTimeout(url, 8000);
    if (r.ok) return r.text();
    throw new Error('Failed to fetch sheet');
  };

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [t1, t2, t3] = await Promise.all([
        fetchSheet('639842286'),
        fetchSheet('1886208268'),
        fetchSheet('1817920579'),
      ]);
      setTlRaw(parseTL(parseCSV(t1)));
      setMlRaw(parseML(parseCSV(t2)));
      setPlanRaw(parsePlan(parseCSV(t3)));
      setLastUpdated(new Date());
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    fetchData();
  }, []);

  // Enrich
  const tlData = useMemo(
    () =>
      tlRaw.map((r) => ({
        ...r,
        expiryStatus: getExpiryStatus(r.expiry),
        applied2026: isApplied2026(r.fileNo),
      })),
    [tlRaw]
  );
  const mlData = useMemo(
    () =>
      mlRaw.map((r) => ({
        ...r,
        expiryStatus: getExpiryStatus(r.expiry),
        applied2026: isApplied2026(r.fileNo),
      })),
    [mlRaw]
  );
  const planData = useMemo(() => planRaw, [planRaw]);

  // Stats
  const stats = useMemo(() => {
    const tlActive = tlData.filter((r) => r.expiryStatus === 'active');
    const mlActive = mlData.filter((r) => r.expiryStatus === 'active');
    const tlExpiring = tlData.filter((r) =>
      ['critical', 'warning'].includes(r.expiryStatus)
    );
    const mlExpiring = mlData.filter((r) =>
      ['critical', 'warning'].includes(r.expiryStatus)
    );
    const tlExpired = tlData.filter((r) => r.expiryStatus === 'expired');
    const mlExpired = mlData.filter((r) => r.expiryStatus === 'expired');
    const planTotal = planData.length;
    const planSubmitted = planData.filter((r) =>
      ['Applied', 'Submitted', 'Approved'].includes(r.status)
    ).length;
    const planPending = planData.filter((r) =>
      ['Planned', 'Delayed'].includes(r.status)
    ).length;
    return {
      tlActive,
      mlActive,
      tlExpiring,
      mlExpiring,
      tlExpired,
      mlExpired,
      planTotal,
      planSubmitted,
      planPending,
    };
  }, [tlData, mlData, planData]);

  // Filtered tables
  const filteredTL = useMemo(() => {
    let d = tlData;
    if (tlFilter === 'active') d = d.filter((r) => r.expiryStatus === 'active');
    else if (tlFilter === 'expiring')
      d = d.filter((r) => ['critical', 'warning'].includes(r.expiryStatus));
    else if (tlFilter === 'expired')
      d = d.filter((r) => r.expiryStatus === 'expired');
    else if (tlFilter === '2026') d = d.filter((r) => r.applied2026);
    if (search)
      d = d.filter(
        (r) =>
          r.name?.toLowerCase().includes(search.toLowerCase()) ||
          r.licNo?.toLowerCase().includes(search.toLowerCase())
      );
    return d;
  }, [tlData, tlFilter, search]);

  const filteredML = useMemo(() => {
    let d = mlData;
    if (mlFilter === 'active') d = d.filter((r) => r.expiryStatus === 'active');
    else if (mlFilter === 'expiring')
      d = d.filter((r) => ['critical', 'warning'].includes(r.expiryStatus));
    else if (mlFilter === 'expired')
      d = d.filter((r) => r.expiryStatus === 'expired');
    else if (mlFilter === '2026') d = d.filter((r) => r.applied2026);
    if (search)
      d = d.filter(
        (r) =>
          r.name?.toLowerCase().includes(search.toLowerCase()) ||
          r.licNo?.toLowerCase().includes(search.toLowerCase())
      );
    return d;
  }, [mlData, mlFilter, search]);

  const TABS = [
    { id: 'overview', label: '📊 Overview' },
    { id: 'pipeline', label: `🗓 Pipeline (${stats.planTotal})` },
    { id: 'tl', label: `📋 Test Licences (${tlData.length})` },
    { id: 'ml', label: `🏭 Mfg Licences (${mlData.length})` },
    {
      id: 'alerts',
      label: `🚨 Alerts (${
        stats.tlExpiring.length +
        stats.mlExpiring.length +
        stats.tlExpired.length +
        stats.mlExpired.length
      })`,
    },
  ];

  const tabStyle = (id) => ({
    padding: '9px 18px',
    borderRadius: '8px 8px 0 0',
    fontWeight: 600,
    fontSize: 13,
    cursor: 'pointer',
    border: 'none',
    background: tab === id ? '#fff' : 'transparent',
    color: tab === id ? '#1e40af' : '#64748b',
    borderBottom: tab === id ? '2px solid #2563eb' : '2px solid transparent',
  });

  // Progress bar
  const pct = stats.planTotal
    ? Math.round((stats.planSubmitted / stats.planTotal) * 100)
    : 0;

  return (
    <div
      style={{
        fontFamily: "'Inter',system-ui,sans-serif",
        background: '#f8fafc',
        minHeight: '100vh',
        padding: '20px 24px',
      }}
    >
      {/* HEADER */}
      <div
        style={{
          marginBottom: 20,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          flexWrap: 'wrap',
          gap: 12,
        }}
      >
        <div>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              marginBottom: 4,
            }}
          >
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: 8,
                background: 'linear-gradient(135deg,#2563eb,#7c3aed)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#fff',
                fontSize: 18,
              }}
            >
              ⚖️
            </div>
            <h1
              style={{
                margin: 0,
                fontSize: 22,
                fontWeight: 800,
                color: '#0f172a',
              }}
            >
              Regulatory Approval Dashboard
            </h1>
          </div>
          <p style={{ margin: 0, color: '#64748b', fontSize: 13 }}>
            CDSCO · SUGAM &amp; NSWS · IVD/MD Licences · Live from Google Sheets
          </p>
        </div>
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'flex-end',
            gap: 4,
          }}
        >
          <button
            onClick={fetchData}
            disabled={loading}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '8px 16px',
              borderRadius: 8,
              background: '#2563eb',
              color: '#fff',
              border: 'none',
              fontWeight: 600,
              fontSize: 13,
              cursor: loading ? 'not-allowed' : 'pointer',
              opacity: loading ? 0.7 : 1,
            }}
          >
            <span
              style={{
                display: 'inline-block',
                animation: loading ? 'spin 0.8s linear infinite' : 'none',
              }}
            >
              🔄
            </span>
            {loading ? 'Refreshing…' : 'Refresh'}
          </button>
          {lastUpdated && (
            <span style={{ fontSize: 11, color: '#94a3b8' }}>
              Updated: {lastUpdated.toLocaleTimeString('en-IN')}
            </span>
          )}
          <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
        </div>
      </div>

      {error && (
        <div
          style={{
            background: '#fef2f2',
            border: '1px solid #fecaca',
            borderRadius: 10,
            padding: '12px 18px',
            marginBottom: 16,
            color: '#dc2626',
            fontSize: 13,
          }}
        >
          ⚠️ {error}
          <button
            onClick={fetchData}
            style={{
              marginLeft: 12,
              padding: '3px 10px',
              borderRadius: 6,
              background: '#dc2626',
              color: '#fff',
              border: 'none',
              cursor: 'pointer',
              fontSize: 12,
            }}
          >
            Retry
          </button>
        </div>
      )}

      {loading ? (
        <Spinner />
      ) : (
        <>
          {/* TOP STAT CARDS */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill,minmax(160px,1fr))',
              gap: 12,
              marginBottom: 20,
            }}
          >
            {[
              {
                icon: '🗓',
                label: 'H1 2026 Planned',
                value: stats.planTotal,
                sub: 'Total submissions',
                color: '#2563eb',
              },
              {
                icon: '✅',
                label: 'Submitted',
                value: stats.planSubmitted,
                sub: `${pct}% of plan`,
                color: '#22c55e',
              },
              {
                icon: '⏳',
                label: 'In Pipeline',
                value: stats.planPending,
                sub: 'Yet to submit',
                color: '#f97316',
              },
              {
                icon: '📋',
                label: 'Active TL',
                value: stats.tlActive.length,
                sub: 'Test licences valid',
                color: '#6366f1',
              },
              {
                icon: '🏭',
                label: 'Active ML',
                value: stats.mlActive.length,
                sub: 'Mfg licences valid',
                color: '#7c3aed',
              },
              {
                icon: '⚠️',
                label: 'Expiring Soon',
                value: stats.tlExpiring.length + stats.mlExpiring.length,
                sub: 'Within 6 months',
                color: '#eab308',
              },
            ].map((c) => (
              <div
                key={c.label}
                style={{
                  background: '#fff',
                  borderRadius: 12,
                  padding: '16px 18px',
                  boxShadow: '0 1px 4px rgba(0,0,0,.07)',
                  borderLeft: `4px solid ${c.color}`,
                }}
              >
                <div style={{ fontSize: 22 }}>{c.icon}</div>
                <div
                  style={{
                    fontSize: 26,
                    fontWeight: 800,
                    color: '#0f172a',
                    lineHeight: 1.2,
                  }}
                >
                  {c.value}
                </div>
                <div
                  style={{ fontSize: 12, fontWeight: 600, color: '#64748b' }}
                >
                  {c.label}
                </div>
                <div style={{ fontSize: 11, color: '#94a3b8' }}>{c.sub}</div>
              </div>
            ))}
          </div>

          {/* TABS */}
          <div
            style={{
              background: '#f1f5f9',
              borderRadius: '10px 10px 0 0',
              padding: '0 4px',
              display: 'flex',
              gap: 4,
              flexWrap: 'wrap',
              borderBottom: '1px solid #e2e8f0',
            }}
          >
            {TABS.map((t) => (
              <button
                key={t.id}
                style={tabStyle(t.id)}
                onClick={() => {
                  setTab(t.id);
                  setSearch('');
                }}
              >
                {t.label}
              </button>
            ))}
          </div>

          <div
            style={{
              background: '#fff',
              borderRadius: '0 0 12px 12px',
              boxShadow: '0 2px 8px rgba(0,0,0,.06)',
              padding: 24,
            }}
          >
            {/* ── OVERVIEW ── */}
            {tab === 'overview' && (
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: 20,
                }}
              >
                {/* Pipeline summary */}
                <SectionCard style={{ gridColumn: '1/-1' }}>
                  <SectionTitle
                    icon="🗓"
                    title="H1 2026 Submission Plan Progress"
                    color="#2563eb"
                  />
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 12,
                      marginBottom: 16,
                    }}
                  >
                    <div
                      style={{
                        flex: 1,
                        height: 12,
                        background: '#f1f5f9',
                        borderRadius: 6,
                        overflow: 'hidden',
                      }}
                    >
                      <div
                        style={{
                          height: '100%',
                          width: `${pct}%`,
                          background: 'linear-gradient(90deg,#2563eb,#22c55e)',
                          borderRadius: 6,
                          transition: 'width .5s',
                        }}
                      />
                    </div>
                    <span
                      style={{
                        fontSize: 16,
                        fontWeight: 800,
                        color: '#2563eb',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {stats.planSubmitted}/{stats.planTotal} ({pct}%)
                    </span>
                  </div>
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns:
                        'repeat(auto-fill,minmax(200px,1fr))',
                      gap: 10,
                    }}
                  >
                    {planData.map((r) => {
                      const m =
                        PLAN_STATUS_META[r.status] ||
                        PLAN_STATUS_META['Planned'];
                      return (
                        <div
                          key={r.id}
                          style={{
                            background: m.bg,
                            border: `1px solid ${m.border}`,
                            borderRadius: 10,
                            padding: '12px 14px',
                          }}
                        >
                          <div
                            style={{
                              fontWeight: 700,
                              fontSize: 12,
                              color: '#0f172a',
                              marginBottom: 4,
                            }}
                          >
                            {r.name}
                          </div>
                          <div
                            style={{
                              display: 'flex',
                              gap: 6,
                              flexWrap: 'wrap',
                              alignItems: 'center',
                              marginBottom: 4,
                            }}
                          >
                            <span
                              style={{
                                background: '#f1f5f9',
                                color: '#475569',
                                padding: '1px 7px',
                                borderRadius: 4,
                                fontSize: 10,
                                fontWeight: 600,
                              }}
                            >
                              {r.type}
                            </span>
                            <span
                              style={{
                                background: '#f1f5f9',
                                color: '#475569',
                                padding: '1px 7px',
                                borderRadius: 4,
                                fontSize: 10,
                              }}
                            >
                              {r.body}
                            </span>
                          </div>
                          <div
                            style={{
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'center',
                            }}
                          >
                            <span style={{ fontSize: 11, color: '#64748b' }}>
                              🎯 {r.targetDate}
                            </span>
                            <PlanBadge status={r.status} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </SectionCard>

                {/* Active TL */}
                <SectionCard>
                  <SectionTitle
                    icon="📋"
                    title="Active Test Licences"
                    count={stats.tlActive.length}
                    color="#6366f1"
                  />
                  <div style={{ maxHeight: 320, overflowY: 'auto' }}>
                    {stats.tlActive.map((r) => (
                      <div
                        key={r.id}
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'flex-start',
                          padding: '8px 0',
                          borderBottom: '1px solid #f8fafc',
                          gap: 8,
                        }}
                      >
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div
                            style={{
                              fontSize: 12,
                              fontWeight: 600,
                              color: '#0f172a',
                              marginBottom: 2,
                            }}
                          >
                            {r.name}
                          </div>
                          <div
                            style={{
                              fontSize: 10,
                              color: '#94a3b8',
                              fontFamily: 'monospace',
                            }}
                          >
                            {r.licNo}
                          </div>
                          {r.pdfUrl && (
                            <div style={{ marginTop: 3 }}>
                              <PdfBtn url={r.pdfUrl} />
                            </div>
                          )}
                        </div>
                        <div style={{ textAlign: 'right', flexShrink: 0 }}>
                          <ExpiryBar expiry={r.expiry} />
                        </div>
                      </div>
                    ))}
                  </div>
                </SectionCard>

                {/* Active ML */}
                <SectionCard>
                  <SectionTitle
                    icon="🏭"
                    title="Active Mfg Licences"
                    count={stats.mlActive.length}
                    color="#7c3aed"
                  />
                  <div style={{ maxHeight: 320, overflowY: 'auto' }}>
                    {stats.mlActive.map((r) => (
                      <div
                        key={r.id}
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'flex-start',
                          padding: '8px 0',
                          borderBottom: '1px solid #f8fafc',
                          gap: 8,
                        }}
                      >
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div
                            style={{
                              fontSize: 12,
                              fontWeight: 600,
                              color: '#0f172a',
                              marginBottom: 2,
                            }}
                          >
                            {r.name}
                          </div>
                          <div
                            style={{
                              fontSize: 10,
                              color: '#94a3b8',
                              fontFamily: 'monospace',
                            }}
                          >
                            {r.licNo}
                          </div>
                          {r.pdfUrl && (
                            <div style={{ marginTop: 3 }}>
                              <PdfBtn
                                url={r.pdfUrl}
                                color="#7c3aed"
                                bg="#faf5ff"
                                border="#e9d5ff"
                              />
                            </div>
                          )}
                        </div>
                        <div style={{ textAlign: 'right', flexShrink: 0 }}>
                          <ExpiryBar expiry={r.expiry} />
                        </div>
                      </div>
                    ))}
                  </div>
                </SectionCard>

                {/* Expiring soon */}
                <SectionCard style={{ gridColumn: '1/-1' }}>
                  <SectionTitle
                    icon="⚠️"
                    title="Licences Expiring Soon (next 6 months)"
                    count={stats.tlExpiring.length + stats.mlExpiring.length}
                    color="#f97316"
                  />
                  {stats.tlExpiring.length + stats.mlExpiring.length === 0 ? (
                    <div
                      style={{
                        color: '#22c55e',
                        fontWeight: 600,
                        fontSize: 13,
                      }}
                    >
                      ✅ No licences expiring in the next 6 months.
                    </div>
                  ) : (
                    <div style={{ overflowX: 'auto' }}>
                      <table
                        style={{
                          width: '100%',
                          borderCollapse: 'collapse',
                          fontSize: 12,
                        }}
                      >
                        <thead>
                          <tr style={{ background: '#fef3c7' }}>
                            {[
                              'Type',
                              'Licence No.',
                              'Product',
                              'Expiry',
                              'Status',
                              'PDF',
                            ].map((h) => (
                              <th
                                key={h}
                                style={{
                                  padding: '8px 12px',
                                  textAlign: 'left',
                                  fontWeight: 700,
                                  color: '#92400e',
                                  borderBottom: '2px solid #fcd34d',
                                  whiteSpace: 'nowrap',
                                }}
                              >
                                {h}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {[
                            ...stats.tlExpiring.map((r) => ({
                              ...r,
                              ltype: 'TL',
                            })),
                            ...stats.mlExpiring.map((r) => ({
                              ...r,
                              ltype: 'ML',
                            })),
                          ].map((r) => (
                            <tr
                              key={r.id}
                              style={{ borderBottom: '1px solid #fef9c3' }}
                            >
                              <td style={{ padding: '8px 12px' }}>
                                <span
                                  style={{
                                    background:
                                      r.ltype === 'TL' ? '#eff6ff' : '#faf5ff',
                                    color:
                                      r.ltype === 'TL' ? '#1d4ed8' : '#6d28d9',
                                    padding: '2px 7px',
                                    borderRadius: 4,
                                    fontWeight: 700,
                                    fontSize: 11,
                                  }}
                                >
                                  {r.ltype}
                                </span>
                              </td>
                              <td
                                style={{
                                  padding: '8px 12px',
                                  fontFamily: 'monospace',
                                  fontSize: 10,
                                  color: '#475569',
                                }}
                              >
                                {r.licNo}
                              </td>
                              <td
                                style={{
                                  padding: '8px 12px',
                                  fontWeight: 600,
                                  color: '#0f172a',
                                }}
                              >
                                {r.name}
                              </td>
                              <td style={{ padding: '8px 12px' }}>
                                <ExpiryBar expiry={r.expiry} />
                              </td>
                              <td style={{ padding: '8px 12px' }}>
                                <Badge status={r.expiryStatus} />
                              </td>
                              <td style={{ padding: '8px 12px' }}>
                                {r.ltype === 'TL' ? (
                                  <PdfBtn url={r.pdfUrl} />
                                ) : (
                                  <PdfBtn
                                    url={r.pdfUrl}
                                    color="#7c3aed"
                                    bg="#faf5ff"
                                    border="#e9d5ff"
                                  />
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </SectionCard>

                {/* 2026 Applied Licences */}
                <SectionCard style={{ gridColumn: '1/-1' }}>
                  <SectionTitle
                    icon="🆕"
                    title="Licences Applied in 2026"
                    count={
                      tlData.filter((r) => r.applied2026).length +
                      mlData.filter((r) => r.applied2026).length
                    }
                    color="#0891b2"
                  />
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '1fr 1fr',
                      gap: 16,
                    }}
                  >
                    {/* TL 2026 */}
                    <div>
                      <div
                        style={{
                          fontWeight: 700,
                          color: '#1e40af',
                          fontSize: 12,
                          marginBottom: 10,
                          display: 'flex',
                          alignItems: 'center',
                          gap: 6,
                        }}
                      >
                        <span
                          style={{
                            background: '#eff6ff',
                            padding: '2px 8px',
                            borderRadius: 4,
                          }}
                        >
                          📋 Test Licences
                        </span>
                        <span style={{ color: '#94a3b8' }}>
                          {tlData.filter((r) => r.applied2026).length} applied
                        </span>
                      </div>
                      {tlData
                        .filter((r) => r.applied2026)
                        .map((r) => (
                          <div
                            key={r.id}
                            style={{
                              background: '#f8fafc',
                              borderRadius: 8,
                              padding: '9px 12px',
                              marginBottom: 7,
                              border: '1px solid #e2e8f0',
                            }}
                          >
                            <div
                              style={{
                                fontWeight: 600,
                                fontSize: 12,
                                color: '#0f172a',
                                marginBottom: 3,
                              }}
                            >
                              {r.name}
                            </div>
                            <div
                              style={{
                                fontSize: 10,
                                color: '#94a3b8',
                                fontFamily: 'monospace',
                                marginBottom: 5,
                              }}
                            >
                              {r.licNo}
                            </div>
                            <div
                              style={{
                                display: 'flex',
                                gap: 6,
                                alignItems: 'center',
                                justifyContent: 'space-between',
                              }}
                            >
                              <div
                                style={{
                                  display: 'flex',
                                  gap: 5,
                                  alignItems: 'center',
                                }}
                              >
                                <Badge status={r.expiryStatus} />
                                <RiskBadge risk={r.risk} />
                              </div>
                              <PdfBtn url={r.pdfUrl} />
                            </div>
                          </div>
                        ))}
                      {tlData.filter((r) => r.applied2026).length === 0 && (
                        <div style={{ color: '#94a3b8', fontSize: 12 }}>
                          None yet.
                        </div>
                      )}
                    </div>
                    {/* ML 2026 */}
                    <div>
                      <div
                        style={{
                          fontWeight: 700,
                          color: '#6d28d9',
                          fontSize: 12,
                          marginBottom: 10,
                          display: 'flex',
                          alignItems: 'center',
                          gap: 6,
                        }}
                      >
                        <span
                          style={{
                            background: '#faf5ff',
                            padding: '2px 8px',
                            borderRadius: 4,
                          }}
                        >
                          🏭 Mfg Licences
                        </span>
                        <span style={{ color: '#94a3b8' }}>
                          {mlData.filter((r) => r.applied2026).length} applied
                        </span>
                      </div>
                      {mlData
                        .filter((r) => r.applied2026)
                        .map((r) => (
                          <div
                            key={r.id}
                            style={{
                              background: '#f8fafc',
                              borderRadius: 8,
                              padding: '9px 12px',
                              marginBottom: 7,
                              border: '1px solid #e2e8f0',
                            }}
                          >
                            <div
                              style={{
                                fontWeight: 600,
                                fontSize: 12,
                                color: '#0f172a',
                                marginBottom: 3,
                              }}
                            >
                              {r.name}
                            </div>
                            <div
                              style={{
                                fontSize: 10,
                                color: '#94a3b8',
                                fontFamily: 'monospace',
                                marginBottom: 5,
                              }}
                            >
                              {r.licNo}
                            </div>
                            <div
                              style={{
                                display: 'flex',
                                gap: 6,
                                alignItems: 'center',
                                justifyContent: 'space-between',
                              }}
                            >
                              <Badge status={r.expiryStatus} />
                              <PdfBtn
                                url={r.pdfUrl}
                                color="#7c3aed"
                                bg="#faf5ff"
                                border="#e9d5ff"
                              />
                            </div>
                          </div>
                        ))}
                      {mlData.filter((r) => r.applied2026).length === 0 && (
                        <div style={{ color: '#94a3b8', fontSize: 12 }}>
                          None yet.
                        </div>
                      )}
                    </div>
                  </div>
                </SectionCard>
              </div>
            )}

            {/* ── PIPELINE ── */}
            {tab === 'pipeline' && (
              <div>
                <div
                  style={{
                    display: 'flex',
                    gap: 16,
                    marginBottom: 24,
                    flexWrap: 'wrap',
                  }}
                >
                  {[
                    {
                      label: 'Total Planned',
                      value: stats.planTotal,
                      color: '#2563eb',
                      bg: '#eff6ff',
                    },
                    {
                      label: 'Submitted / Applied',
                      value: stats.planSubmitted,
                      color: '#22c55e',
                      bg: '#f0fdf4',
                    },
                    {
                      label: 'Still in Pipeline',
                      value: stats.planPending,
                      color: '#f97316',
                      bg: '#fff7ed',
                    },
                    {
                      label: 'Completion',
                      value: `${pct}%`,
                      color: '#7c3aed',
                      bg: '#faf5ff',
                    },
                  ].map((c) => (
                    <div
                      key={c.label}
                      style={{
                        flex: 1,
                        minWidth: 130,
                        background: c.bg,
                        borderRadius: 10,
                        padding: '14px 18px',
                        border: `1px solid ${c.color}22`,
                      }}
                    >
                      <div
                        style={{
                          fontSize: 26,
                          fontWeight: 800,
                          color: c.color,
                        }}
                      >
                        {c.value}
                      </div>
                      <div
                        style={{
                          fontSize: 12,
                          color: '#64748b',
                          fontWeight: 600,
                        }}
                      >
                        {c.label}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Progress bar */}
                <div style={{ marginBottom: 24 }}>
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      fontSize: 12,
                      color: '#64748b',
                      marginBottom: 6,
                    }}
                  >
                    <span>H1 2026 Progress</span>
                    <span>{pct}% complete</span>
                  </div>
                  <div
                    style={{
                      height: 14,
                      background: '#f1f5f9',
                      borderRadius: 8,
                      overflow: 'hidden',
                    }}
                  >
                    <div
                      style={{
                        height: '100%',
                        width: `${pct}%`,
                        background: 'linear-gradient(90deg,#2563eb,#22c55e)',
                        borderRadius: 8,
                        transition: 'width .5s',
                      }}
                    />
                  </div>
                </div>

                {/* Plan table */}
                <table
                  style={{
                    width: '100%',
                    borderCollapse: 'collapse',
                    fontSize: 13,
                  }}
                >
                  <thead>
                    <tr style={{ background: '#f8fafc' }}>
                      {[
                        '#',
                        'Product',
                        'Type',
                        'Regulatory Body',
                        'Target Date',
                        'Status',
                      ].map((h) => (
                        <th
                          key={h}
                          style={{
                            padding: '10px 14px',
                            textAlign: 'left',
                            fontWeight: 700,
                            color: '#475569',
                            borderBottom: '2px solid #e2e8f0',
                          }}
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {planData.map((r, i) => {
                      const m =
                        PLAN_STATUS_META[r.status] ||
                        PLAN_STATUS_META['Planned'];
                      return (
                        <tr
                          key={r.id}
                          style={{
                            borderBottom: '1px solid #f1f5f9',
                            background: ['Applied', 'Approved'].includes(
                              r.status
                            )
                              ? '#f0fdf4'
                              : 'transparent',
                          }}
                        >
                          <td
                            style={{
                              padding: '12px 14px',
                              color: '#94a3b8',
                              fontWeight: 600,
                            }}
                          >
                            {i + 1}
                          </td>
                          <td
                            style={{
                              padding: '12px 14px',
                              fontWeight: 700,
                              color: '#0f172a',
                            }}
                          >
                            {r.name}
                          </td>
                          <td style={{ padding: '12px 14px' }}>
                            <span
                              style={{
                                background: r.type?.includes('ML')
                                  ? '#faf5ff'
                                  : '#eff6ff',
                                color: r.type?.includes('ML')
                                  ? '#6d28d9'
                                  : '#1d4ed8',
                                padding: '3px 10px',
                                borderRadius: 6,
                                fontWeight: 700,
                                fontSize: 12,
                              }}
                            >
                              {r.type}
                            </span>
                          </td>
                          <td
                            style={{ padding: '12px 14px', color: '#475569' }}
                          >
                            {r.body}
                          </td>
                          <td
                            style={{
                              padding: '12px 14px',
                              color: '#475569',
                              fontWeight: 600,
                            }}
                          >
                            🎯 {r.targetDate}
                          </td>
                          <td style={{ padding: '12px 14px' }}>
                            <PlanBadge status={r.status} />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>

                <div
                  style={{
                    marginTop: 20,
                    padding: '12px 16px',
                    background: '#fffbeb',
                    borderRadius: 8,
                    border: '1px solid #fde68a',
                    fontSize: 12,
                    color: '#92400e',
                  }}
                >
                  💡 <strong>Tip:</strong> Update the <strong>Status</strong>{' '}
                  column in your Google Sheet to "Applied", "Submitted", or
                  "Approved" as you progress — the dashboard updates
                  automatically.
                </div>
              </div>
            )}

            {/* ── TL TABLE ── */}
            {tab === 'tl' && (
              <div>
                <div
                  style={{
                    display: 'flex',
                    gap: 8,
                    marginBottom: 16,
                    flexWrap: 'wrap',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}
                >
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {[
                      ['all', 'All'],
                      ['active', 'Active'],
                      ['2026', 'Applied 2026'],
                      ['expiring', 'Expiring Soon'],
                      ['expired', 'Expired'],
                    ].map(([v, l]) => (
                      <button
                        key={v}
                        style={filterBtn(tlFilter === v)}
                        onClick={() => setTlFilter(v)}
                      >
                        {l}
                      </button>
                    ))}
                  </div>
                  <input
                    placeholder="🔍 Search…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    style={{
                      padding: '6px 12px',
                      borderRadius: 8,
                      border: '1px solid #e2e8f0',
                      fontSize: 12,
                      width: 200,
                      outline: 'none',
                    }}
                  />
                </div>
                <div style={{ overflowX: 'auto' }}>
                  <table
                    style={{
                      width: '100%',
                      borderCollapse: 'collapse',
                      fontSize: 12,
                    }}
                  >
                    <thead>
                      <tr style={{ background: '#f8fafc' }}>
                        {[
                          '#',
                          'Portal',
                          'Licence No.',
                          'Product Name',
                          'Risk',
                          'Tech',
                          'Issued',
                          'Expiry',
                          'Status',
                        ].map((h) => (
                          <th
                            key={h}
                            style={{
                              padding: '9px 12px',
                              textAlign: 'left',
                              fontWeight: 700,
                              color: '#475569',
                              borderBottom: '2px solid #e2e8f0',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {filteredTL.map((r, i) => (
                        <tr
                          key={r.id}
                          style={{
                            borderBottom: '1px solid #f1f5f9',
                            background: r.applied2026
                              ? '#fffbeb'
                              : 'transparent',
                          }}
                        >
                          <td style={{ padding: '8px 12px', color: '#94a3b8' }}>
                            {i + 1}
                          </td>
                          <td style={{ padding: '8px 12px' }}>
                            <span
                              style={{
                                background:
                                  r.portal === 'NSWS' ? '#ecfdf5' : '#eff6ff',
                                color:
                                  r.portal === 'NSWS' ? '#166534' : '#1e40af',
                                padding: '2px 7px',
                                borderRadius: 4,
                                fontWeight: 600,
                                fontSize: 10,
                              }}
                            >
                              {r.portal}
                            </span>
                            {r.applied2026 && (
                              <span
                                style={{
                                  marginLeft: 4,
                                  background: '#fef9c3',
                                  color: '#92400e',
                                  padding: '1px 5px',
                                  borderRadius: 4,
                                  fontSize: 9,
                                  fontWeight: 700,
                                }}
                              >
                                2026
                              </span>
                            )}
                          </td>
                          <td
                            style={{
                              padding: '8px 12px',
                              fontFamily: 'monospace',
                              fontSize: 10,
                              color: '#475569',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {r.licNo}
                          </td>
                          <td
                            style={{
                              padding: '8px 12px',
                              fontWeight: 600,
                              color: '#0f172a',
                              maxWidth: 200,
                            }}
                          >
                            {r.name}
                            {r.pdfUrl && (
                              <div style={{ marginTop: 4 }}>
                                <PdfBtn url={r.pdfUrl} />
                              </div>
                            )}
                          </td>
                          <td style={{ padding: '8px 12px' }}>
                            <RiskBadge risk={r.risk} />
                          </td>
                          <td style={{ padding: '8px 12px', color: '#64748b' }}>
                            {r.tech}
                          </td>
                          <td
                            style={{
                              padding: '8px 12px',
                              color: '#64748b',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {r.issued || '—'}
                          </td>
                          <td style={{ padding: '8px 12px', minWidth: 140 }}>
                            <ExpiryBar expiry={r.expiry} />
                          </td>
                          <td style={{ padding: '8px 12px' }}>
                            <Badge status={r.expiryStatus} />
                          </td>
                        </tr>
                      ))}
                      {filteredTL.length === 0 && (
                        <tr>
                          <td
                            colSpan={9}
                            style={{
                              padding: 24,
                              textAlign: 'center',
                              color: '#94a3b8',
                            }}
                          >
                            No records found.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* ── ML TABLE ── */}
            {tab === 'ml' && (
              <div>
                <div
                  style={{
                    display: 'flex',
                    gap: 8,
                    marginBottom: 16,
                    flexWrap: 'wrap',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}
                >
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {[
                      ['all', 'All'],
                      ['active', 'Active'],
                      ['2026', 'Applied 2026'],
                      ['expiring', 'Expiring Soon'],
                      ['expired', 'Expired'],
                    ].map(([v, l]) => (
                      <button
                        key={v}
                        style={filterBtn(mlFilter === v)}
                        onClick={() => setMlFilter(v)}
                      >
                        {l}
                      </button>
                    ))}
                  </div>
                  <input
                    placeholder="🔍 Search…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    style={{
                      padding: '6px 12px',
                      borderRadius: 8,
                      border: '1px solid #e2e8f0',
                      fontSize: 12,
                      width: 200,
                      outline: 'none',
                    }}
                  />
                </div>
                <div style={{ overflowX: 'auto' }}>
                  <table
                    style={{
                      width: '100%',
                      borderCollapse: 'collapse',
                      fontSize: 12,
                    }}
                  >
                    <thead>
                      <tr style={{ background: '#f8fafc' }}>
                        {[
                          '#',
                          'Licence No.',
                          'Product Name',
                          'Brand',
                          'Tech',
                          'Approved',
                          'Expiry',
                          'Kit (mo)',
                          'Status',
                        ].map((h) => (
                          <th
                            key={h}
                            style={{
                              padding: '9px 12px',
                              textAlign: 'left',
                              fontWeight: 700,
                              color: '#475569',
                              borderBottom: '2px solid #e2e8f0',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {filteredML.map((r, i) => (
                        <tr
                          key={r.id}
                          style={{
                            borderBottom: '1px solid #f1f5f9',
                            background: r.applied2026
                              ? '#fffbeb'
                              : 'transparent',
                          }}
                        >
                          <td style={{ padding: '8px 12px', color: '#94a3b8' }}>
                            {i + 1}
                          </td>
                          <td
                            style={{
                              padding: '8px 12px',
                              fontFamily: 'monospace',
                              fontSize: 10,
                              color: '#475569',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {r.licNo}
                            {r.applied2026 && (
                              <span
                                style={{
                                  marginLeft: 4,
                                  background: '#fef9c3',
                                  color: '#92400e',
                                  padding: '1px 5px',
                                  borderRadius: 4,
                                  fontSize: 9,
                                  fontWeight: 700,
                                }}
                              >
                                2026
                              </span>
                            )}
                          </td>
                          <td
                            style={{
                              padding: '8px 12px',
                              fontWeight: 600,
                              color: '#0f172a',
                              maxWidth: 200,
                            }}
                          >
                            {r.name}
                            {r.pdfUrl && (
                              <div style={{ marginTop: 4 }}>
                                <PdfBtn
                                  url={r.pdfUrl}
                                  color="#7c3aed"
                                  bg="#faf5ff"
                                  border="#e9d5ff"
                                />
                              </div>
                            )}
                          </td>
                          <td style={{ padding: '8px 12px', color: '#64748b' }}>
                            {r.brand}
                          </td>
                          <td style={{ padding: '8px 12px', color: '#64748b' }}>
                            {r.tech}
                          </td>
                          <td
                            style={{
                              padding: '8px 12px',
                              color: '#64748b',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {r.approved || '—'}
                          </td>
                          <td style={{ padding: '8px 12px', minWidth: 140 }}>
                            <ExpiryBar expiry={r.expiry} />
                          </td>
                          <td
                            style={{
                              padding: '8px 12px',
                              color: '#64748b',
                              textAlign: 'center',
                            }}
                          >
                            {r.kitMonths || '—'}
                          </td>
                          <td style={{ padding: '8px 12px' }}>
                            <Badge status={r.expiryStatus} />
                          </td>
                        </tr>
                      ))}
                      {filteredML.length === 0 && (
                        <tr>
                          <td
                            colSpan={9}
                            style={{
                              padding: 24,
                              textAlign: 'center',
                              color: '#94a3b8',
                            }}
                          >
                            No records found.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* ── ALERTS ── */}
            {tab === 'alerts' && (
              <div>
                {/* Expired */}
                <SectionCard style={{ marginBottom: 20 }}>
                  <SectionTitle
                    icon="🔴"
                    title="Expired Licences"
                    count={stats.tlExpired.length + stats.mlExpired.length}
                    color="#ef4444"
                  />
                  {stats.tlExpired.length + stats.mlExpired.length === 0 ? (
                    <div
                      style={{
                        color: '#22c55e',
                        fontWeight: 600,
                        fontSize: 13,
                      }}
                    >
                      ✅ No expired licences.
                    </div>
                  ) : (
                    <div style={{ overflowX: 'auto' }}>
                      <table
                        style={{
                          width: '100%',
                          borderCollapse: 'collapse',
                          fontSize: 12,
                        }}
                      >
                        <thead>
                          <tr style={{ background: '#fef2f2' }}>
                            {[
                              'Type',
                              'Licence No.',
                              'Product',
                              'Risk/Tech',
                              'Expired On',
                              'Days Overdue',
                              'PDF',
                            ].map((h) => (
                              <th
                                key={h}
                                style={{
                                  padding: '8px 12px',
                                  textAlign: 'left',
                                  fontWeight: 700,
                                  color: '#991b1b',
                                  borderBottom: '2px solid #fecaca',
                                  whiteSpace: 'nowrap',
                                }}
                              >
                                {h}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {[
                            ...stats.tlExpired.map((r) => ({
                              ...r,
                              ltype: 'TL',
                            })),
                            ...stats.mlExpired.map((r) => ({
                              ...r,
                              ltype: 'ML',
                            })),
                          ].map((r) => {
                            const d = parseDate(r.expiry);
                            const overdue = d ? Math.abs(daysUntil(d)) : '—';
                            return (
                              <tr
                                key={r.id}
                                style={{ borderBottom: '1px solid #fff1f2' }}
                              >
                                <td style={{ padding: '8px 12px' }}>
                                  <span
                                    style={{
                                      background:
                                        r.ltype === 'TL'
                                          ? '#eff6ff'
                                          : '#faf5ff',
                                      color:
                                        r.ltype === 'TL'
                                          ? '#1d4ed8'
                                          : '#6d28d9',
                                      padding: '2px 7px',
                                      borderRadius: 4,
                                      fontWeight: 700,
                                      fontSize: 11,
                                    }}
                                  >
                                    {r.ltype}
                                  </span>
                                </td>
                                <td
                                  style={{
                                    padding: '8px 12px',
                                    fontFamily: 'monospace',
                                    fontSize: 10,
                                    color: '#475569',
                                  }}
                                >
                                  {r.licNo}
                                </td>
                                <td
                                  style={{
                                    padding: '8px 12px',
                                    fontWeight: 600,
                                    color: '#0f172a',
                                  }}
                                >
                                  {r.name}
                                </td>
                                <td
                                  style={{
                                    padding: '8px 12px',
                                    color: '#64748b',
                                  }}
                                >
                                  {r.ltype === 'TL' ? (
                                    <RiskBadge risk={r.risk} />
                                  ) : (
                                    r.tech
                                  )}
                                </td>
                                <td
                                  style={{
                                    padding: '8px 12px',
                                    color: '#ef4444',
                                    fontWeight: 600,
                                    whiteSpace: 'nowrap',
                                  }}
                                >
                                  {d
                                    ? d.toLocaleDateString('en-IN', {
                                        day: '2-digit',
                                        month: 'short',
                                        year: 'numeric',
                                      })
                                    : '—'}
                                </td>
                                <td style={{ padding: '8px 12px' }}>
                                  <span
                                    style={{
                                      background: '#fef2f2',
                                      color: '#ef4444',
                                      border: '1px solid #fecaca',
                                      borderRadius: 6,
                                      padding: '2px 8px',
                                      fontWeight: 700,
                                      fontSize: 11,
                                    }}
                                  >
                                    {overdue}d
                                  </span>
                                </td>
                                <td style={{ padding: '8px 12px' }}>
                                  {r.ltype === 'TL' ? (
                                    <PdfBtn url={r.pdfUrl} />
                                  ) : (
                                    <PdfBtn
                                      url={r.pdfUrl}
                                      color="#7c3aed"
                                      bg="#faf5ff"
                                      border="#e9d5ff"
                                    />
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </SectionCard>

                {/* Expiring soon */}
                <SectionCard style={{ marginBottom: 20 }}>
                  <SectionTitle
                    icon="⚠️"
                    title="Expiring Soon (next 6 months)"
                    count={stats.tlExpiring.length + stats.mlExpiring.length}
                    color="#f97316"
                  />
                  {stats.tlExpiring.length + stats.mlExpiring.length === 0 ? (
                    <div
                      style={{
                        color: '#22c55e',
                        fontWeight: 600,
                        fontSize: 13,
                      }}
                    >
                      ✅ All licences healthy.
                    </div>
                  ) : (
                    [
                      ...stats.tlExpiring.map((r) => ({ ...r, ltype: 'TL' })),
                      ...stats.mlExpiring.map((r) => ({ ...r, ltype: 'ML' })),
                    ].map((r) => (
                      <div
                        key={r.id}
                        style={{
                          background: STATUS_META[r.expiryStatus].bg,
                          border: `1px solid ${
                            STATUS_META[r.expiryStatus].dot
                          }44`,
                          borderRadius: 10,
                          padding: '12px 16px',
                          marginBottom: 10,
                        }}
                      >
                        <div
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'flex-start',
                            flexWrap: 'wrap',
                            gap: 8,
                          }}
                        >
                          <div>
                            <div
                              style={{
                                display: 'flex',
                                gap: 6,
                                alignItems: 'center',
                                marginBottom: 4,
                              }}
                            >
                              <span
                                style={{
                                  background:
                                    r.ltype === 'TL' ? '#eff6ff' : '#faf5ff',
                                  color:
                                    r.ltype === 'TL' ? '#1d4ed8' : '#6d28d9',
                                  padding: '1px 7px',
                                  borderRadius: 4,
                                  fontWeight: 700,
                                  fontSize: 10,
                                }}
                              >
                                {r.ltype}
                              </span>
                              <span
                                style={{
                                  fontWeight: 700,
                                  fontSize: 13,
                                  color: '#0f172a',
                                }}
                              >
                                {r.name}
                              </span>
                            </div>
                            <div style={{ fontSize: 11, color: '#64748b' }}>
                              {r.licNo}
                            </div>
                          </div>
                          <div
                            style={{
                              display: 'flex',
                              gap: 8,
                              alignItems: 'center',
                            }}
                          >
                            <Badge status={r.expiryStatus} />
                            {r.ltype === 'TL' ? (
                              <PdfBtn url={r.pdfUrl} />
                            ) : (
                              <PdfBtn
                                url={r.pdfUrl}
                                color="#7c3aed"
                                bg="#faf5ff"
                                border="#e9d5ff"
                              />
                            )}
                          </div>
                        </div>
                        <div style={{ marginTop: 8 }}>
                          <ExpiryBar expiry={r.expiry} />
                        </div>
                      </div>
                    ))
                  )}
                </SectionCard>

                {/* Pipeline reminder */}
                <SectionCard>
                  <SectionTitle
                    icon="⏳"
                    title="Still in Pipeline"
                    count={stats.planPending}
                    color="#f97316"
                  />
                  {stats.planPending === 0 ? (
                    <div
                      style={{
                        color: '#22c55e',
                        fontWeight: 600,
                        fontSize: 13,
                      }}
                    >
                      ✅ All planned submissions done!
                    </div>
                  ) : (
                    planData
                      .filter((r) => ['Planned', 'Delayed'].includes(r.status))
                      .map((r) => {
                        const m =
                          PLAN_STATUS_META[r.status] ||
                          PLAN_STATUS_META['Planned'];
                        return (
                          <div
                            key={r.id}
                            style={{
                              background: m.bg,
                              border: `1px solid ${m.border}`,
                              borderRadius: 10,
                              padding: '12px 16px',
                              marginBottom: 10,
                            }}
                          >
                            <div
                              style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                flexWrap: 'wrap',
                                gap: 8,
                              }}
                            >
                              <div>
                                <div
                                  style={{
                                    fontWeight: 700,
                                    fontSize: 13,
                                    color: '#0f172a',
                                  }}
                                >
                                  {r.name}
                                </div>
                                <div
                                  style={{
                                    fontSize: 11,
                                    color: '#64748b',
                                    marginTop: 2,
                                  }}
                                >
                                  {r.type} · {r.body} · Target: {r.targetDate}
                                </div>
                              </div>
                              <PlanBadge status={r.status} />
                            </div>
                          </div>
                        );
                      })
                  )}
                </SectionCard>
              </div>
            )}
          </div>
        </>
      )}

      <div
        style={{
          textAlign: 'center',
          marginTop: 14,
          fontSize: 11,
          color: '#94a3b8',
        }}
      >
        Live · Google Sheets · TL: SUGAM &amp; NSWS · ML: CDSCO · Achira Labs ·{' '}
        {TODAY.toLocaleDateString('en-IN', {
          day: '2-digit',
          month: 'long',
          year: 'numeric',
        })}
      </div>
    </div>
  );
}
