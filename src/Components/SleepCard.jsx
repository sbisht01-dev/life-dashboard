import { useMemo } from 'react';
import { analyzeSleepForDate, formatSleepTime, formatSleepDuration } from '../utils/sleepUtils';
import './SleepCard.css';

export default function SleepCard({ events, loading, onOpen }) {
  const todayStr = new Date().toISOString().split('T')[0];

  const sleepData = useMemo(() => {
    // Load any user overrides stored in localStorage
    const savedExcludes = JSON.parse(localStorage.getItem(`sleep_exclude_${todayStr}`) || "[]");
    return analyzeSleepForDate(events, todayStr, savedExcludes);
  }, [events, todayStr]);

  // Mini timeline calculations
  const timelineChunks = useMemo(() => {
    if (!sleepData || !sleepData.hasSleep) return [];

    const span = Math.max(sleepData.timeInBedMs, 1);

    const chunks = [];
    for (const block of sleepData.stitchedBlocks) {
      const left = ((block.start - sleepData.bedTime) / span) * 100;
      const width = (block.durationMs / span) * 100;
      chunks.push({ left, width, type: 'sleep' });
    }

    for (const awake of sleepData.interruptions) {
      const left = ((awake.start - sleepData.bedTime) / span) * 100;
      const width = (awake.durationMs / span) * 100;
      chunks.push({ left, width, type: 'awake' });
    }

    return chunks;
  }, [sleepData]);

  return (
    <div className="bento-card col-4 clickable-card" onClick={onOpen}>
      <div className="card-header">
        <span className="card-title mono">Sleep Telemetry</span>
        <span className="card-link-badge mono">Full View →</span>
      </div>

      {!sleepData || !sleepData.hasSleep ? (
        <div className="empty-content mono" style={{ margin: "auto 0", padding: "16px 0" }}>
          <div className="metric-big mono">--</div>
          <div className="sleep-metric-sub">
            {loading ? "Calculating sleep..." : "No sleep block recorded last night"}
          </div>
        </div>
      ) : (
        <>
          <div className="sleep-metric-row">
            <div>
              <div className="sleep-metric-big mono">
                {formatSleepDuration(sleepData.actualSleepMs)}
              </div>
              <div className="sleep-metric-sub mono">
                {formatSleepTime(sleepData.bedTime)} → {formatSleepTime(sleepData.wakeTime)}
              </div>
            </div>
            <div>
              <span className="badge badge-indigo mono">
                <span className="badge-dot-indigo"></span>
                {sleepData.efficiency}% Eff.
              </span>
            </div>
          </div>

          {/* Mini Visual Distribution */}
          <div className="sleep-track-container">
            <div className="sleep-track-labels mono">
              <span>{formatSleepTime(sleepData.bedTime)}</span>
              <span>{formatSleepTime(sleepData.wakeTime)}</span>
            </div>
            <div className="sleep-track">
              {timelineChunks.map((chunk, idx) => (
                <div
                  key={idx}
                  className={chunk.type === 'sleep' ? 'sleep-chunk' : 'sleep-awake-chunk'}
                  style={{ left: `${chunk.left}%`, width: `${Math.max(chunk.width, 1)}%` }}
                />
              ))}
            </div>
          </div>

          {/* Quick Highlight Metrics */}
          <div className="sleep-highlights mono">
            <div className="sleep-highlight-item">
              <span className="sleep-highlight-label">In Bed</span>
              <span className="sleep-highlight-val">
                {formatSleepDuration(sleepData.timeInBedMs)}
              </span>
            </div>
            <div className="sleep-highlight-item">
              <span className="sleep-highlight-label">Awakenings</span>
              <span className="sleep-highlight-val">
                {sleepData.interruptions.length > 0
                  ? `${sleepData.interruptions.length} (${formatSleepDuration(sleepData.totalAwakeMs)})`
                  : "None"}
              </span>
            </div>
          </div>
        </>
      )}
    </div>
  );
}