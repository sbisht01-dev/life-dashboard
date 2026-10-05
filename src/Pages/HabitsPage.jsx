import { useState, useEffect } from 'react';
import { doc, getDoc, setDoc, collection, getDocs } from 'firebase/firestore';
import { auth, db } from '../utils/firebase';
import './HabitsPage.css';

const getLocalDateString = () => {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export default function HabitsPage({ onBack }) {
  const [habits, setHabits] = useState([]);
  const [completedToday, setCompletedToday] = useState([]);
  const [loading, setLoading] = useState(true);
  const todayStr = getLocalDateString();

  useEffect(() => {
    const loadHabitData = async () => {
      const user = auth.currentUser;
      if (!user) return;

      try {
        // 1. Load the master list of habits
        const habitsSnap = await getDocs(collection(db, 'users', user.uid, 'habits'));
        const loadedHabits = habitsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        setHabits(loadedHabits);

        // 2. Load today's completed log
        const logRef = doc(db, 'users', user.uid, 'habit_logs', todayStr);
        const logSnap = await getDoc(logRef);
        if (logSnap.exists()) {
          setCompletedToday(logSnap.data().completed || []);
        }
      } catch (err) {
        console.error("Error loading habits:", err);
      } finally {
        setLoading(false);
      }
    };
    loadHabitData();
  }, [todayStr]);

  const toggleHabit = async (habitId) => {
    const user = auth.currentUser;
    if (!user) return;

    const isDone = completedToday.includes(habitId);
    const nextCompleted = isDone 
      ? completedToday.filter(id => id !== habitId) 
      : [...completedToday, habitId];

    // Optimistic UI update
    setCompletedToday(nextCompleted);

    // Save to Firebase
    try {
      const logRef = doc(db, 'users', user.uid, 'habit_logs', todayStr);
      await setDoc(logRef, { completed: nextCompleted }, { merge: true });
    } catch (err) {
      console.error("Failed to save habit:", err);
    }
  };

  return (
    <div className="app-container">
      <header className="app-header">
        <button onClick={onBack} className="back-btn mono">← Back to Bento Grid</button>
        <div className="mono" style={{ color: 'var(--text-main)' }}>{todayStr}</div>
      </header>

      <div className="bento-grid">
        <div className="bento-card col-12">
          <div className="card-header">
            <span className="card-title mono">Daily Actions</span>
            <span className="card-tag mono">{completedToday.length} / {habits.length} Completed</span>
          </div>

          <div className="habit-list">
            {loading ? (
              <div className="mono" style={{ padding: '20px', color: 'var(--text-faint)' }}>Loading routines...</div>
            ) : habits.length === 0 ? (
              <div className="mono" style={{ padding: '20px', color: 'var(--text-faint)' }}>
                No habits configured in the database yet.
              </div>
            ) : (
              habits.map(habit => {
                const isDone = completedToday.includes(habit.id);
                return (
                  <div key={habit.id} className={`habit-item ${isDone ? 'done' : ''}`} onClick={() => toggleHabit(habit.id)}>
                    <div className="habit-info">
                      <span className="habit-icon">{habit.icon}</span>
                      <span className="habit-name mono">{habit.name}</span>
                    </div>
                    <div className={`checkbox ${isDone ? 'checked' : ''}`}></div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}