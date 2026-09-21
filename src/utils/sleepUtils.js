// ============================================================================
// SLEEP ENGINE CONFIGURATION
// ============================================================================
export const SLEEP_CONFIG = {
  startHour: 22,       // 10:00 PM
  startMinute: 0,

  endHour: 12,         // 12:00 PM
  endMinute: 0,

  minAnchorHours: 1,   // Minimum locked gap to trigger sleep (1 hour)
  maxWasoMinutes: 25,  // Max interruption between wake-ups to stitch
};

export function analyzeSleepForDate(events, targetDateStr, customExcludedIds = []) {
  if (!events || events.length === 0) return null;

  // 1. Parse target day
  const [year, month, day] = targetDateStr.split('-').map(Number);
  const targetDate = new Date(year, month - 1, day);
  const prevDate = new Date(year, month - 1, day - 1);

  // 2. Automatic window detection
  const isOvernight = SLEEP_CONFIG.startHour > SLEEP_CONFIG.endHour;
  const startDate = isOvernight ? prevDate : targetDate;
  const endDate = targetDate;

  const windowStart = new Date(
    startDate.getFullYear(),
    startDate.getMonth(),
    startDate.getDate(),
    SLEEP_CONFIG.startHour,
    SLEEP_CONFIG.startMinute,
    0
  ).getTime();

  const windowEnd = new Date(
    endDate.getFullYear(),
    endDate.getMonth(),
    endDate.getDate(),
    SLEEP_CONFIG.endHour,
    SLEEP_CONFIG.endMinute,
    0
  ).getTime();

  // 3. Chronological sort
  const sorted = [...events]
    .filter((e) => e.createdAt)
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

  // 4. Extract locked intervals inside this exact window
  const idleChunks = [];
  let pendingLock = null;

  for (const ev of sorted) {
    const time = new Date(ev.createdAt).getTime();
    const clean = (ev.event || "").replace(/[\[\]]/g, "").trim().toLowerCase();

    if (clean === "device locked") {
      pendingLock = time;
    } else if (clean === "device unlocked" && pendingLock) {
      if (pendingLock < windowEnd && time > windowStart) {
        const start = Math.max(pendingLock, windowStart);
        const end = Math.min(time, windowEnd);
        const durationMs = end - start;

        // Keep intervals >= 15 minutes
        if (durationMs >= 15 * 60 * 1000) {
          idleChunks.push({
            id: `${start}-${end}`,
            start,
            end,
            durationMs,
            rawStart: pendingLock,
            rawEnd: time,
          });
        }
      }
      pendingLock = null;
    }
  }

  const emptyResult = {
    hasSleep: false,
    idleChunks,
    stitchedBlocks: [],
    interruptions: [],
    windowStart,
    windowEnd,
  };

  if (idleChunks.length === 0) return emptyResult;

  // 5. Filter out excluded gaps
  const eligibleChunks = idleChunks.filter((c) => !customExcludedIds.includes(c.id));
  if (eligibleChunks.length === 0) return emptyResult;

  // 6. Anchor block (longest gap >= minAnchorHours)
  const sortedByDuration = [...eligibleChunks].sort((a, b) => b.durationMs - a.durationMs);
  const primaryAnchor = sortedByDuration[0];

  const minAnchorMs = SLEEP_CONFIG.minAnchorHours * 60 * 60 * 1000;
  if (primaryAnchor.durationMs < minAnchorMs) return emptyResult;

  // 7. Stitch WASO gaps forward and backward
  eligibleChunks.sort((a, b) => a.start - b.start);
  const anchorIdx = eligibleChunks.findIndex((c) => c.id === primaryAnchor.id);
  const stitchedBlocks = [eligibleChunks[anchorIdx]];
  const maxWasoMs = SLEEP_CONFIG.maxWasoMinutes * 60 * 1000;

  for (let i = anchorIdx - 1; i >= 0; i--) {
    const curr = eligibleChunks[i];
    const next = stitchedBlocks[0];
    const awakeTime = next.start - curr.end;

    if (awakeTime <= maxWasoMs && curr.durationMs >= 45 * 60 * 1000) {
      stitchedBlocks.unshift(curr);
    } else {
      break;
    }
  }

  for (let i = anchorIdx + 1; i < eligibleChunks.length; i++) {
    const curr = eligibleChunks[i];
    const prev = stitchedBlocks[stitchedBlocks.length - 1];
    const awakeTime = curr.start - prev.end;

    if (awakeTime <= maxWasoMs && curr.durationMs >= 45 * 60 * 1000) {
      stitchedBlocks.push(curr);
    } else {
      break;
    }
  }

  // 8. Calculate sleep metrics
  const bedTime = stitchedBlocks[0].start;
  const wakeTime = stitchedBlocks[stitchedBlocks.length - 1].end;
  const timeInBedMs = wakeTime - bedTime;

  let totalAwakeMs = 0;
  let interruptions = [];

  for (let i = 0; i < stitchedBlocks.length - 1; i++) {
    const awakeStart = stitchedBlocks[i].end;
    const awakeEnd = stitchedBlocks[i + 1].start;
    const duration = awakeEnd - awakeStart;
    totalAwakeMs += duration;
    interruptions.push({
      start: awakeStart,
      end: awakeEnd,
      durationMs: duration,
    });
  }

  const actualSleepMs = Math.max(timeInBedMs - totalAwakeMs, 0);
  const efficiency = timeInBedMs > 0 ? Math.round((actualSleepMs / timeInBedMs) * 100) : 0;

  return {
    hasSleep: true,
    bedTime,
    wakeTime,
    timeInBedMs,
    actualSleepMs,
    totalAwakeMs,
    efficiency,
    interruptions,
    stitchedBlocks,
    idleChunks,
    windowStart,
    windowEnd,
  };
}

