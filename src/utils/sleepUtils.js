export function analyzeSleepForDate(events, targetDateStr, customExcludedIds = []) {
  if (!events || events.length === 0) return null;

  // Window: 20:00 (8 PM) of previous day to 14:00 (2 PM) of target day
  const targetDate = new Date(`${targetDateStr}T00:00:00`);
  const prevDate = new Date(targetDate);
  prevDate.setDate(prevDate.getDate() - 1);
  const prevDateStr = prevDate.toISOString().split('T')[0];

  const windowStart = new Date(`${prevDateStr}T23:00:00`).getTime();
  const windowEnd = new Date(`${targetDateStr}T11:00:00`).getTime();

  // Sort events chronologically
  const sorted = [...events]
    .filter((e) => e.createdAt)
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

  // 1. Identify all locked idle intervals (Lock -> Unlock)
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

        // Filter out tiny phone slips (< 15 mins)
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

  if (idleChunks.length === 0) return null;

  // 2. Filter out any manually excluded candidate chunks
  const eligibleChunks = idleChunks.filter((c) => !customExcludedIds.includes(c.id));
  if (eligibleChunks.length === 0) return null;

  // 3. Find primary anchor sleep block (longest gap >= 2 hours)
  const sortedByDuration = [...eligibleChunks].sort((a, b) => b.durationMs - a.durationMs);
  const primaryAnchor = sortedByDuration[0];

  if (primaryAnchor.durationMs < 2 * 60 * 60 * 1000) {
    // No substantial sleep block found
    return {
      hasSleep: false,
      idleChunks,
    };
  }

  // 4. Stitch forward and backward for night awakenings (WASO <= 30 min)
  eligibleChunks.sort((a, b) => a.start - b.start);
  const anchorIdx = eligibleChunks.findIndex((c) => c.id === primaryAnchor.id);

  const stitchedBlocks = [eligibleChunks[anchorIdx]];

  // Stitch backward (e.g. went to bed earlier, woke up briefly)
  for (let i = anchorIdx - 1; i >= 0; i--) {
    const curr = eligibleChunks[i];
    const next = stitchedBlocks[0];
    const awakeTime = next.start - curr.end;

    if (awakeTime <= 30 * 60 * 1000 && curr.durationMs >= 45 * 60 * 1000) {
      stitchedBlocks.unshift(curr);
    } else {
      break;
    }
  }

  // Stitch forward (e.g. woke up at 7am for 5 mins, slept till 10am)
  for (let i = anchorIdx + 1; i < eligibleChunks.length; i++) {
    const curr = eligibleChunks[i];
    const prev = stitchedBlocks[stitchedBlocks.length - 1];
    const awakeTime = curr.start - prev.end;

    if (awakeTime <= 30 * 60 * 1000 && curr.durationMs >= 45 * 60 * 1000) {
      stitchedBlocks.push(curr);
    } else {
      break;
    }
  }

  // 5. Aggregate sleep metrics
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
    idleChunks, // All detected gaps so user can toggle them
    windowStart,
    windowEnd,
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