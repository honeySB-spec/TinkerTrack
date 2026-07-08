import React, { useState, useEffect } from 'react';
import { Calendar as CalendarIcon, Clock } from 'lucide-react';

const SLOTS = [
  { label: '08:00 - 10:00', start: '08:00', end: '10:00' },
  { label: '10:00 - 12:00', start: '10:00', end: '12:00' },
  { label: '12:00 - 14:00', start: '12:00', end: '14:00' },
  { label: '14:00 - 16:00', start: '14:00', end: '16:00' },
  { label: '16:00 - 18:00', start: '16:00', end: '18:00' },
  { label: '18:00 - 20:00', start: '18:00', end: '20:00' },
];

export default function ReservationScheduler({ currentUser, reloadCounter, authFetch }) {
  const [resources, setResources] = useState([]);
  const [reservations, setReservations] = useState([]);
  const [selectedDate, setSelectedDate] = useState('');
  const [days, setDays] = useState([]);

  // Generate next 7 days starting from today
  useEffect(() => {
    const list = [];
    const now = new Date();
    for (let i = 0; i < 7; i++) {
      const date = new Date(now.getTime() + i * 24 * 60 * 60 * 1000);
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      
      const label = date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
      const value = `${year}-${month}-${day}`;
      list.push({ label, value });
    }
    setDays(list);
    if (list.length > 0) {
      setSelectedDate(list[0].value);
    }
  }, []);

  // Fetch data
  useEffect(() => {
    fetch('/api/resources')
      .then((res) => res.json())
      .then((data) => setResources(data.resources))
      .catch((err) => console.error(err));

    authFetch('/api/reservations')
      .then((res) => res.json())
      .then((data) => setReservations(data))
      .catch((err) => console.error(err));
  }, [reloadCounter]);

  // Helper to check if a resource has a booking overlapping a slot on the selected date
  const getBookingForSlot = (resourceId, dateStr, slot) => {
    const slotStartStr = `${dateStr} ${slot.start}`;
    const slotEndStr = `${dateStr} ${slot.end}`;

    return reservations.find((resv) => {
      if (resv.resource_id !== resourceId) return false;
      if (!['Confirmed', 'CheckedIn', 'PendingApproval'].includes(resv.status)) return false;
      
      // Parse dates: "YYYY-MM-DD HH:MM"
      const resvStart = resv.start_time;
      const resvEnd = resv.end_time;
      
      // Check overlap
      return resvStart < slotEndStr && resvEnd > slotStartStr;
    });
  };

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Live Availability</h1>
        <p className="page-subtitle">Interactive daily schedule showing booked slots and open resources.</p>
      </div>

      <div className="scheduler-card">
        <div className="schedule-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <CalendarIcon size={18} />
            <h3 style={{ margin: 0 }}>Timeline Schedule</h3>
          </div>
          
          <div className="categories-tabs">
            {days.map((day) => (
              <button
                key={day.value}
                className={`cat-tab ${selectedDate === day.value ? 'active' : ''}`}
                onClick={() => setSelectedDate(day.value)}
              >
                {day.label}
              </button>
            ))}
          </div>
        </div>

        {/* Timeline Header Row (Hours) */}
        <div className="days-row" style={{ gridTemplateColumns: '200px repeat(6, 1fr)', marginBottom: '1rem' }}>
          <div className="day-cell-header" style={{ textAlign: 'left', fontWeight: 'bold' }}>Resource Name</div>
          {SLOTS.map((slot, index) => (
            <div key={index} className="day-cell-header">
              <div style={{ fontWeight: 600, color: 'var(--text-color)' }}>Slot {index + 1}</div>
              <div style={{ fontSize: '0.7rem' }}>{slot.label}</div>
            </div>
          ))}
        </div>

        {/* Schedule grid rows */}
        <div className="schedule-grid-container">
          {resources.map((res) => {
            if (res.status !== 'Available') return null;
            return (
              <div key={res.id} className="resource-schedule-row" style={{ gridTemplateColumns: '200px 1fr' }}>
                <div className="resource-info-col">
                  <h5>{res.name}</h5>
                  <span className="category-tag" style={{ fontSize: '0.65rem' }}>{res.category_name}</span>
                </div>

                <div className="timeline-track">
                  {SLOTS.map((slot, index) => {
                    const booking = getBookingForSlot(res.id, selectedDate, slot);
                    const isBooked = !!booking;
                    let tooltipText = "Available (Click to book via Catalog)";
                    if (isBooked) {
                      tooltipText = `${booking.user_name} (${booking.status})\n${booking.start_time.split(' ')[1]} - ${booking.end_time.split(' ')[1]}`;
                    }

                    return (
                      <div
                        key={index}
                        className={`timeline-slot ${isBooked ? 'booked' : ''}`}
                        title={tooltipText}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: '0.75rem',
                          fontFamily: 'var(--font-mono)',
                          position: 'relative'
                        }}
                      >
                        {isBooked ? (
                          <span style={{ fontSize: '0.7rem', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', padding: '0 4px' }}>
                            {booking.user_name.split(' ')[0]}
                          </span>
                        ) : (
                          <span style={{ opacity: 0.1, fontSize: '0.65rem' }}>Open</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      
      <div style={{ marginTop: '2rem', display: 'flex', gap: '1.5rem', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
          <div style={{ width: '12px', height: '12px', border: '1px solid var(--border-color)', borderRadius: '2px' }}></div>
          <span>Available Slot</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
          <div style={{ width: '12px', height: '12px', backgroundColor: 'var(--text-color)', borderRadius: '2px' }}></div>
          <span>Booked Slot (Hover to view user details)</span>
        </div>
      </div>
    </div>
  );
}