// ============================================================================
// SCIENTIFIC SLEEP SCORING ENGINE
// ============================================================================
export const TARGET_BEDTIME_DECIMAL = 23.5; // Target: 11:30 PM

export function calculateScientificScore(sleepData) {
  if (!sleepData || !sleepData.hasSleep) return null;

  // 1. Duration Adequacy (40%)
  const sleepHours = sleepData.actualSleepMs / (1000 * 60 * 60);
  let durationScore = 100;
  if (sleepHours < 7.5) {
    // Sharp drop-off if under 7.5 hours
    durationScore = Math.max(0, (sleepHours / 7.5) * 100);
  } else if (sleepHours > 9.0) {
    // Penalty for oversleeping (oversleeping leads to sleep inertia)
    durationScore = Math.max(0, 100 - ((sleepHours - 9.0) * 20));
  }

  // 2. Circadian Consistency & Drift (30%)
  const bedDate = new Date(sleepData.bedTime);
  const bedHour = bedDate.getHours() + (bedDate.getMinutes() / 60);

  // Calculate circular distance across midnight
  let hourDiff = Math.abs(bedHour - TARGET_BEDTIME_DECIMAL);
  if (hourDiff > 12) hourDiff = 24 - hourDiff;

  // 20 points penalty per hour off-schedule
  const rhythmScore = Math.max(0, 100 - (hourDiff * 20));

  // 3. Sleep Fragmentation (30%)
  const fragScore = sleepData.efficiency;

  // Composite Weighted Sum
  const compositeScore = Math.round(
    (durationScore * 0.40) + (rhythmScore * 0.30) + (fragScore * 0.30)
  );

  // Diagnostic Insights
  const reasons = [];
  if (durationScore < 85) {
    reasons.push(sleepHours < 7 ? `Short sleep (${sleepHours.toFixed(1)}h)` : "Overslept baseline");
  }
  if (rhythmScore < 85) {
    reasons.push(`Circadian drift (${hourDiff.toFixed(1)}h off target)`);
  }
  if (fragScore < 90) {
    reasons.push(`Phone fragmentation (${sleepData.interruptions.length} awakenings)`);
  }
  if (reasons.length === 0) {
    reasons.push("Optimal circadian restoration");
  }

  return {
    composite: Math.min(Math.max(compositeScore, 0), 100),
    duration: Math.round(durationScore),
    rhythm: Math.round(rhythmScore),
    fragmentation: Math.round(fragScore),
    reasons,
  };
}

export function formatSleepTime(timestamp) {
  if (!timestamp) return "—";
  return new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function formatSleepDuration(ms) {
  const totalSecs = Math.floor(ms / 1000);
  const hours = Math.floor(totalSecs / 3600);
  const mins = Math.floor((totalSecs % 3600) / 60);
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}