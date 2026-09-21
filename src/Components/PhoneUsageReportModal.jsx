import React, { useState, useMemo } from 'react';
import './PhoneUsageReportModal.css';

const getLocalDateString = (d) => {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const formatDuration = (ms) => {
  const totalSecs = Math.floor(ms / 1000);
  const hours = Math.floor(totalSecs / 3600);
  const mins = Math.floor((totalSecs % 3600) / 60);
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
};

export default function PhoneUsageReportModal({ events, onClose }) {
  const [rangeType, setRangeType] = useState('week'); 
  const [hoveredPoint, setHoveredPoint] = useState(null); // Tooltip state
  
  const today = new Date();
  const defaultEnd = getLocalDateString(today);
  
  const weekAgo = new Date();
  weekAgo.setDate(today.getDate() - 6);
  
  const monthAgo = new Date();
  monthAgo.setDate(today.getDate() - 29);

  const [customStart, setCustomStart] = useState(getLocalDateString(weekAgo));
  const [customEnd, setCustomEnd] = useState(defaultEnd);

  const { startDate, endDate } = useMemo(() => {
    if (rangeType === 'week') return { startDate: getLocalDateString(weekAgo), endDate: defaultEnd };
    if (rangeType === 'month') return { startDate: getLocalDateString(monthAgo), endDate: defaultEnd };
    return { startDate: customStart, endDate: customEnd };
  }, [rangeType, customStart, customEnd, defaultEnd]);

  const { chartData, totalMs, maxMs } = useMemo(() => {
    if (!events || events.length === 0) return { chartData: [], totalMs: 0, maxMs: 0 };

    const startMs = new Date(`${startDate}T00:00:00`).getTime();
    const endMs = new Date(`${endDate}T23:59:59`).getTime();
    const sorted = [...events].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

    const sessions = [];
    let pendingUnlock = null;
    for (const ev of sorted) {
      const evTime = new Date(ev.createdAt).getTime();
      const clean = (ev.event || "").replace(/[\[\]]/g, "").trim().toLowerCase();
      if (clean === "device unlocked") pendingUnlock = evTime;
      else if (clean === "device locked" && pendingUnlock) {
        sessions.push({ start: pendingUnlock, end: evTime });
        pendingUnlock = null;
      }
    }
    if (pendingUnlock) sessions.push({ start: pendingUnlock, end: Date.now() });

    const dailyMap = {};
    for (let d = new Date(startMs); d <= new Date(endMs); d.setDate(d.getDate() + 1)) {
      dailyMap[getLocalDateString(d)] = 0;
    }

    for (const s of sessions) {
      if (s.end >= startMs && s.start <= endMs) {
        const effStart = Math.max(s.start, startMs);
        const effEnd = Math.min(s.end, endMs);
        const dateStr = getLocalDateString(new Date(effStart));
        if (dailyMap[dateStr] !== undefined) {
          dailyMap[dateStr] += (effEnd - effStart);
        }
      }
    }

    let max = 0;
    let total = 0;
    const finalData = Object.keys(dailyMap).sort().map(date => {
      const ms = dailyMap[date];
      if (ms > max) max = ms;
      total += ms;
      const dateObj = new Date(`${date}T12:00:00`);
      return {
        date,
        shortLabel: dateObj.toLocaleDateString('en-US', { weekday: 'short' }), 
        dayNum: dateObj.getDate(), 
        totalMs: ms
      };
    });

    return { chartData: finalData, totalMs: total, maxMs: max };
  }, [events, startDate, endDate]);

  const avgMs = chartData.length > 0 ? totalMs / chartData.length : 0;

  // --- SVG Chart Configuration ---
  const svgWidth = 600;
  const svgHeight = 200;
  const padding = { top: 20, right: 20, bottom: 30, left: 40 };
  const chartWidth = svgWidth - padding.left - padding.right;
  const chartHeight = svgHeight - padding.top - padding.bottom;

  // Determine Y-axis max value (round up to nearest hour, min 1 hour)
  const msInHour = 1000 * 60 * 60;
  const maxHours = Math.max(Math.ceil(maxMs / msInHour), 1);
  const chartMaxMs = maxHours * msInHour;

  // Generate Y-axis grid ticks (e.g., 0, half, max)
  const yTicks = [0, maxHours / 2, maxHours];

  // Map data to SVG coordinates
  const points = chartData.map((d, i) => {
    const x = chartData.length === 1 
      ? padding.left + chartWidth / 2 
      : padding.left + (i / (chartData.length - 1)) * chartWidth;
    const y = padding.top + chartHeight - (d.totalMs / chartMaxMs) * chartHeight;
    return { ...d, x, y };
  });

  const polylinePoints = points.map(p => `${p.x},${p.y}`).join(' ');

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content mono" onClick={e => e.stopPropagation()}>
        
        <div className="modal-header">
          <span className="card-title" style={{ fontSize: '18px' }}>Telemetry Report</span>
          <button className="modal-close-btn" onClick={onClose}>×</button>
        </div>

        <div className="report-controls">
          <button onClick={() => setRangeType('week')} className={`btn-pill ${rangeType === 'week' ? 'active' : ''}`}>Last 7 Days</button>
          <button onClick={() => setRangeType('month')} className={`btn-pill ${rangeType === 'month' ? 'active' : ''}`}>Last 30 Days</button>
          <button onClick={() => setRangeType('custom')} className={`btn-pill ${rangeType === 'custom' ? 'active' : ''}`}>Custom</button>

          {rangeType === 'custom' && (
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginLeft: 'auto' }}>
              <input type="date" value={customStart} onChange={e => setCustomStart(e.target.value)} className="clean-input mono" />
              <span style={{ color: 'var(--text-faint)' }}>—</span>
              <input type="date" value={customEnd} onChange={e => setCustomEnd(e.target.value)} className="clean-input mono" />
            </div>
          )}
        </div>

        <div className="report-summary">
          <div>
            <div style={{ color: 'var(--text-muted)', fontSize: '12px' }}>Total Usage</div>
            <div className="metric-big" style={{ color: 'var(--accent-primary)', fontSize: '24px' }}>{formatDuration(totalMs)}</div>
          </div>
          <div>
            <div style={{ color: 'var(--text-muted)', fontSize: '12px' }}>Daily Average</div>
            <div className="metric-big" style={{ fontSize: '24px' }}>{formatDuration(avgMs)}</div>
          </div>
        </div>

        {/* Responsive SVG Line Chart */}
        <div className="chart-container">
          
          {/* Absolute React Tooltip */}
          {hoveredPoint && (
            <div 
              className="chart-tooltip mono"
              style={{ left: `${(hoveredPoint.x / svgWidth) * 100}%`, top: `${(hoveredPoint.y / svgHeight) * 100}%` }}
            >
              <div style={{ fontWeight: 'bold' }}>{hoveredPoint.date}</div>
              <div>{formatDuration(hoveredPoint.totalMs)}</div>
            </div>
          )}

          <svg viewBox={`0 0 ${svgWidth} ${svgHeight}`} className="chart-svg" preserveAspectRatio="none">
            {/* Define Theme Gradient */}
            <defs>
              <linearGradient id="primaryGradient" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor="#8b5cf6" />
                <stop offset="100%" stopColor="#d946ef" />
              </linearGradient>
            </defs>

            {/* Y-Axis Grid Lines & Labels */}
            {yTicks.map(tick => {
              const yPos = padding.top + chartHeight - (tick / maxHours) * chartHeight;
              return (
                <g key={tick}>
                  <text x={padding.left - 10} y={yPos + 4} textAnchor="end" className="chart-axis-text">
                    {tick}h
                  </text>
                  <line 
                    x1={padding.left} y1={yPos} 
                    x2={svgWidth - padding.right} y2={yPos} 
                    className="chart-grid-line" 
                  />
                </g>
              );
            })}

            {/* X-Axis Labels (Only show if <= 14 days to prevent overlap) */}
            {points.length <= 14 && points.map((p, i) => (
              <text key={i} x={p.x} y={svgHeight - 5} textAnchor="middle" className="chart-axis-text">
                {p.dayNum}
              </text>
            ))}

            {/* The Line */}
            {points.length > 0 && (
              <polyline points={polylinePoints} className="chart-line" />
            )}

            {/* Data Points (Hoverable) */}
            {points.map((p, i) => (
              <circle
                key={i}
                cx={p.x}
                cy={p.y}
                r="4"
                className="chart-point"
                onMouseEnter={() => setHoveredPoint(p)}
                onMouseLeave={() => setHoveredPoint(null)}
              />
            ))}
          </svg>
        </div>

      </div>
    </div>
  );
}