import React, { useState, useEffect, useMemo } from 'react';
import "./PhoneTelemetryCard.css";

const getLocalDateString = () => {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

// Added targetDate to props
export default function PhoneTelemetryCard({ onOpen, events, loading, targetDate }) {
  const [tick, setTick] = useState(0);
  
  useEffect(() => {
    const timer = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(timer);
  }, []);

  const { isUnlocked, todayDurationMs, todaySessions, top5Sessions } = useMemo(() => {
    if (!events || events.length === 0 || !targetDate) {
      return { isUnlocked: false, todayDurationMs: 0, todaySessions: [], top5Sessions: [] };
    }

    const windowStartMs = new Date(`${targetDate}T00:00:00`).getTime();
    const windowEndMs = new Date(`${targetDate}T23:59:59`).getTime();
    const daySpan = windowEndMs - windowStartMs;
    const now = Date.now();
    
    // Check if the target date is strictly today to allow "Live" indicators
    const isToday = targetDate === getLocalDateString();

    const sorted = [...events].sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    );

    let latestIsUnlocked = false;
    for (let i = sorted.length - 1; i >= 0; i--) {
      const clean = (sorted[i].event || "").replace(/[\[\]]/g, "").trim().toLowerCase();
      if (clean === "device unlocked") {
        latestIsUnlocked = true;
        break;
      } else if (clean === "device locked") {
        latestIsUnlocked = false;
        break;
      }
    }

    const rawSessions = [];
    let pendingUnlock = null;

    for (const ev of sorted) {
      const evTime = new Date(ev.createdAt).getTime();
      const clean = (ev.event || "").replace(/[\[\]]/g, "").trim().toLowerCase();

      if (clean === "device unlocked") {
        pendingUnlock = evTime;
      } else if (clean === "device locked" && pendingUnlock) {
        rawSessions.push({ rawStart: pendingUnlock, rawEnd: evTime, isActive: false });
        pendingUnlock = null;
      }
    }

    // Only force the session open to 'now' if we are looking at today
    if (pendingUnlock !== null && isToday) {
      rawSessions.push({ rawStart: pendingUnlock, rawEnd: now, isActive: true });
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
          const leftPercent = ((effectiveStart - windowStartMs) / daySpan) * 100;
          const widthPercent = (durationMs / daySpan) * 100;

          clamped.push({
            id: `${s.rawStart}-${s.rawEnd}`,
            rawStart: s.rawStart,
            rawEnd: s.rawEnd,
            effectiveStart,
            effectiveEnd,
            durationMs,
            leftPercent,
            widthPercent: Math.max(widthPercent, 0.4),
            isActive: s.isActive
          });
        }
      }
    }

    const top5 = [...clamped].sort((a, b) => b.durationMs - a.durationMs).slice(0, 5);

    return {
      isUnlocked: latestIsUnlocked && isToday, // Only show real-time unlock status for today
      todayDurationMs: totalMs,
      todaySessions: clamped,
      top5Sessions: top5
    };
  }, [events, tick, targetDate]);

  const formatDuration = (ms) => {
    const totalSecs = Math.floor(ms / 1000);
    const hours = Math.floor(totalSecs / 3600);
    const mins = Math.floor((totalSecs % 3600) / 60);
    const secs = totalSecs % 60;
    if (hours > 0) return `${hours}h ${mins}m`;
    if (mins > 0) return `${mins}m ${secs}s`;
    return `${secs}s`;
  };

  const formatClock = (ms) => new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  return (
    <div className="bento-card col-8 clickable-card" onClick={onOpen}>
      <div className="card-header">
        <span className="card-title mono">Phone Telemetry</span>
        <span className="card-link-badge mono">Open Full View →</span>
      </div>

      <div className="phone-summary-row">
        <div>
          {loading ? (
            <div className="skeleton" style={{ width: '140px', height: '36px', borderRadius: '8px' }}></div>
          ) : (
            <div className="metric-big mono">{formatDuration(todayDurationMs)}</div>
          )}
          {/* Dynamically display the date we are inspecting */}
          <div className="metric-desc mono">Screen time for {targetDate}</div>
        </div>
        <div>
          {loading ? (
            <div className="skeleton" style={{ width: '80px', height: '24px', borderRadius: '12px' }}></div>
          ) : (
            <span className={`badge mono ${isUnlocked ? "badge-unlocked" : "badge-locked"}`}>
              <span className={`badge-dot ${isUnlocked ? "dot-unlocked" : "dot-locked"}`}></span>
              {isUnlocked ? "Unlocked" : "Locked"}
            </span>
          )}
        </div>
      </div>

      <div className="mini-timeline-container">
        <div className="mini-timeline-label mono">
          <span>Daily Distribution</span>
          <span>00:00 — 23:59</span>
        </div>
        {loading ? (
          <div className="skeleton" style={{ width: '100%', height: '14px', borderRadius: '6px' }}></div>
        ) : (
          <div className="mini-track">
            {todaySessions.map((s) => (
              <div
                key={s.id}
                style={{ left: `${s.leftPercent}%`, width: `${s.widthPercent}%` }}
                className={`mini-chunk ${s.isActive ? 'tag-live' : ''}`}
              />
            ))}
          </div>
        )}
      </div>

      <div className="table-section">
        <div className="table-heading mono">Top 5 Longest Sessions</div>
        <table className="top-sessions-table mono">
          <thead>
            <tr>
              <th className="rank-index">#</th>
              <th>Time Range</th>
              <th style={{ textAlign: "right" }}>Duration</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              [...Array(3)].map((_, idx) => (
                <tr key={idx}>
                  <td><div className="skeleton" style={{ width: '16px', height: '16px', borderRadius: '4px' }}></div></td>
                  <td><div className="skeleton" style={{ width: '120px', height: '16px', borderRadius: '4px' }}></div></td>
                  <td style={{ textAlign: "right" }}><div className="skeleton" style={{ width: '60px', height: '22px', borderRadius: '12px', float: 'right' }}></div></td>
                </tr>
              ))
            ) : top5Sessions.length === 0 ? (
              <tr>
                <td colSpan="3" style={{ color: "var(--text-faint)", padding: "12px 0", border: "none" }}>
                  No completed sessions logged on this date.
                </td>
              </tr>
            ) : (
              top5Sessions.map((s, idx) => (
                <tr key={idx}>
                  <td className="rank-index">{idx + 1}</td>
                  <td>
                    {formatClock(s.effectiveStart)} → {s.isActive ? "Now" : formatClock(s.effectiveEnd)}
                    {s.isActive && <span className="tag-badge tag-live" style={{ marginLeft: '6px' }}>Live</span>}
                  </td>
                  <td style={{ textAlign: "right" }}>
                    <span className="duration-pill">{formatDuration(s.durationMs)}</span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}