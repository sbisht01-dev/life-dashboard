import { useState, useEffect } from 'react';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { auth, db } from '../utils/firebase';
import './HabitsCard.css';

const getLocalDateString = (dateObj) => {
  const year = dateObj.getFullYear();
  const month = String(dateObj.getMonth() + 1).padStart(2, '0');
  const day = String(dateObj.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export default function HabitsCard({ onOpen }) {
  const [activity, setActivity] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchActivity = async () => {
      const user = auth.currentUser;
      if (!user) return;

      // Calculate the date 70 days ago
      const pastDate = new Date();
      pastDate.setDate(pastDate.getDate() - 70);
      const pastDateStr = getLocalDateString(pastDate);

      try {
        const logsRef = collection(db, 'users', user.uid, 'habit_logs');
        const q = query(logsRef, where('__name__', '>=', pastDateStr));
        const snapshot = await getDocs(q);
        
        const activityMap = {};
        snapshot.forEach(doc => {
          // Count how many habits were completed on this date
          activityMap[doc.id] = doc.data().completed?.length || 0;
        });
        setActivity(activityMap);
      } catch (err) {
        console.error("Failed to fetch habit activity:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchActivity();
  }, []);

  // Generate the last 70 days for the grid
  const days = Array.from({ length: 70 }).map((_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (69 - i));
    return getLocalDateString(d);
  });

  return (
    <div className="bento-card col-8 clickable" onClick={onOpen}>
      <div className="card-header">
        <span className="card-title mono">Consistency Graph</span>
        <span className="card-tag mono">Last 70 Days</span>
      </div>
      
      {loading ? (
        <div className="skeleton" style={{ height: '80px', marginTop: '16px', borderRadius: '8px' }}></div>
      ) : (
        <div className="github-grid">
          {days.map(dateStr => {
            const count = activity[dateStr] || 0;
            // Determine intensity: 0=empty, 1=light, 2=medium, 3+=dark
            let intensityClass = 'level-0';
            if (count === 1) intensityClass = 'level-1';
            if (count === 2) intensityClass = 'level-2';
            if (count >= 3) intensityClass = 'level-3';

            return <div key={dateStr} className={`grid-square ${intensityClass}`} title={`${dateStr}: ${count} tasks`} />
          })}
        </div>
      )}
    </div>
  );
}