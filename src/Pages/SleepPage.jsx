import { useState, useEffect, useMemo } from 'react';
import { analyzeSleepForDate, formatSleepTime, formatSleepDuration } from '../utils/sleepUtils';
import './SleepPage.css';

// Strict local date helper (avoids UTC timezone shift)
const getLocalDateString = () => {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export default function SleepPage({ events, loading, onSync, onBack }) {
  const [selectedDate, setSelectedDate] = useState(getLocalDateString);
  const [excludedIds, setExcludedIds] = useState([]);

  // Sync excluded gaps whenever selectedDate changes
  useEffect(() => {
    const saved = JSON.parse(localStorage.getItem(`sleep_exclude_${selectedDate}`) || "[]");
    setExcludedIds(saved);
  }, [selectedDate]);

  const toggleExclude = (id) => {
    const next = excludedIds.includes(id)
      ? excludedIds.filter((item) => item !== id)
      : [...excludedIds, id];

    setExcludedIds(next);
    localStorage.setItem(`sleep_exclude_${selectedDate}`, JSON.stringify(next));
  };

  const resetAllExcludes = () => {
    setExcludedIds([]);
    localStorage.removeItem(`sleep_exclude_${selectedDate}`);
  };

  const sleepData = useMemo(() => {
    return analyzeSleepForDate(events, selectedDate, excludedIds);
  }, [events, selectedDate, excludedIds]);

  // Generate visual segments and dynamic hour tick markers
  const visualData = useMemo(() => {
    if (!sleepData || !sleepData.windowStart || !sleepData.windowEnd) {
      return { chunks: [], hourTicks: [] };
    }

    const span = Math.max(sleepData.windowEnd - sleepData.windowStart, 1);
    const totalHours = span / (1000 * 60 * 60);
    const stepHours = totalHours > 16 ? 2 : 1;

    const chunks = [];
    if (sleepData.hasSleep) {
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
    }

    // Dynamic hour ticks
    const ticks = [];
    let cur = new Date(sleepData.windowStart);
    cur.setMinutes(0, 0, 0);

    while (cur.getTime() <= sleepData.windowEnd) {
      const timeMs = cur.getTime();
      if (timeMs >= sleepData.windowStart) {
        const left = ((timeMs - sleepData.windowStart) / span) * 100;
        const hours = cur.getHours();
        if (hours % stepHours === 0) {
          ticks.push({
            timeMs,
            left,
            label: `${String(hours).padStart(2, '0')}:00`
          });
        }
      }
      cur.setHours(cur.getHours() + 1);
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

      {/* Date Filter Bar */}
      <section className="filter-bar mono">
        <div className="filter-inputs">
          <label style={{ color: "var(--text-muted)" }}>Target Morning</label>
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="clean-input mono"
          />
        </div>

        {excludedIds.length > 0 && (
          <button onClick={resetAllExcludes} className="btn-pill mono" style={{ color: "var(--accent-amber)" }}>
            ↺ Reset Excluded Gaps ({excludedIds.length})
          </button>
        )}
      </section>

      <div className="bento-grid">
        {/* Metric Cards */}
        {sleepData && sleepData.hasSleep ? (
          <>
            <div className="bento-card col-3">
              <div className="card-header">
                <span className="card-title mono">Actual Sleep</span>
              </div>
              <div className="metric-big mono" style={{ color: "#4f46e5" }}>
                {formatSleepDuration(sleepData.actualSleepMs)}
              </div>
              <div className="metric-desc mono">Net sleep duration</div>
            </div>

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

            <div className="bento-card col-3">
              <div className="card-header">
                <span className="card-title mono">Efficiency</span>
              </div>
              <div className="metric-big mono">
                {sleepData.efficiency}%
              </div>
              <div className="metric-desc mono">Sleep / In-bed ratio</div>
            </div>

            <div className="bento-card col-3">
              <div className="card-header">
                <span className="card-title mono">Awakenings</span>
              </div>
              <div className="metric-big mono" style={{ color: "#d97706" }}>
                {sleepData.interruptions.length}
              </div>
              <div className="metric-desc mono">
                {formatSleepDuration(sleepData.totalAwakeMs)} total awake
              </div>
            </div>

            {/* Sleep Timeline */}
            <div className="bento-card col-12">
              <div className="card-header">
                <span className="card-title mono">Sleep & Awakenings Timeline</span>
                <span className="card-title mono">
                  {formatSleepTime(sleepData.windowStart)} — {formatSleepTime(sleepData.windowEnd)} Window
                </span>
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
          </>
        ) : (
          <div className="bento-card col-12 empty-slot mono" style={{ textAlign: "center", padding: "36px 0" }}>
            <div className="metric-big">No Sleep Session Formed</div>
            <div style={{ color: "var(--text-faint)", marginTop: "8px" }}>
              {excludedIds.length > 0
                ? "All candidate sleep intervals have been excluded below."
                : "No phone lock periods longer than 1 hour detected in this window."}
            </div>
          </div>
        )}

        {/* Candidate Inactivity Gaps List */}
        <div className="bento-card col-12">
          <div className="card-header">
            <span className="card-title mono">Detected Phone Inactivity Gaps</span>
            <span className="card-tag mono">
              {sleepData?.idleChunks?.length || 0} intervals found
            </span>
          </div>

          {!sleepData || sleepData.idleChunks.length === 0 ? (
            <div className="mono" style={{ fontSize: "12px", color: "var(--text-faint)", padding: "16px 0" }}>
              No inactive periods (&gt;15m) recorded in this window.
            </div>
          ) : (
            <div className="candidates-list mono">
              {sleepData.idleChunks.map((chunk) => {
                const isExcluded = excludedIds.includes(chunk.id);
                const isStitched = sleepData.stitchedBlocks?.some((b) => b.id === chunk.id);

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
                        <span className="tag-badge tag-amber">Excluded</span>
                      )}
                    </div>

                    <button
                      onClick={() => toggleExclude(chunk.id)}
                      className={`btn-toggle-candidate mono ${!isExcluded ? 'active' : ''}`}
                    >
                      {isExcluded ? "+ Include" : "✓ Included (Click to Exclude)"}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}