import React, { useState, useEffect } from 'react';
import { BarChart3, Clock, TrendingUp, History } from 'lucide-react';

export default function AnalyticsPanel({ reloadCounter }) {
  const [analyticsData, setAnalyticsData] = useState(null);

  useEffect(() => {
    fetch('/api/analytics')
      .then((res) => res.json())
      .then((data) => setAnalyticsData(data))
      .catch((err) => console.error("Error loading analytics:", err));
  }, [reloadCounter]);

  if (!analyticsData) {
    return (
      <div style={{ padding: '3rem', textAlign: 'center', fontFamily: 'monospace', color: 'var(--text-secondary)' }}>
        LOADING ANALYTICS DATA...
      </div>
    );
  }

  const { bookingsByResource, utilization, peakHours, logs } = analyticsData;

  // Find max count for relative bar scaling
  const maxBookingCount = Math.max(...bookingsByResource.map(b => b.count), 1);
  const maxPeakCount = Math.max(...peakHours.map(p => p.count), 1);

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Analytics & Insights</h1>
        <p className="page-subtitle">Real-time resource utilization, demand curves, and audit logs.</p>
      </div>

      <div className="analytics-grid">
        {/* Resource Utilization (Monochrome Bar Chart) */}
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
                {/* Custom Bar */}
                <div style={{ width: '100%', height: '8px', backgroundColor: 'var(--accent-secondary)', border: '1px solid var(--border-color)', borderRadius: '4px', overflow: 'hidden' }}>
                  <div style={{ width: `${item.utilization}%`, height: '100%', backgroundColor: 'var(--text-color)' }}></div>
                </div>
              </div>
            ))}
            {utilization.length === 0 && (
              <div style={{ textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>No usage logs yet.</div>
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
                    <div style={{ width: `${percentage}%`, height: '100%', backgroundColor: 'var(--text-color)' }}></div>
                  </div>
                </div>
              );
            })}
            {bookingsByResource.length === 0 && (
              <div style={{ textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>No bookings found.</div>
            )}
          </div>
        </div>

        {/* Peak Booking Hours Distribution */}
        <div className="analytics-card">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.5rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem' }}>
            <Clock size={16} />
            <h3 style={{ margin: 0, border: 'none', padding: 0 }}>Peak Booking Hours (Start Time)</h3>
          </div>
          
          <div className="chart-placeholder" style={{ gap: '0.75rem', height: '180px' }}>
            {/* Render 24 columns for hour slots */}
            {Array.from({ length: 12 }).map((_, idx) => {
              // Map to standard hours from 8:00 to 20:00 (12 hours)
              const hourNum = 8 + idx;
              const hourStr = String(hourNum).padStart(2, '0');
              const match = peakHours.find(p => p.hour === hourStr);
              const count = match ? match.count : 0;
              const barHeight = Math.max(Math.round((count / maxPeakCount) * 100), 2); // min 2%

              return (
                <div key={idx} className="chart-bar-container">
                  <div className="chart-bar" style={{ height: `${barHeight}%` }}>
                    {count > 0 && <span className="chart-bar-value">{count}</span>}
                  </div>
                  <span className="chart-bar-label" style={{ fontSize: '0.65rem', fontFamily: 'var(--font-mono)' }}>
                    {hourStr}:00
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Live Activity Audit Feed */}
        <div className="analytics-card">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.5rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem' }}>
            <History size={16} />
            <h3 style={{ margin: 0, border: 'none', padding: 0 }}>System Audit Logs</h3>
          </div>
          
          <ul className="activity-feed" style={{ maxHeight: '180px' }}>
            {logs.map((log) => {
              // format timestamp
              const time = new Date(log.timestamp).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
              return (
                <li key={log.id} className="activity-item">
                  <span className="activity-time">{time} — {log.user_name}</span>
                  <div style={{ fontWeight: 500 }}>{log.action}</div>
                  <div style={{ color: 'var(--text-secondary)', fontSize: '0.75rem' }}>{log.details}</div>
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
