import React, { useMemo } from 'react';
import { 
  analyzeSleepForDate, 
  calculateScientificScore, 
  formatSleepTime, 
  formatSleepDuration 
} from '../utils/sleepUtils';
import './SleepCard.css';

// ------------------------------------------------------------------
// Compact SVG Dual-Clock Component for Bento Card
// ------------------------------------------------------------------
const SleepClockRing = ({ chunks, type, selectedDate }) => {
  const radius = 40;
  const circumference = 2 * Math.PI * radius;

  const midnightMs = new Date(`${selectedDate}T00:00:00`).getTime();
  const twelveHoursMs = 12 * 60 * 60 * 1000;
  const clockStart = type === 'AM' ? midnightMs : midnightMs + twelveHoursMs;
  const clockEnd = clockStart + twelveHoursMs;

  const clockChunks = chunks.map(c => {
    const start = Math.max(c.start, clockStart);
    const end = Math.min(c.end, clockEnd);
    if (end > start) {
      return { ...c, start, end };
    }
    return null;
  }).filter(Boolean);

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', margin: '0 auto' }}>
      <svg viewBox="0 0 100 100" style={{ transform: 'rotate(-90deg)', width: '100%', height: '100%', overflow: 'visible' }}>
        <circle cx="50" cy="50" r={radius} fill="none" stroke="var(--border-subtle)" strokeWidth="6" opacity="0.5" />

        {[...Array(12)].map((_, i) => {
          const angle = i * 30; 
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

        {clockChunks.map((c, idx) => {
          const startPercent = (c.start - clockStart) / twelveHoursMs;
          const durationPercent = (c.end - c.start) / twelveHoursMs;

          const length = Math.max(durationPercent * circumference, 0.8);
          const offset = -(startPercent * circumference);
          const strokeColor = c.type === 'sleep' ? "var(--accent-primary)" : "var(--accent-amber)";

          return (
            <circle
              key={`${c.id}-${type}-${idx}`}
              cx="50" cy="50" r={radius}
              fill="none"
              stroke={strokeColor}
              strokeWidth="6"
              strokeDasharray={`${length} ${circumference}`}
              strokeDashoffset={offset}
            />
          );
        })}
      </svg>

      <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column' }}>
        <span className="mono" style={{ fontSize: '16px', fontWeight: 'bold', color: 'var(--text-main)' }}>{type}</span>
        <span className="mono" style={{ fontSize: '9px', color: 'var(--text-faint)' }}>
          {type === 'AM' ? '00-12' : '12-24'}
        </span>
      </div>
    </div>
  );
};

export default function SleepCard({ events, loading, onOpen, targetDate }) {
  const { sleepData, scoreData } = useMemo(() => {
    if (!targetDate || !events || events.length === 0) {
      return { sleepData: null, scoreData: null };
    }
    const savedExcludes = JSON.parse(localStorage.getItem(`sleep_exclude_${targetDate}`) || "[]");
    const baseData = analyzeSleepForDate(events, targetDate, savedExcludes);
    const scientific = calculateScientificScore(baseData);
    return { sleepData: baseData, scoreData: scientific };
  }, [events, targetDate]);

  // Generate chunks for the clock rings instead of the linear timeline
  const rawClockChunks = useMemo(() => {
    if (!sleepData || !sleepData.hasSleep) return [];
    const chunks = [];
    for (const block of sleepData.stitchedBlocks) {
      chunks.push({ id: block.id, start: block.start, end: block.end, type: 'sleep' });
    }
    for (const awake of sleepData.interruptions) {
      chunks.push({ id: `${awake.start}-${awake.end}`, start: awake.start, end: awake.end, type: 'awake' });
    }
    return chunks;
  }, [sleepData]);

  const getScoreTheme = (score) => {
    if (score >= 85) return { color: "var(--accent-emerald)", bg: "rgba(16, 185, 129, 0.12)", border: "rgba(16, 185, 129, 0.3)" };
    if (score >= 70) return { color: "var(--accent-primary)", bg: "var(--accent-primary-bg)", border: "rgba(139, 92, 246, 0.3)" };
    return { color: "var(--accent-amber)", bg: "rgba(245, 158, 11, 0.12)", border: "rgba(245, 158, 11, 0.3)" };
  };

  const scoreTheme = scoreData ? getScoreTheme(scoreData.composite) : null;

  return (
    <div className="bento-card col-4 clickable-card" onClick={onOpen}>
      <div className="card-header">
        <span className="card-title mono">Sleep Telemetry</span>
        <span className="card-link-badge mono">Full View →</span>
      </div>

      {loading ? (
        <>
          <div className="sleep-metric-row">
            <div>
              <div className="skeleton" style={{ width: '130px', height: '36px', borderRadius: '8px', marginBottom: '8px' }}></div>
              <div className="skeleton" style={{ width: '100px', height: '14px', borderRadius: '4px' }}></div>
            </div>
            <div>
              <div className="skeleton" style={{ width: '80px', height: '24px', borderRadius: '12px' }}></div>
            </div>
          </div>

          {/* Clock Ring Skeletons */}
          <div style={{ display: 'flex', justifyContent: 'space-around', margin: '24px 0 16px 0' }}>
            <div className="skeleton" style={{ width: '100px', height: '100px', borderRadius: '50%' }}></div>
            <div className="skeleton" style={{ width: '100px', height: '100px', borderRadius: '50%' }}></div>
          </div>

          <div className="sleep-highlights mono" style={{ display: 'flex', gap: '8px', marginTop: 'auto' }}>
            <div className="skeleton" style={{ flex: 1, height: '42px', borderRadius: '8px' }}></div>
            <div className="skeleton" style={{ flex: 1, height: '42px', borderRadius: '8px' }}></div>
          </div>
        </>
      ) : !sleepData || !sleepData.hasSleep ? (
        <div className="empty-content mono" style={{ margin: "auto 0", padding: "16px 0" }}>
          <div className="metric-big mono">--</div>
          <div className="sleep-metric-sub">
            No sleep block recorded for {targetDate}
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
              <div className="score-badge-wrapper" onClick={(e) => e.stopPropagation()}>
                <span 
                  className="badge mono" 
                  style={{ 
                    backgroundColor: scoreTheme.bg, 
                    color: scoreTheme.color, 
                    borderColor: scoreTheme.border 
                  }}
                >
                  <span className="badge-dot" style={{ backgroundColor: scoreTheme.color }}></span>
                  {scoreData.composite} Score
                </span>
                
                <div className="score-tooltip mono">
                  <div className="tooltip-title">Score Drivers</div>
                  {scoreData.reasons.map((reason, idx) => (
                    <div key={idx} className="tooltip-reason">{reason}</div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* New Dual-Clock Layout */}
          <div style={{ display: 'flex', justifyContent: 'space-around', alignItems: 'center', margin: '24px 0 16px 0' }}>
            <div style={{ width: '100px', height: '100px' }}>
              <SleepClockRing chunks={rawClockChunks} type="AM" selectedDate={targetDate} />
            </div>
            <div style={{ width: '100px', height: '100px' }}>
              <SleepClockRing chunks={rawClockChunks} type="PM" selectedDate={targetDate} />
            </div>
          </div>

          <div className="sleep-highlights mono" style={{ marginTop: 'auto' }}>
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