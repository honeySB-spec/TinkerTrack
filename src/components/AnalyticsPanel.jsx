import React, { useState, useEffect } from 'react';
import { BarChart3, Clock, TrendingUp, History, Filter, Calendar } from 'lucide-react';

export default function AnalyticsPanel({ reloadCounter, authFetch }) {
  const [analyticsData, setAnalyticsData] = useState(null);
  const [categories, setCategories] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [selectedRange, setSelectedRange] = useState('all');

  // Load categories
  useEffect(() => {
    fetch('/api/resources')
      .then((res) => res.json())
      .then((data) => setCategories(data.categories))
      .catch((err) => console.error(err));
  }, []);

  // Load analytics when range or category changes
  useEffect(() => {
    let url = `/api/analytics?range=${selectedRange}`;
    if (selectedCategory !== 'All' && categories.length > 0) {
      const catObj = categories.find(c => c.name === selectedCategory);
      if (catObj) {
        url += `&category_id=${catObj.id}`;
      }
    }

    authFetch(url)
      .then((res) => res.json())
      .then((data) => setAnalyticsData(data))
      .catch((err) => console.error("Error loading analytics:", err));
  }, [reloadCounter, selectedRange, selectedCategory, categories]);

  if (!analyticsData) {
    return (
      <div style={{ padding: '3rem', textAlign: 'center', fontFamily: 'monospace', color: 'var(--text-secondary)' }}>
        LOADING DASHBOARD METRICS...
      </div>
    );
  }

  const { bookingsByResource, utilization, peakHours, logs } = analyticsData;

  // KPI Calculations
  const totalBookings = bookingsByResource.reduce((sum, item) => sum + item.count, 0);
  const avgUtilization = utilization.length > 0
    ? Math.round(utilization.reduce((sum, item) => sum + item.utilization, 0) / utilization.length)
    : 0;

  let popularResource = "N/A";
  let maxBookings = 0;
  bookingsByResource.forEach(item => {
    if (item.count > maxBookings) {
      maxBookings = item.count;
      popularResource = item.name;
    }
  });

  let peakHourStr = "N/A";
  let maxPeakCount = 0;
  peakHours.forEach(item => {
    if (item.count > maxPeakCount) {
      maxPeakCount = item.count;
      peakHourStr = `${item.hour}:00`;
    }
  });

  const maxBookingCount = Math.max(...bookingsByResource.map(b => b.count), 1);
  const maxPeakCountValue = Math.max(...peakHours.map(p => p.count), 1);

  return (
    <div>
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1.5rem' }}>
        <div>
          <h1 className="page-title">Analytics & Insights</h1>
          <p className="page-subtitle">Real-time resource utilization, demand curves, and audit logs.</p>
        </div>

        {/* Filters Panel */}
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', backgroundColor: 'var(--panel-bg)', padding: '0.5rem 1rem', borderRadius: 'var(--radius)', border: '1px solid var(--border-color)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
            <Filter size={14} />
            <span>Filter Category:</span>
          </div>
          <select 
            className="role-select" 
            value={selectedCategory} 
            onChange={(e) => setSelectedCategory(e.target.value)}
            style={{ width: '130px', padding: '0.25rem', fontSize: '0.8rem', border: 'none', background: 'none' }}
          >
            <option value="All">All Categories</option>
            {categories.map(c => (
              <option key={c.id} value={c.name}>{c.name}</option>
            ))}
          </select>

          <span style={{ color: 'var(--border-color)', height: '16px', borderLeft: '1px solid' }}></span>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
            <Calendar size={14} />
            <span>Time Range:</span>
          </div>
          <select 
            className="role-select" 
            value={selectedRange} 
            onChange={(e) => setSelectedRange(e.target.value)}
            style={{ width: '120px', padding: '0.25rem', fontSize: '0.8rem', border: 'none', background: 'none' }}
          >
            <option value="all">All Time</option>
            <option value="7">Past 7 Days</option>
            <option value="30">Past 30 Days</option>
          </select>
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1.5rem', marginBottom: '2.5rem' }}>
        
        {/* KPI 1 */}
        <div style={{ backgroundColor: 'var(--card-bg)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius)', padding: '1.5rem', position: 'relative', overflow: 'hidden' }}>
          <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>
            Total Bookings
          </div>
          <div style={{ fontSize: '1.8rem', fontWeight: 'bold', lineHeight: 1.2 }}>
            {totalBookings}
          </div>
          <span style={{ fontSize: '0.7rem', color: 'var(--success-color)' }}>
            Active reservations & completed
          </span>
          <div style={{ position: 'absolute', right: '15px', bottom: '15px', opacity: 0.05 }}>
            <BarChart3 size={64} />
          </div>
        </div>

        {/* KPI 2 */}
        <div style={{ backgroundColor: 'var(--card-bg)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius)', padding: '1.5rem', position: 'relative', overflow: 'hidden' }}>
          <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>
            Avg Resource Utilization
          </div>
          <div style={{ fontSize: '1.8rem', fontWeight: 'bold', lineHeight: 1.2 }}>
            {avgUtilization}%
          </div>
          <div style={{ width: '100%', height: '4px', backgroundColor: 'var(--accent-secondary)', borderRadius: '2px', marginTop: '0.5rem', overflow: 'hidden' }}>
            <div style={{ width: `${avgUtilization}%`, height: '100%', backgroundColor: 'var(--text-color)' }}></div>
          </div>
          <div style={{ position: 'absolute', right: '15px', bottom: '15px', opacity: 0.05 }}>
            <TrendingUp size={64} />
          </div>
        </div>

        {/* KPI 3 */}
        <div style={{ backgroundColor: 'var(--card-bg)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius)', padding: '1.5rem', position: 'relative', overflow: 'hidden' }}>
          <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>
            Most Popular Resource
          </div>
          <div style={{ fontSize: '1.2rem', fontWeight: 'bold', lineHeight: 1.3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', margin: '0.35rem 0' }}>
            {popularResource}
          </div>
          <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>
            {maxBookings > 0 ? `${maxBookings} bookings recorded` : 'No bookings recorded'}
          </span>
          <div style={{ position: 'absolute', right: '15px', bottom: '15px', opacity: 0.05 }}>
            <History size={64} />
          </div>
        </div>

        {/* KPI 4 */}
        <div style={{ backgroundColor: 'var(--card-bg)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius)', padding: '1.5rem', position: 'relative', overflow: 'hidden' }}>
          <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>
            Busiest Reservation Hour
          </div>
          <div style={{ fontSize: '1.8rem', fontWeight: 'bold', lineHeight: 1.2 }}>
            {peakHourStr}
          </div>
          <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>
            Highest booking arrival frequency
          </span>
          <div style={{ position: 'absolute', right: '15px', bottom: '15px', opacity: 0.05 }}>
            <Clock size={64} />
          </div>
        </div>

      </div>

      <div className="analytics-grid">
        
        {/* Resource Utilization Bar Chart */}
        <div className="analytics-card">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.5rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem' }}>
            <TrendingUp size={16} />
            <h3 style={{ margin: 0, border: 'none', padding: 0 }}>Resource Utilization (%)</h3>
          </div>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            {utilization.map((item, index) => (
              <div key={index} style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
                  <span style={{ fontWeight: 500 }}>{item.name}</span>
                  <span className="mono">{item.utilization}%</span>
                </div>
                {/* Custom Bar with premium aesthetics */}
                <div style={{ width: '100%', height: '8px', backgroundColor: 'var(--accent-secondary)', border: '1px solid var(--border-color)', borderRadius: '4px', overflow: 'hidden' }}>
                  <div style={{ 
                    width: `${item.utilization}%`, 
                    height: '100%', 
                    background: 'linear-gradient(90deg, var(--border-hover), var(--text-color))' 
                  }}></div>
                </div>
              </div>
            ))}
            {utilization.length === 0 && (
              <div style={{ textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.85rem', padding: '2rem' }}>No usage metrics yet.</div>
            )}
          </div>
        </div>

        {/* Popular Resources (Booking Counts) */}
        <div className="analytics-card">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.5rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem' }}>
            <BarChart3 size={16} />
            <h3 style={{ margin: 0, border: 'none', padding: 0 }}>Total Bookings Count</h3>
          </div>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            {bookingsByResource.map((item, index) => {
              const percentage = Math.round((item.count / maxBookingCount) * 100);
              return (
                <div key={index} style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
                    <span style={{ fontWeight: 500 }}>{item.name}</span>
                    <span className="mono">{item.count} bookings</span>
                  </div>
                  {/* Custom Bar */}
                  <div style={{ width: '100%', height: '8px', backgroundColor: 'var(--accent-secondary)', border: '1px solid var(--border-color)', borderRadius: '4px', overflow: 'hidden' }}>
                    <div style={{ 
                      width: `${percentage}%`, 
                      height: '100%', 
                      background: 'linear-gradient(90deg, var(--border-hover), var(--text-color))' 
                    }}></div>
                  </div>
                </div>
              );
            })}
            {bookingsByResource.length === 0 && (
              <div style={{ textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.85rem', padding: '2rem' }}>No bookings found.</div>
            )}
          </div>
        </div>

        {/* Peak Booking Hours Distribution (Modernized Custom Chart) */}
        <div className="analytics-card" style={{ gridColumn: '1 / -1' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.5rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem' }}>
            <Clock size={16} />
            <h3 style={{ margin: 0, border: 'none', padding: 0 }}>Hourly Reservation Distribution Profile</h3>
          </div>
          
          <div className="chart-placeholder" style={{ gap: '0.75rem', height: '220px', border: '1px solid var(--border-color)', borderRadius: 'var(--radius)', padding: '1.5rem 1rem', display: 'flex', alignItems: 'flex-end', justifyContent: 'space-around', backgroundColor: 'var(--accent-secondary)' }}>
            {/* Render 12 columns for hour slots */}
            {Array.from({ length: 12 }).map((_, idx) => {
              const hourNum = 8 + idx;
              const hourStr = String(hourNum).padStart(2, '0');
              const match = peakHours.find(p => p.hour === hourStr);
              const count = match ? match.count : 0;
              const barHeight = Math.max(Math.round((count / maxPeakCountValue) * 100), 4); // min 4%

              return (
                <div key={idx} className="chart-bar-container" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1, height: '100%', justifyContent: 'flex-end' }}>
                  <div 
                    className="chart-bar" 
                    style={{ 
                      width: '80%', 
                      height: `${barHeight}%`, 
                      background: count > 0 ? 'linear-gradient(180deg, var(--text-color), var(--border-hover))' : 'var(--border-color)', 
                      borderRadius: '2px 2px 0 0', 
                      position: 'relative', 
                      display: 'flex', 
                      justifyContent: 'center',
                      transition: 'height 0.3s ease'
                    }}
                  >
                    {count > 0 && (
                      <span className="chart-bar-value" style={{ position: 'absolute', top: '-18px', fontSize: '0.7rem', fontWeight: 'bold', fontFamily: 'var(--font-mono)' }}>
                        {count}
                      </span>
                    )}
                  </div>
                  <span className="chart-bar-label" style={{ fontSize: '0.65rem', fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)', marginTop: '0.5rem' }}>
                    {hourStr}:00
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Live Activity Audit Feed */}
        <div className="analytics-card" style={{ gridColumn: '1 / -1' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.5rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem' }}>
            <History size={16} />
            <h3 style={{ margin: 0, border: 'none', padding: 0 }}>System Audit Logs</h3>
          </div>
          
          <ul className="activity-feed" style={{ maxHeight: '250px', overflowY: 'auto' }}>
            {logs.map((log) => {
              const time = new Date(log.timestamp).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
              const date = new Date(log.timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
              
              // Define colored tags based on action
              let actionStyle = { fontSize: '0.7rem', padding: '0.1rem 0.4rem', borderRadius: '4px', backgroundColor: 'var(--accent-secondary)', color: 'var(--text-color)', display: 'inline-block', fontWeight: 'bold', textTransform: 'uppercase' };
              if (log.action.includes("Cancel") || log.action.includes("Reject")) {
                actionStyle.backgroundColor = 'rgba(255, 51, 51, 0.1)';
                actionStyle.color = 'var(--error-color)';
              } else if (log.action.includes("Create") || log.action.includes("Confirm") || log.action.includes("Check In")) {
                actionStyle.backgroundColor = 'rgba(51, 204, 51, 0.1)';
                actionStyle.color = 'var(--success-color)';
              }

              return (
                <li key={log.id} className="activity-item" style={{ borderBottom: '1px solid var(--border-color)', padding: '0.75rem 0', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <span style={actionStyle}>{log.action}</span>
                      <span style={{ fontWeight: 600, fontSize: '0.85rem' }}>{log.user_name}</span>
                    </div>
                    <span className="activity-time" style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>{date} {time}</span>
                  </div>
                  <div style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', paddingLeft: '0.2rem' }}>{log.details}</div>
                </li>
              );
            })}
            {logs.length === 0 && (
              <div style={{ textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.85rem', paddingTop: '2rem' }}>
                No system activity logged yet.
              </div>
            )}
          </ul>
        </div>
      </div>
    </div>
  );
}
