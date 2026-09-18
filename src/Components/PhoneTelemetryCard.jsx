import { useMemo } from 'react';
import "./PhoneTelemetryCard.css";

export default function PhoneTelemetryCard({ onOpen, events, loading }) {
  const { isUnlocked, todayDurationMs, todaySessions, top5Sessions } = useMemo(() => {
    if (!events || events.length === 0) {
      return { isUnlocked: false, todayDurationMs: 0, todaySessions: [], top5Sessions: [] };
    }

    const todayStr = new Date().toISOString().split('T')[0];
    const midnightToday = new Date(`${todayStr}T00:00:00`).getTime();
    const endToday = new Date(`${todayStr}T23:59:59`).getTime();
    const daySpan = endToday - midnightToday;

    // Chronological order (oldest to newest)
    const sorted = [...events].sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    );

    // 1. Determine current state strictly from the MOST RECENT entry
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

    // 2. Pair sessions for calculations
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
    if (pendingUnlock !== null) {
      rawSessions.push({
        rawStart: pendingUnlock,
        rawEnd: Date.now(),
        durationMs: Date.now() - pendingUnlock,
        isActive: true
      });
    }

    // Filter sessions belonging to today
    const forToday = rawSessions.filter(
      (s) => s.rawStart >= midnightToday && s.rawStart <= endToday
    );

    // Timeline distribution chunks
    const visualChunks = forToday.map((s) => {
      const leftPercent = ((s.rawStart - midnightToday) / daySpan) * 100;
      const widthPercent = (s.durationMs / daySpan) * 100;
      return {
        id: `${s.rawStart}-${s.rawEnd}`,
        leftPercent,
        widthPercent: Math.max(widthPercent, 0.4)
      };
    });

    const totalMs = forToday.reduce((acc, curr) => acc + curr.durationMs, 0);

    const top5 = [...forToday]
      .sort((a, b) => b.durationMs - a.durationMs)
      .slice(0, 5);

    return {
      isUnlocked: latestIsUnlocked,
      todayDurationMs: totalMs,
      todaySessions: visualChunks,
      top5Sessions: top5
    };
  }, [events]);

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
    <div className="bento-card col-8 clickable-card" onClick={onOpen}>
      <div className="card-header">
        <span className="card-title mono">Phone Telemetry</span>
        <span className="card-link-badge mono">Open Full View →</span>
      </div>

      {/* Screen Time & State Badge */}
      <div className="phone-summary-row">
        <div>
          <div className="metric-big mono">
            {loading ? "..." : formatDuration(todayDurationMs)}
          </div>
          <div className="metric-desc mono">Screen time today</div>
        </div>
        <div>
          <span className={`badge mono ${isUnlocked ? "badge-unlocked" : "badge-locked"}`}>
            <span className={`badge-dot ${isUnlocked ? "dot-unlocked" : "dot-locked"}`}></span>
            {isUnlocked ? "Unlocked" : "Locked"}
          </span>
        </div>
      </div>

      {/* Mini Distribution Bar */}
      <div className="mini-timeline-container">
        <div className="mini-timeline-label mono">
          <span>Today's Distribution</span>
          <span>00:00 — 23:59</span>
        </div>
        <div className="mini-track">
          {todaySessions.map((s) => (
            <div
              key={s.id}
              style={{ left: `${s.leftPercent}%`, width: `${s.widthPercent}%` }}
              className="mini-chunk"
            />
          ))}
        </div>
      </div>

      {/* Top 5 Sessions Table */}
      <div className="table-section">
        <div className="table-heading mono">Top 5 Longest Sessions Today</div>
        {top5Sessions.length === 0 ? (
          <div className="mono" style={{ fontSize: "12px", color: "var(--text-faint)", padding: "8px 0" }}>
            {loading ? "Fetching logs..." : "No completed sessions logged today yet."}
          </div>
        ) : (
          <table className="top-sessions-table mono">
            <thead>
              <tr>
                <th className="rank-index">#</th>
                <th>Time Range</th>
                <th style={{ textAlign: "right" }}>Duration</th>
              </tr>
            </thead>
            <tbody>
              {top5Sessions.map((s, idx) => (
                <tr key={idx}>
                  <td className="rank-index">{idx + 1}</td>
                  <td>
                    {formatClock(s.rawStart)} → {formatClock(s.rawEnd)}
                    {s.isActive && <span className="tag-badge tag-live">Active</span>}
                  </td>
                  <td style={{ textAlign: "right" }}>
                    <span className="duration-pill">{formatDuration(s.durationMs)}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}