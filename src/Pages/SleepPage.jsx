import { useState, useMemo } from 'react';
import { analyzeSleepForDate, formatSleepTime, formatSleepDuration } from '../utils/sleepUtils';
import './SleepPage.css';

export default function SleepPage({ events, loading, onSync, onBack }) {
  const todayStr = new Date().toISOString().split('T')[0];
  const [selectedDate, setSelectedDate] = useState(todayStr);

  // Local storage for manually toggling / excluding candidates
  const storageKey = `sleep_exclude_${selectedDate}`;
  const [excludedIds, setExcludedIds] = useState(() => {
    return JSON.parse(localStorage.getItem(storageKey) || "[]");
  });

  const toggleExclude = (id) => {
    let next;
    if (excludedIds.includes(id)) {
      next = excludedIds.filter((item) => item !== id);
    } else {
      next = [...excludedIds, id];
    }
    setExcludedIds(next);
    localStorage.setItem(storageKey, JSON.stringify(next));
  };

  const sleepData = useMemo(() => {
    return analyzeSleepForDate(events, selectedDate, excludedIds);
  }, [events, selectedDate, excludedIds]);

  // Visual bar calculations across the 8 PM -> 2 PM window
  const visualData = useMemo(() => {
    if (!sleepData || !sleepData.hasSleep) return { chunks: [], hourTicks: [] };

    const span = sleepData.windowEnd - sleepData.windowStart;

    const chunks = [];
    for (const block of sleepData.stitchedBlocks) {
      const left = ((block.start - sleepData.windowStart) / span) * 100;
      const width = (block.durationMs / span) * 100;
      chunks.push({
        id: block.id,
        left,
        width,
        type: 'sleep',
        label: `${formatSleepTime(block.start)} - ${formatSleepTime(block.end)} (${formatSleepDuration(block.durationMs)})`
      });
    }

    for (const awake of sleepData.interruptions) {
      const left = ((awake.start - sleepData.windowStart) / span) * 100;
      const width = (awake.durationMs / span) * 100;
      chunks.push({
        id: `${awake.start}-${awake.end}`,
        left,
        width,
        type: 'awake',
        label: `Awake: ${formatSleepDuration(awake.durationMs)}`
      });
    }

    // Generate hour ticks every 2 hours from 20:00 to 14:00
    const ticks = [];
    let cur = new Date(sleepData.windowStart);
    cur.setMinutes(0, 0, 0);

    while (cur.getTime() <= sleepData.windowEnd) {
      const timeMs = cur.getTime();
      const left = ((timeMs - sleepData.windowStart) / span) * 100;
      const hours = cur.getHours();
      ticks.push({
        timeMs,
        left,
        label: `${String(hours).padStart(2, '0')}:00`
      });
      cur.setHours(cur.getHours() + 2);
    }

    return { chunks, hourTicks: ticks };
  }, [sleepData]);

  return (
    <div className="app-container">
      {/* Top Header */}
      <header className="app-header">
        <button onClick={onBack} className="back-btn mono">
          ← Back to Bento Grid
        </button>
        <button onClick={onSync} disabled={loading} className="btn-pill mono">
          {loading ? "Syncing..." : "Sync Events"}
        </button>
      </header>

      {/* Date Controls */}
      <section className="filter-bar mono">
        <div className="filter-inputs">
          <label style={{ color: "var(--text-muted)" }}>Target Morning</label>
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => {
              setSelectedDate(e.target.value);
              const nextKey = `sleep_exclude_${e.target.value}`;
              setExcludedIds(JSON.parse(localStorage.getItem(nextKey) || "[]"));
            }}
            className="clean-input mono"
          />
        </div>
        <div style={{ fontSize: "12px", color: "var(--text-muted)" }}>
          Analyzing lock gaps between 11:00 PM (prev day) and 11:00 AM
        </div>
      </section>

      {!sleepData || !sleepData.hasSleep ? (
        <div className="bento-card col-12 empty-slot mono" style={{ textAlign: "center", padding: "48px 0" }}>
          <div className="metric-big">No Sleep Session Detected</div>
          <div style={{ color: "var(--text-faint)", marginTop: "8px" }}>
            No phone lock periods longer than 2 hours recorded for this night.
          </div>
        </div>
      ) : (
        <div className="bento-grid">
          {/* Metric 1: Actual Sleep */}
          <div className="bento-card col-3">
            <div className="card-header">
              <span className="card-title mono">Actual Sleep</span>
            </div>
            <div className="metric-big mono" style={{ color: "#4f46e5" }}>
              {formatSleepDuration(sleepData.actualSleepMs)}
            </div>
            <div className="metric-desc mono">Net sleep duration</div>
          </div>

          {/* Metric 2: Time in Bed */}
          <div className="bento-card col-3">
            <div className="card-header">
              <span className="card-title mono">Time in Bed</span>
            </div>
            <div className="metric-big mono">
              {formatSleepDuration(sleepData.timeInBedMs)}
            </div>
            <div className="metric-desc mono">
              {formatSleepTime(sleepData.bedTime)} → {formatSleepTime(sleepData.wakeTime)}
            </div>
          </div>

          {/* Metric 3: Sleep Efficiency */}
          <div className="bento-card col-3">
            <div className="card-header">
              <span className="card-title mono">Efficiency</span>
            </div>
            <div className="metric-big mono">
              {sleepData.efficiency}%
            </div>
            <div className="metric-desc mono">Sleep / In-bed ratio</div>
          </div>

          {/* Metric 4: Awakenings */}
          <div className="bento-card col-3">
            <div className="card-header">
              <span className="card-title mono">Awake Interruptions</span>
            </div>
            <div className="metric-big mono" style={{ color: "#d97706" }}>
              {sleepData.interruptions.length}
            </div>
            <div className="metric-desc mono">
              {formatSleepDuration(sleepData.totalAwakeMs)} total awake
            </div>
          </div>

          {/* Sleep Timeline Bar */}
          <div className="bento-card col-12">
            <div className="card-header">
              <span className="card-title mono">Sleep & Awakenings Timeline</span>
              <span className="card-title mono">20:00 — 14:00 Window</span>
            </div>

            <div className="sleep-timeline-bar-wrap">
              <div className="sleep-full-track">
                {visualData.chunks.map((chunk, idx) => (
                  <div
                    key={idx}
                    className={chunk.type === 'sleep' ? 'sleep-timeline-chunk' : 'awake-timeline-chunk'}
                    style={{ left: `${chunk.left}%`, width: `${Math.max(chunk.width, 0.4)}%` }}
                    title={chunk.label}
                  />
                ))}
              </div>

              {/* Hour Grid Labels */}
              <div className="timeline-hour-labels mono">
                {visualData.hourTicks.map((tick) => (
                  <span
                    key={tick.timeMs}
                    className="hour-label"
                    style={{ left: `${tick.left}%` }}
                  >
                    {tick.label}
                  </span>
                ))}
              </div>
            </div>
          </div>

          {/* Candidate Gaps Selection List (Human in the loop) */}
          <div className="bento-card col-12">
            <div className="card-header">
              <span className="card-title mono">Detected Phone Inactivity Gaps</span>
              <span className="card-tag mono">1-Click Include / Exclude</span>
            </div>
            <div className="candidates-list mono">
              {sleepData.idleChunks.map((chunk) => {
                const isExcluded = excludedIds.includes(chunk.id);
                const isStitched = sleepData.stitchedBlocks.some((b) => b.id === chunk.id);

                return (
                  <div
                    key={chunk.id}
                    className={`candidate-item ${isStitched ? 'included' : ''} ${isExcluded ? 'excluded' : ''}`}
                  >
                    <div className="candidate-left">
                      <span style={{ fontWeight: 600 }}>
                        {formatSleepTime(chunk.start)} → {formatSleepTime(chunk.end)}
                      </span>
                      <span className="duration-pill">
                        {formatSleepDuration(chunk.durationMs)}
                      </span>
                      {isStitched && (
                        <span className="tag-badge tag-live">Active in Sleep</span>
                      )}
                      {isExcluded && (
                        <span className="tag-badge tag-amber">Manually Excluded</span>
                      )}
                    </div>

                    <button
                      onClick={() => toggleExclude(chunk.id)}
                      className={`btn-toggle-candidate mono ${!isExcluded ? 'active' : ''}`}
                    >
                      {isExcluded ? "+ Include" : "✓ Active (Click to Exclude)"}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}