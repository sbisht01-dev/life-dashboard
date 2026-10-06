import React, { useState, useMemo } from 'react';
import { analyzeSleepForDate, calculateScientificScore, formatSleepDuration, formatSleepTime } from '../utils/sleepUtils';
import './SleepReportModal.css';

const getPastDateString = (daysAgo) => {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export default function SleepReportModal({ events, onClose }) {
  const [timeframe, setTimeframe] = useState('week'); 

  const { stats, history, insights } = useMemo(() => {
    const daysToAnalyze = timeframe === 'today' ? 1 : timeframe === 'week' ? 7 : 30;
    const pastDays = [];
    
    let totalScore = 0;
    let totalDuration = 0;
    let totalInterruptions = 0;
    let validDays = 0;
    
    let earliestBedtime = Infinity;
    let latestBedtime = 0;

    for (let i = 0; i < daysToAnalyze; i++) {
      const dateStr = getPastDateString(i);
      const sleepData = analyzeSleepForDate(events, dateStr, []); 
      
      if (sleepData.hasSleep) {
        // Ignore bad data (massive defaults)
        if (sleepData.actualSleepMs > 14 * 60 * 60 * 1000) {
          continue; 
        }

        const scoreData = calculateScientificScore(sleepData);
        totalScore += scoreData.composite;
        totalDuration += sleepData.actualSleepMs;
        totalInterruptions += sleepData.interruptions.length;
        
        const bedTimeHour = new Date(sleepData.bedTime).getHours() + (new Date(sleepData.bedTime).getMinutes() / 60);
        const adjustedBedTime = bedTimeHour < 12 ? bedTimeHour + 24 : bedTimeHour;
        
        earliestBedtime = Math.min(earliestBedtime, adjustedBedTime);
        latestBedtime = Math.max(latestBedtime, adjustedBedTime);

        validDays++;
        pastDays.push(sleepData);
      }
    }

    const avgDurationMs = validDays > 0 ? totalDuration / validDays : 0;
    const avgScore = validDays > 0 ? Math.round(totalScore / validDays) : 0;
    const driftHours = validDays > 1 ? latestBedtime - earliestBedtime : 0;

    const generatedInsights = [];
    if (validDays === 0) {
      generatedInsights.push({ type: 'neutral', title: 'No Data', desc: 'Not enough telemetry to form insights for this period.' });
    } else {
      if (avgDurationMs < 7 * 60 * 60 * 1000) {
        generatedInsights.push({ type: 'warning', title: 'Sleep Debt Accumulating', desc: `You are averaging ${formatSleepDuration(avgDurationMs)}, which is below the 7.5h baseline.` });
      } else {
        generatedInsights.push({ type: 'success', title: 'Optimal Rest', desc: `You are hitting a solid average of ${formatSleepDuration(avgDurationMs)}.` });
      }

      if (driftHours > 2) {
        generatedInsights.push({ type: 'warning', title: 'High Sleep Irregularity', desc: `Your bedtime shifted by over ${Math.round(driftHours)} hours. This disrupts circadian rhythm.` });
      } else if (validDays > 1) {
        generatedInsights.push({ type: 'success', title: 'Consistent Rhythm', desc: 'Your bedtime is highly consistent, optimizing hormone release.' });
      }

      if (totalInterruptions > validDays * 1.5) {
        generatedInsights.push({ type: 'warning', title: 'Screen Fragmentation', desc: `Frequent phone usage detected during sleep windows (${totalInterruptions} times).` });
      }
    }

    return {
      stats: { avgScore, avgDuration: avgDurationMs, validDays },
      history: pastDays.reverse(),
      insights: generatedInsights
    };
  }, [events, timeframe]);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content report-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="mono">Sleep Insights</h2>
          <button className="close-btn" onClick={onClose}>×</button>
        </div>

        <div className="modal-body">
          <div className="timeframe-pills mono">
            <button className={timeframe === 'today' ? 'active' : ''} onClick={() => setTimeframe('today')}>Today</button>
            <button className={timeframe === 'week' ? 'active' : ''} onClick={() => setTimeframe('week')}>1 Week</button>
            <button className={timeframe === 'month' ? 'active' : ''} onClick={() => setTimeframe('month')}>1 Month</button>
          </div>

          {/* Key forces React to re-render and trigger CSS animation on tab switch */}
          <div key={timeframe} className="animated-tab-content">
            <div className="report-hero">
              <div className="hero-score mono" style={{ color: stats.avgScore >= 80 ? 'var(--accent-emerald)' : 'var(--text-main)' }}>
                {stats.avgScore || '--'}
              </div>
              <div className="hero-labels mono">
                <span style={{ fontSize: '18px', color: 'var(--text-main)' }}>Avg Score</span>
                <span style={{ color: 'var(--text-faint)' }}>Based on {stats.validDays} logged nights</span>
              </div>
            </div>

            {timeframe !== 'today' && stats.validDays > 0 && (
              <div className="rhythm-chart">
                <div className="chart-title mono">Bedtime Consistency</div>
                <div className="chart-area">
                  {history.map((day, idx) => {
                    const bedDate = new Date(day.bedTime);
                    const wakeDate = new Date(day.wakeTime);

                    const bedHour = bedDate.getHours() + bedDate.getMinutes() / 60;
                    const wakeHour = wakeDate.getHours() + wakeDate.getMinutes() / 60;

                    const normalizeHour = (h) => {
                      if (h >= 20) return h - 20; 
                      if (h <= 12) return h + 4;  
                      if (h > 12 && h < 20) return h < 16 ? 0 : 16; 
                      return 0;
                    };

                    const plotStart = normalizeHour(bedHour);
                    let plotEnd = normalizeHour(wakeHour);
                    if (plotEnd < plotStart) plotEnd = 16;

                    const startPercent = (plotStart / 16) * 100;
                    const widthPercent = ((plotEnd - plotStart) / 16) * 100;
                    
                    // Calculate hours & mins string for the pill
                    const hrs = Math.floor(day.actualSleepMs / 3600000);
                    const mins = Math.floor((day.actualSleepMs % 3600000) / 60000);

                    return (
                      <div key={idx} className="chart-row">
                        <div className="chart-pill mono" style={{ 
                          left: `${Math.max(0, startPercent)}%`, 
                          width: `${Math.min(100 - startPercent, widthPercent)}%`,
                          backgroundColor: widthPercent < 35 ? 'var(--accent-amber)' : 'var(--accent-emerald)'
                        }}>
                          <span className="pill-text">{hrs}h {mins}m</span>
                        </div>
                      </div>
                    );
                  })}
                  
                  <div className="chart-guides mono">
                    <span>8 PM</span>
                    <span>12 AM</span>
                    <span>4 AM</span>
                    <span>8 AM</span>
                    <span>12 PM</span>
                  </div>
                </div>
              </div>
            )}

            <div className="insights-container">
              <div className="chart-title mono" style={{ marginBottom: '12px' }}>AI Behavioral Suggestions</div>
              {insights.map((insight, idx) => (
                <div key={idx} className={`insight-card type-${insight.type}`}>
                  <div className="insight-icon">
                    {insight.type === 'success' ? '✓' : insight.type === 'warning' ? '!' : 'ℹ'}
                  </div>
                  <div className="insight-text mono">
                    <div className="insight-title">{insight.title}</div>
                    <div className="insight-desc">{insight.desc}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}