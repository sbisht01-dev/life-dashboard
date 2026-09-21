import React, { useState, useEffect, useMemo } from 'react';
import { 
  analyzeSleepForDate, 
  calculateScientificScore,
  formatSleepTime, 
  formatSleepDuration 
} from '../utils/sleepUtils';
import './SleepPage.css';

// Strict local date helper (avoids UTC timezone shift)
const getLocalDateString = () => {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

// ------------------------------------------------------------------
// SVG Dual-Clock Component (Optimized for Sleep Sessions)
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
    <div style={{ position: 'relative', width: '160px', height: '160px', margin: '0 auto' }}>
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
        <span className="mono" style={{ fontSize: '20px', fontWeight: 'bold', color: 'var(--text-main)' }}>{type}</span>
        <span className="mono" style={{ fontSize: '10px', color: 'var(--text-faint)' }}>
          {type === 'AM' ? '00:00-11:59' : '12:00-23:59'}
        </span>
      </div>
    </div>
  );
};

export default function SleepPage({ events, loading, onSync, onBack }) {
  const [selectedDate, setSelectedDate] = useState(getLocalDateString);
  const [excludedIds, setExcludedIds] = useState([]);
  const todayStr = getLocalDateString();

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

  const shiftDate = (daysOffset) => {
    const [y, m, d] = selectedDate.split('-').map(Number);
    const nextDate = new Date(y, m - 1, d + daysOffset);
    const year = nextDate.getFullYear();
    const month = String(nextDate.getMonth() + 1).padStart(2, '0');
    const day = String(nextDate.getDate()).padStart(2, '0');
    setSelectedDate(`${year}-${month}-${day}`);
  };

  // Generate Base Sleep Data & Scientific Score
  const { sleepData, scoreData } = useMemo(() => {
    const base = analyzeSleepForDate(events, selectedDate, excludedIds);
    const score = calculateScientificScore(base);
    return { sleepData: base, scoreData: score };
  }, [events, selectedDate, excludedIds]);

  // Generate chunks for the clock rings
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

  return (
    <div className="app-container">
      <header className="app-header">
        <button onClick={onBack} className="back-btn mono">← Back to Bento Grid</button>
        <button onClick={onSync} disabled={loading} className="btn-pill mono">
          {loading ? "Syncing..." : "Sync Events"}
        </button>
      </header>

      <section className="filter-bar mono">
        <div className="filter-inputs">
          <label style={{ color: "var(--text-muted)" }}>Target Morning</label>
          <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
            <button onClick={() => shiftDate(-1)} className="btn-pill" style={{ padding: "4px 8px", minWidth: "auto" }}>◀</button>
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
            >▶</button>
          </div>
        </div>

        {excludedIds.length > 0 && (
          <button onClick={resetAllExcludes} className="btn-pill mono" style={{ color: "var(--accent-amber)" }}>
            ↺ Reset Excluded Gaps ({excludedIds.length})
          </button>
        )}
      </section>

      <div className="bento-grid">
        
        {/* TOP ROW: Core Metrics */}
        <div className="bento-card col-4">
          <div className="card-header"><span className="card-title mono">Actual Sleep</span></div>
          {loading ? (
            <div className="skeleton" style={{ width: '130px', height: '36px', borderRadius: '8px' }}></div>
          ) : (
            <div className="metric-big mono">{sleepData?.hasSleep ? formatSleepDuration(sleepData.actualSleepMs) : "--"}</div>
          )}
          <div className="metric-desc mono">Net sleep duration</div>
        </div>

        <div className="bento-card col-4">
          <div className="card-header"><span className="card-title mono">Time in Bed</span></div>
          {loading ? (
            <div className="skeleton" style={{ width: '130px', height: '36px', borderRadius: '8px' }}></div>
          ) : (
            <div className="metric-big mono">{sleepData?.hasSleep ? formatSleepDuration(sleepData.timeInBedMs) : "--"}</div>
          )}
          <div className="metric-desc mono">
            {sleepData?.hasSleep ? `${formatSleepTime(sleepData.bedTime)} → ${formatSleepTime(sleepData.wakeTime)}` : "No session recorded"}
          </div>
        </div>

        <div className="bento-card col-4">
          <div className="card-header"><span className="card-title mono">Scientific Score</span></div>
          {loading ? (
            <div className="skeleton" style={{ width: '90px', height: '36px', borderRadius: '8px' }}></div>
          ) : (
            <div className="metric-big mono" style={{ color: "var(--accent-primary)" }}>
              {scoreData ? `${scoreData.composite}/100` : "--"}
            </div>
          )}
          <div className="metric-desc mono">Weighted 3-pillar composite</div>
        </div>

        {/* MIDDLE ROW: The 3 Scientific Pillars */}
        {!loading && scoreData && (
          <>
            <div className="bento-card col-4">
              <div className="card-header"><span className="card-title mono">Duration (40%)</span></div>
              <div className="metric-big mono" style={{ color: scoreData.duration >= 85 ? 'var(--accent-emerald)' : 'var(--text-main)' }}>
                {scoreData.duration}/100
              </div>
              <div className="metric-desc mono">Target baseline: 7.5h - 8.5h</div>
            </div>

            <div className="bento-card col-4">
              <div className="card-header"><span className="card-title mono">Circadian Rhythm (30%)</span></div>
              <div className="metric-big mono" style={{ color: scoreData.rhythm >= 85 ? 'var(--accent-emerald)' : 'var(--text-main)' }}>
                {scoreData.rhythm}/100
              </div>
              <div className="metric-desc mono">Target: 11:30 PM bedtime</div>
            </div>

            <div className="bento-card col-4">
              <div className="card-header"><span className="card-title mono">Fragmentation (30%)</span></div>
              <div className="metric-big mono" style={{ color: scoreData.fragmentation >= 85 ? 'var(--accent-emerald)' : 'var(--text-main)' }}>
                {scoreData.fragmentation}/100
              </div>
              <div className="metric-desc mono">{sleepData.interruptions.length} interruptions recorded</div>
            </div>
          </>
        )}

        {/* CLOCK RINGS: Sleep Cycle Distribution */}
        <div className="bento-card col-12">
          <div className="card-header">
            <span className="card-title mono">Sleep Cycle Distribution</span>
            <span className="card-title mono">
              {sleepData?.hasSleep ? `${formatSleepTime(sleepData.windowStart)} — ${formatSleepTime(sleepData.windowEnd)} Window` : "Empty"}
            </span>
          </div>

          {loading ? (
            <div style={{ display: 'flex', justifyContent: 'space-around', padding: '36px 0' }}>
              <div className="skeleton" style={{ width: '160px', height: '160px', borderRadius: '50%' }}></div>
              <div className="skeleton" style={{ width: '160px', height: '160px', borderRadius: '50%' }}></div>
            </div>
          ) : !sleepData?.hasSleep ? (
            <div className="mono" style={{ textAlign: "center", padding: "36px 0", color: "var(--text-faint)" }}>
              <div className="metric-big">No Sleep Session Formed</div>
              <div style={{ marginTop: "8px" }}>
                {excludedIds.length > 0
                  ? "All candidate sleep intervals have been excluded below."
                  : "No phone lock periods longer than 1 hour detected in this window."}
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', justifyContent: 'space-around', alignItems: 'center', padding: '36px 0', flexWrap: 'wrap', gap: '32px' }}>
              <SleepClockRing chunks={rawClockChunks} type="AM" selectedDate={selectedDate} />
              <SleepClockRing chunks={rawClockChunks} type="PM" selectedDate={selectedDate} />
            </div>
          )}
        </div>

        {/* BOTTOM: Candidate Inactivity Gaps List */}
        <div className="bento-card col-12">
          <div className="card-header">
            <span className="card-title mono">Detected Phone Inactivity Gaps</span>
            <span className="card-tag mono">{sleepData?.idleChunks?.length || 0} intervals found</span>
          </div>

          {!sleepData || sleepData.idleChunks.length === 0 ? (
            <div className="mono" style={{ fontSize: "12px", color: "var(--text-faint)", padding: "16px 0" }}>
              No inactive periods (&gt;15m) recorded in this window.
            </div>
          ) : (
            <div className="candidates-list mono">
              {loading ? (
                [...Array(3)].map((_, idx) => (
                  <div key={idx} className="candidate-item skeleton" style={{ height: '44px', border: 'none' }}></div>
                ))
              ) : (
                sleepData.idleChunks.map((chunk) => {
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
                })
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}