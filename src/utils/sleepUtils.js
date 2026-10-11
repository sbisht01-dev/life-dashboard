// ============================================================================
// SLEEP ENGINE CONFIGURATION
// ============================================================================
export const SLEEP_CONFIG = {
  startHour: 23,       // 11:00 PM
  startMinute: 0,

  endHour: 12,         // 12:00 PM
  endMinute: 0,

  minAnchorHours: 3,   // Minimum locked gap to trigger sleep (1 hour)
  maxWasoMinutes: 25,  // Max interruption between wake-ups to stitch
};

export const analyzeSleepForDate = (events, targetDateStr, excludedIds = []) => {
  // 1. Expand to a full 24-hour tracking window (12:00 PM yesterday to 12:00 PM today)
  const [y, m, d] = targetDateStr.split('-').map(Number);
  
  // End of window: 12:00 PM on the selected dashboard date
  const windowEnd = new Date(y, m - 1, d, 12, 0, 0);
  
  // Start of window: 12:00 PM the previous day
  const windowStart = new Date(windowEnd.getTime() - (24 * 60 * 60 * 1000));

  const windowStartMs = windowStart.getTime();
  const windowEndMs = windowEnd.getTime();

  // 2. Safely parse and filter events within this 24h period
  const validEvents = events
    .map(e => ({ 
      ...e, 
      // Handle different possible backend timestamp formats
      time: new Date(e.timestamp || e.createdAt || e.time).getTime() 
    }))
    .filter(e => e.time >= windowStartMs && e.time <= windowEndMs)
    .sort((a, b) => a.time - b.time);

  // 3. Find ALL gaps > 15 mins throughout the entire day/night
  const idleChunks = [];
  let lastActiveMs = windowStartMs;

  validEvents.forEach(event => {
    const gap = event.time - lastActiveMs;
    if (gap > 120 * 60 * 1000) {
      idleChunks.push({
        id: `gap-${lastActiveMs}`,
        start: lastActiveMs,
        end: event.time,
        durationMs: gap
      });
    }
    lastActiveMs = event.time;
  });
// Sleep trigger when the gap between events is greater than 2 hours (120 minutes).
  const capTime = Math.min(windowEndMs, Date.now());
  const finalGap = capTime - lastActiveMs;
  if (finalGap > 120 * 60 * 1000) {
    idleChunks.push({
      id: `gap-${lastActiveMs}`,
      start: lastActiveMs,
      end: capTime,
      durationMs: finalGap
    });
  }

  // Sort chunks chronologically so they read top-to-bottom in your UI
  idleChunks.sort((a, b) => a.start - b.start);

  // 5. Auto-Select Sleep Blocks (Filtering)
  const candidateChunks = idleChunks.filter(c => !excludedIds.includes(c.id));

  // Next, to prevent a random 20-minute daytime gap from being grouped into your 
  // total sleep, we auto-filter: Only blocks > 45 minutes count as actual sleep.
  let sleepBlocks = candidateChunks.filter(c => c.durationMs >= 45 * 60 * 1000);

  // Fallback: If you had a terrible night and NO block is > 45 mins, 
  // just grab the absolute largest gap you had so the UI doesn't break.
  if (sleepBlocks.length === 0 && candidateChunks.length > 0) {
    const largest = [...candidateChunks].sort((a, b) => b.durationMs - a.durationMs)[0];
    sleepBlocks = [largest];
  }

  // 6. Final Math & Score Packaging
  if (sleepBlocks.length === 0) {
    return {
      hasSleep: false,
      idleChunks, // Still return chunks so they show in the UI list!
      stitchedBlocks: [],
      interruptions: [],
      windowStart: windowStartMs,
      windowEnd: windowEndMs
    };
  }

  const bedTime = sleepBlocks[0].start;
  const wakeTime = sleepBlocks[sleepBlocks.length - 1].end;
  const timeInBedMs = wakeTime - bedTime;

  // Net sleep is the sum of all valid, non-excluded blocks
  const actualSleepMs = sleepBlocks.reduce((sum, b) => sum + b.durationMs, 0);

  // Interruptions are the awake times BETWEEN your sleep blocks
  const interruptions = [];
  for (let i = 0; i < sleepBlocks.length - 1; i++) {
    interruptions.push({
      start: sleepBlocks[i].end,
      end: sleepBlocks[i+1].start,
      durationMs: sleepBlocks[i+1].start - sleepBlocks[i].end
    });
  }

  return {
    hasSleep: true,
    actualSleepMs,
    timeInBedMs,
    bedTime,
    wakeTime,
    windowStart: windowStartMs,
    windowEnd: windowEndMs,
    stitchedBlocks: sleepBlocks,
    interruptions,
    idleChunks // Feeds the UI list
  };
};

// ============================================================================
// SCIENTIFIC SLEEP SCORING ENGINE
// ============================================================================
export const TARGET_BEDTIME_DECIMAL = 23.5; // Target: 11:30 PM

export const calculateScientificScore = (sleepData) => {
  if (!sleepData || !sleepData.hasSleep) return null;

  const reasons = [];

  // 1. Duration Score (40%) - Target: 7.5 hours (27,000,000 ms)
  const targetDuration = 7.5 * 60 * 60 * 1000;
  let durationScore = (sleepData.actualSleepMs / targetDuration) * 100;
  durationScore = Math.min(100, Math.max(0, durationScore));

  if (durationScore < 90) {
    reasons.push("Duration fell short of the 7.5h baseline.");
  }

  // 2. Circadian Rhythm Score (30%) - Target: 11:30 PM (23.5)
  const bedDate = new Date(sleepData.bedTime);
  const bedHour = bedDate.getHours() + (bedDate.getMinutes() / 60);
  
  // Adjust for after-midnight bedtimes (e.g., 2 AM becomes 26)
  const adjustedBedHour = bedHour < 12 ? bedHour + 24 : bedHour;
  const drift = Math.abs(adjustedBedHour - 23.5);
  
  // Deduct 20 points per hour of drift away from 11:30 PM target
  let rhythmScore = 100 - (drift * 20);
  rhythmScore = Math.min(100, Math.max(0, rhythmScore));

  if (drift > 1) {
    reasons.push(`Bedtime shifted ~${Math.round(drift)}h from 11:30 PM target.`);
  }

  // 3. Fragmentation Score (30%) 
  let fragScore = 100; 
  
  if (sleepData.interruptions && sleepData.interruptions.length > 0) {
    const totalAwakeMs = sleepData.interruptions.reduce((sum, int) => sum + int.durationMs, 0);
    
    // Penalize for both the NUMBER of wakeups and the TIME spent awake
    const countPenalty = sleepData.interruptions.length * 5;
    const timePenalty = (totalAwakeMs / 60000) * 1.5; 
    
    fragScore = 100 - (countPenalty + timePenalty);
    reasons.push(`${sleepData.interruptions.length} screen interruptions detected.`);
  }
  
  fragScore = Math.min(100, Math.max(0, fragScore));

  // If sleep was perfect, give a positive reason
  if (reasons.length === 0) {
    reasons.push("Optimal sleep metrics across all pillars.");
  }

  // 4. Final Weighted Composite
  const composite = (durationScore * 0.40) + (rhythmScore * 0.30) + (fragScore * 0.30);

  return {
    composite: Math.round(composite),
    duration: Math.round(durationScore),
    rhythm: Math.round(rhythmScore),
    fragmentation: Math.round(fragScore),
    reasons // Re-added the reasons array to stop the .map() crash
  };
};

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