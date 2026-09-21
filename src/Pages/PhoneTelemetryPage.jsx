import React, { useState, useEffect, useMemo } from 'react';
import './PhoneTelemetryPage.css';
import PhoneUsageReportModal from '../Components/PhoneUsageReportModal';
// ------------------------------------------------------------------
// SVG Dual-Clock Component
// ------------------------------------------------------------------
const ClockRing = ({ sessions, type, selectedDate }) => {
  const radius = 40;
  const circumference = 2 * Math.PI * radius;

  // Define the 12-hour window for this specific clock
  const midnightMs = new Date(`${selectedDate}T00:00:00`).getTime();
  const twelveHoursMs = 12 * 60 * 60 * 1000;
  const clockStart = type === 'AM' ? midnightMs : midnightMs + twelveHoursMs;
  const clockEnd = clockStart + twelveHoursMs;

  // Filter and clamp the sessions strictly to this clock's 12h window
  const clockSessions = sessions.map(s => {
    const start = Math.max(s.effectiveStart, clockStart);
    const end = Math.min(s.effectiveEnd, clockEnd);
    if (end > start) {
      return { ...s, start, end };
    }
    return null;
  }).filter(Boolean);

  return (
    <div style={{ position: 'relative', width: '160px', height: '160px', margin: '0 auto' }}>
      {/* -90deg rotation puts 00:00 / 12:00 at the top center */}
      <svg viewBox="0 0 100 100" style={{ transform: 'rotate(-90deg)', width: '100%', height: '100%', overflow: 'visible' }}>

        {/* Background Track - Fixed: Removed s.isActive here */}
        <circle cx="50" cy="50" r={radius} fill="none" stroke="var(--border-subtle)" strokeWidth="6" opacity="0.5" />

        {/* Hour Ticks */}
        {[...Array(12)].map((_, i) => {
          const angle = i * 30; // 360deg / 12 hours
          return (
            <line
              key={i}
              x1="50" y1="7" x2="50" y2="13"
              stroke="var(--text-faint)"
              strokeWidth="1.5"
              transform={`rotate(${angle} 50 50)`}
            />
          )
        })}

        {/* Phone Usage Boundary Rings */}
        {clockSessions.map((s, idx) => {
          const startPercent = (s.start - clockStart) / twelveHoursMs;
          const durationPercent = (s.end - s.start) / twelveHoursMs;

          // Ensure even tiny 10-second sessions render a minimum visible sliver (0.8px)
          const length = Math.max(durationPercent * circumference, 0.8);

          // Negative offset pushes the dash forward around the circle
          const offset = -(startPercent * circumference);

          return (
            <circle
              key={`${s.id}-${type}-${idx}`}
              cx="50" cy="50" r={radius}
              fill="none"
              /* Fixed: Applied the primary purple color here */
              stroke={s.isActive ? "var(--accent-emerald)" : "var(--accent-primary)"}
              strokeWidth="6"
              strokeDasharray={`${length} ${circumference}`}
              strokeDashoffset={offset}
            />
          );
        })}
      </svg>

      {/* Center Labels */}
      <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column' }}>
        <span className="mono" style={{ fontSize: '20px', fontWeight: 'bold', color: 'var(--text-main)' }}>{type}</span>
        <span className="mono" style={{ fontSize: '10px', color: 'var(--text-faint)' }}>
          {type === 'AM' ? '00:00-11:59' : '12:00-23:59'}
        </span>
      </div>
    </div>
  );
};


