import React, { useState, useEffect, useMemo } from 'react';
import './PhoneTelemetryPage.css';

export default function PhoneTelemetryPage({ events, loading, onSync, onBack }) {
  const todayStr = new Date().toISOString().split('T')[0];
  const [selectedDate, setSelectedDate] = useState(todayStr);
  const [startTime, setStartTime] = useState("00:00");
  const [endTime, setEndTime] = useState("23:59");

  // 1. Setup a live ticker that updates every second
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(timer);
  }, []);

  // 2. Clamped session calculations (tied to 'tick')
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

    // If currently unlocked, include live active session up to now
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

          const leftPercent = ((effectiveStart - windowStartMs) / span) * 100;
          const widthPercent = (durationMs / span) * 100;

          clamped.push({
            id: `${s.rawStart}-${s.rawEnd}`,
            rawStart: s.rawStart,
            rawEnd: s.rawEnd,
            effectiveStart,
            effectiveEnd,
            durationMs,
            leftPercent,
            widthPercent,
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
  }, [events, selectedDate, startTime, endTime, tick]); // <-- Added 'tick' dependency

  // 3. Generate hour labels and tick positions based on the selected span
  const hourTicks = useMemo(() => {
    const windowStartMs = new Date(`${selectedDate}T${startTime}:00`).getTime();
    const windowEndMs = new Date(`${selectedDate}T${endTime}:00`).getTime();
    const span = Math.max(windowEndMs - windowStartMs, 1);
    const totalHours = span / (1000 * 60 * 60);

    // Pick an interval step so labels don't overlap
    let stepHours = 1;
    if (totalHours > 16) stepHours = 2;       // Every 2h for full-day views
    else if (totalHours > 8) stepHours = 2;  // Every 2h for 9-18 work views
    else stepHours = 1;                      // Every 1h for short windows

    const ticks = [];
    const cur = new Date(windowStartMs);
    cur.setMinutes(0, 0, 0);

    while (cur.getTime() <= windowEndMs) {
      const curTime = cur.getTime();
      if (curTime >= windowStartMs) {
        const hours = cur.getHours();
        if (hours % stepHours === 0) {
          const leftPercent = ((curTime - windowStartMs) / span) * 100;
          const label = `${String(hours).padStart(2, '0')}:00`;
          ticks.push({ timeMs: curTime, leftPercent, label });
        }
      }
      cur.setHours(cur.getHours() + 1);
    }

    return ticks;
  }, [selectedDate, startTime, endTime]);

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

  return (
    <div className="app-container">
      <header className="app-header">
        <button onClick={onBack} className="back-btn mono">
          ← Back to Bento Grid
        </button>
        <button onClick={onSync} disabled={loading} className="btn-pill mono">
          {loading ? "Syncing..." : "Sync Events"}
        </button>
      </header>

      {/* Filter Controls Bar */}
      <section className="filter-bar mono">
        <div className="filter-inputs">
          <label style={{ color: "var(--text-muted)" }}>Date</label>
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="clean-input mono"
          />
          <label style={{ color: "var(--text-muted)", marginLeft: "8px" }}>Span</label>
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

        {/* Timeline Distribution with Hour Labels and Grid Lines */}
        <div className="bento-card col-12">
          <div className="card-header">
            <span className="card-title mono">Timeline Distribution</span>
            <span className="card-title mono">{startTime} — {endTime}</span>
          </div>

          <div className="timeline-track-wrap">
            {/* Track with internal grid ticks and active session bars */}
            <div className="mini-track" style={{ height: "26px", position: "relative" }}>
              {/* Hour Grid Markers inside the track */}
              {hourTicks.map((t) => (
                <div
                  key={t.timeMs}
                  className="timeline-grid-line"
                  style={{ left: `${t.leftPercent}%` }}
                />
              ))}

              {/* Active Session Chunks */}
              {sessions.map((s) => (
                <div
                  key={s.id}
                  style={{
                    left: `${s.leftPercent}%`,
                    width: `${Math.max(s.widthPercent, 0.4)}%`,
                  }}
                  title={`${formatClock(s.effectiveStart)} - ${s.isActive ? 'Now' : formatClock(s.effectiveEnd)} (${formatDuration(s.durationMs)})`}
                  className={`mini-chunk ${s.isActive ? 'tag-live' : ''}`}
                />
              ))}
            </div>

            {/* Hour Text Labels below the track */}
            <div className="timeline-hour-labels mono">
              {hourTicks.map((t) => (
                <span
                  key={t.timeMs}
                  className="hour-label"
                  style={{ left: `${t.leftPercent}%` }}
                >
                  {t.label}
                </span>
              ))}
            </div>
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
    </div>
  );
}