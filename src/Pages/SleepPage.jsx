import { useState, useEffect, useMemo } from 'react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { auth, db } from '../utils/firebase';
import SleepReportModal from '../Components/SleepReportModal';

import {
  analyzeSleepForDate,
  calculateScientificScore,
  formatSleepTime,
  formatSleepDuration
} from '../utils/sleepUtils';
import './SleepPage.css';

const getLocalDateString = () => {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

// ... [Keep your exact SleepClockRing Component here, it does not change] ...
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
  const [dbLoading, setDbLoading] = useState(false);
  const todayStr = getLocalDateString();
  const [showReport, setShowReport] = useState(false);

  // 1. Fetch from Firebase instead of LocalStorage
  useEffect(() => {
    const fetchExclusions = async () => {
      const user = auth.currentUser;
      if (!user) return;

      setDbLoading(true);
      try {
        const docRef = doc(db, 'users', user.uid, 'sleep_exclusions', selectedDate);
        const docSnap = await getDoc(docRef);

        if (docSnap.exists() && docSnap.data().excludedIds) {
          setExcludedIds(docSnap.data().excludedIds);
        } else {
          setExcludedIds([]);
        }
      } catch (err) {
        console.error("Failed to fetch exclusions:", err);
      } finally {
        setDbLoading(false);
      }
    };

    fetchExclusions();
  }, [selectedDate]);

  const toggleExclude = async (id) => {
    const user = auth.currentUser;
    if (!user) {
      alert("Error: No user detected by Firebase!");
      return;
    }

    const next = excludedIds.includes(id)
      ? excludedIds.filter((item) => item !== id)
      : [...excludedIds, id];

    // Optimistic UI update
    setExcludedIds(next);

    // Loud background save
    try {
      console.log(`Saving to: users/${user.uid}/sleep_exclusions/${selectedDate}`);
      const docRef = doc(db, 'users', user.uid, 'sleep_exclusions', selectedDate);
      await setDoc(docRef, { excludedIds: next }, { merge: true });
      console.log("Save successful!");
    } catch (err) {
      console.error("Firestore Save Error:", err);
      alert(`Database Error: ${err.message}. Check your Firestore Rules!`);
    }
  };

  // 3. Write to Firebase when resetting
  const resetAllExcludes = async () => {
    const user = auth.currentUser;
    if (!user) return;

    setExcludedIds([]);

    try {
      const docRef = doc(db, 'users', user.uid, 'sleep_exclusions', selectedDate);
      await setDoc(docRef, { excludedIds: [] }, { merge: true });
    } catch (err) {
      console.error("Failed to clear exclusions in cloud:", err);
    }
  };

  const shiftDate = (daysOffset) => {
    const [y, m, d] = selectedDate.split('-').map(Number);
    const nextDate = new Date(y, m - 1, d + daysOffset);
    const year = nextDate.getFullYear();
    const month = String(nextDate.getMonth() + 1).padStart(2, '0');
    const day = String(nextDate.getDate()).padStart(2, '0');
    setSelectedDate(`${year}-${month}-${day}`);
  };

  const { sleepData, scoreData } = useMemo(() => {
    const base = analyzeSleepForDate(events, selectedDate, excludedIds);
    const score = calculateScientificScore(base);
    return { sleepData: base, scoreData: score };
  }, [events, selectedDate, excludedIds]);

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

  // Combine both loading states for the UI
  const isDataLoading = loading || dbLoading;

  return (
    <div className="app-container">
   <header className="app-header">
        <button onClick={onBack} className="back-btn mono">← Back to Bento Grid</button>
        
        {/* Wrap the right-side buttons in a flex container so they align together */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button onClick={() => setShowReport(true)} className="btn-pill mono">
            Report
          </button>
          <button onClick={onSync} disabled={isDataLoading} className="btn-pill mono">
            {isDataLoading ? "Syncing..." : "Sync Events"}
          </button>
        </div>
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
        <div className="bento-card col-4">
          <div className="card-header"><span className="card-title mono">Actual Sleep</span></div>
          {isDataLoading ? (
            <div className="skeleton" style={{ width: '130px', height: '36px', borderRadius: '8px' }}></div>
          ) : (
            <div className="metric-big mono">{sleepData?.hasSleep ? formatSleepDuration(sleepData.actualSleepMs) : "--"}</div>
          )}
          <div className="metric-desc mono">Net sleep duration</div>
        </div>

        <div className="bento-card col-4">
          <div className="card-header"><span className="card-title mono">Time in Bed</span></div>
          {isDataLoading ? (
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
          {isDataLoading ? (
            <div className="skeleton" style={{ width: '90px', height: '36px', borderRadius: '8px' }}></div>
          ) : (
            <div className="metric-big mono" style={{ color: "var(--accent-primary)" }}>
              {scoreData ? `${scoreData.composite}/100` : "--"}
            </div>
          )}
          <div className="metric-desc mono">Weighted 3-pillar composite</div>
        </div>

        {!isDataLoading && scoreData && (
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

        <div className="bento-card col-12">
          <div className="card-header">
            <span className="card-title mono">Sleep Cycle Distribution</span>
            <span className="card-title mono">
              {sleepData?.hasSleep ? `${formatSleepTime(sleepData.windowStart)} — ${formatSleepTime(sleepData.windowEnd)} Window` : "Empty"}
            </span>
          </div>

          {isDataLoading ? (
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
              {isDataLoading ? (
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
      {showReport && (
        <SleepReportModal 
          events={events} 
          onClose={() => setShowReport(false)} 
        />
      )}
    </div>
  );
}