// ------------------------------------------------------------------
// Main Page Component
// ------------------------------------------------------------------
export default function PhoneTelemetryPage({ events, loading, onSync, onBack }) {
  const todayStr = new Date().toISOString().split('T')[0];
  const [selectedDate, setSelectedDate] = useState(todayStr);
  const [startTime, setStartTime] = useState("00:00");
  const [endTime, setEndTime] = useState("23:59");

  // Helper to safely shift dates by +/- days without timezone bugs
  const shiftDate = (daysOffset) => {
    const [y, m, d] = selectedDate.split('-').map(Number);
    const nextDate = new Date(y, m - 1, d + daysOffset);
    const year = nextDate.getFullYear();
    const month = String(nextDate.getMonth() + 1).padStart(2, '0');
    const day = String(nextDate.getDate()).padStart(2, '0');
    setSelectedDate(`${year}-${month}-${day}`);
  };

  const [tick, setTick] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(timer);
  }, []);

  const { sessions, totalDurationMs, windowSpanMs } = useMemo(() => {
    if (!events || events.length === 0) {
      return { sessions: [], totalDurationMs: 0, windowSpanMs: 1 };
    }

    const windowStartMs = new Date(`${selectedDate}T${startTime}:00`).getTime();
    const windowEndMs = new Date(`${selectedDate}T${endTime}:00`).getTime();
    const span = Math.max(windowEndMs - windowStartMs, 1);
    const now = Date.now();

    const sorted = [...events].sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    );

    const rawSessions = [];
    let pendingUnlock = null;

    for (const ev of sorted) {
      const evTime = new Date(ev.createdAt).getTime();
      const clean = (ev.event || "").replace(/[\[\]]/g, "").trim().toLowerCase();

      if (clean === "device unlocked") {
        pendingUnlock = evTime;
      } else if (clean === "device locked" && pendingUnlock) {
        rawSessions.push({
          rawStart: pendingUnlock,
          rawEnd: evTime,
          durationMs: evTime - pendingUnlock,
          isActive: false
        });
        pendingUnlock = null;
      }
    }

    if (pendingUnlock) {
      rawSessions.push({
        rawStart: pendingUnlock,
        rawEnd: now,
        durationMs: now - pendingUnlock,
        isActive: true,
      });
    }

    const clamped = [];
    let totalMs = 0;

    for (const s of rawSessions) {
      if (s.rawStart < windowEndMs && s.rawEnd > windowStartMs) {
        const effectiveStart = Math.max(s.rawStart, windowStartMs);
        const effectiveEnd = Math.min(s.rawEnd, windowEndMs);
        const durationMs = effectiveEnd - effectiveStart;

        if (durationMs > 0) {
          totalMs += durationMs;

          clamped.push({
            id: `${s.rawStart}-${s.rawEnd}`,
            rawStart: s.rawStart,
            rawEnd: s.rawEnd,
            effectiveStart,
            effectiveEnd,
            durationMs,
            clippedStart: s.rawStart < windowStartMs,
            clippedEnd: s.rawEnd > windowEndMs,
            isActive: s.isActive,
          });
        }
      }
    }

    return {
      sessions: clamped.reverse(),
      totalDurationMs: totalMs,
      windowSpanMs: span,
    };
  }, [events, selectedDate, startTime, endTime, tick]);

  const formatDuration = (ms) => {
    const totalSecs = Math.floor(ms / 1000);
    const hours = Math.floor(totalSecs / 3600);
    const mins = Math.floor((totalSecs % 3600) / 60);
    const secs = totalSecs % 60;
    if (hours > 0) return `${hours}h ${mins}m`;
    if (mins > 0) return `${mins}m ${secs}s`;
    return `${secs}s`;
  };

  const formatClock = (ms) =>
    new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const [isReportOpen, setIsReportOpen] = useState(false);
  return (
    <div className="app-container">
      <header className="app-header">
        <button onClick={onBack} className="back-btn mono">← Back to Bento Grid</button>
        <div style={{ display: 'flex', gap: '8px' }}>
          {/* NEW REPORT BUTTON */}
          <button onClick={() => setIsReportOpen(true)} className="btn-pill mono">
            Report
          </button>
          <button onClick={onSync} disabled={loading} className="btn-pill mono">
            {loading ? "Syncing..." : "Sync Events"}
          </button>
        </div>
      </header>

      {/* Filter Controls Bar */}
      <section className="filter-bar mono">
        <div className="filter-inputs">
          <label style={{ color: "var(--text-muted)" }}>Date</label>

          <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
            <button
              onClick={() => shiftDate(-1)}
              className="btn-pill"
              style={{ padding: "4px 8px", minWidth: "auto" }}
              title="Previous Day"
            >
              ◀
            </button>
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="clean-input mono"
            />
            <button
              onClick={() => shiftDate(1)}
              disabled={selectedDate === todayStr}
              className="btn-pill"
              style={{
                padding: "4px 8px",
                minWidth: "auto",
                opacity: selectedDate === todayStr ? 0.3 : 1,
                cursor: selectedDate === todayStr ? "not-allowed" : "pointer"
              }}
              title="Next Day"
            >
              ▶
            </button>
          </div>

          <label style={{ color: "var(--text-muted)", marginLeft: "12px" }}>Span</label>
          <input
            type="time"
            value={startTime}
            onChange={(e) => setStartTime(e.target.value)}
            className="clean-input mono"
          />
          <span style={{ color: "var(--text-faint)" }}>—</span>
          <input
            type="time"
            value={endTime}
            onChange={(e) => setEndTime(e.target.value)}
            className="clean-input mono"
          />
        </div>

        <div style={{ display: "flex", gap: "6px" }}>
          <button onClick={() => { setStartTime("00:00"); setEndTime("23:59"); }} className="btn-pill">
            All Day
          </button>
          <button onClick={() => { setStartTime("09:00"); setEndTime("18:00"); }} className="btn-pill">
            Work (9-6)
          </button>
        </div>
      </section>

      <div className="bento-grid">
        {/* Metric Card 1 */}
        <div className="bento-card col-4">
          <div className="card-header">
            <span className="card-title mono">Window Total</span>
          </div>
          <div className="metric-big mono">{formatDuration(totalDurationMs)}</div>
          <div className="metric-desc mono">Screen time inside clamped window</div>
        </div>

        {/* Metric Card 2 */}
        <div className="bento-card col-4">
          <div className="card-header">
            <span className="card-title mono">Session Count</span>
          </div>
          <div className="metric-big mono">{sessions.length}</div>
          <div className="metric-desc mono">Paired unlock-to-lock cycles</div>
        </div>

        {/* Metric Card 3 */}
        <div className="bento-card col-4">
          <div className="card-header">
            <span className="card-title mono">Activity Density</span>
          </div>
          <div className="metric-big mono" style={{ color: "var(--accent-emerald)" }}>
            {((totalDurationMs / windowSpanMs) * 100).toFixed(1)}%
          </div>
          <div className="metric-desc mono">Active vs idle window ratio</div>
        </div>

        {/* Dual Clock Distribution */}
        <div className="bento-card col-12">
          <div className="card-header">
            <span className="card-title mono">12-Hour Cycle Distribution</span>
            <span className="card-title mono">{startTime} — {endTime}</span>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-around', alignItems: 'center', padding: '36px 0', flexWrap: 'wrap', gap: '32px' }}>
            <ClockRing sessions={sessions} type="AM" selectedDate={selectedDate} />
            <ClockRing sessions={sessions} type="PM" selectedDate={selectedDate} />
          </div>
        </div>

        {/* Complete Session List */}
        <div className="bento-card col-12">
          <div className="card-header">
            <span className="card-title mono">Clamped Session History ({sessions.length})</span>
          </div>
          <div className="full-feed mono">
            {sessions.length === 0 ? (
              <div style={{ color: "var(--text-faint)", padding: "16px 0" }}>
                No sessions captured in this range.
              </div>
            ) : (
              sessions.map((s) => (
                <div key={s.id} className="feed-item">
                  <div>
                    <span>{formatClock(s.effectiveStart)} → {s.isActive ? "Now" : formatClock(s.effectiveEnd)}</span>
                    {s.clippedStart && <span className="tag-badge tag-amber" style={{ marginLeft: "6px" }}>Started before</span>}
                    {s.clippedEnd && <span className="tag-badge tag-amber" style={{ marginLeft: "6px" }}>Ended after</span>}
                    {s.isActive && <span className="tag-badge tag-live" style={{ marginLeft: "6px" }}>Active</span>}
                  </div>
                  <span className="duration-pill">{formatDuration(s.durationMs)}</span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* popup */}
      {isReportOpen && (
        <PhoneUsageReportModal
          events={events}
          onClose={() => setIsReportOpen(false)}
        />
      )}
    </div>
  );
}