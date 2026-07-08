import React, { useState, useEffect } from 'react';
import { Check, X, LogIn, LogOut, Trash2 } from 'lucide-react';

export default function BookingList({ currentUser, showToast, reloadCounter, onReload }) {
  const [reservations, setReservations] = useState([]);
  const [waitlists, setWaitlists] = useState([]);

  useEffect(() => {
    // Fetch reservations
    fetch('/api/reservations')
      .then((res) => res.json())
      .then((data) => {
        // Filter for active user (if not admin, only show theirs. Actually, even if admin, in "My Bookings" tab, it's nice to show their own. Let's filter by currentUser.id)
        const myResv = data.filter((r) => r.user_id === currentUser.id);
        setReservations(myResv);
      })
      .catch((err) => console.error(err));

    // Fetch waitlists
    fetch('/api/waitlists')
      .then((res) => res.json())
      .then((data) => {
        const myWait = data.filter((w) => w.user_id === currentUser.id);
        setWaitlists(myWait);
      })
      .catch((err) => console.error(err));
  }, [currentUser, reloadCounter]);

  const handleAction = (endpoint, method = 'PUT') => {
    fetch(endpoint, {
      method: method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: currentUser.id })
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.error) {
          showToast(data.error);
        } else {
          showToast(data.message || "Action completed successfully.");
          onReload();
        }
      })
      .catch((err) => console.error(err));
  };

  const getStatusStyle = (status) => {
    switch (status) {
      case 'Confirmed': return { color: 'var(--text-color)', fontWeight: 'bold' };
      case 'CheckedIn': return { color: 'var(--success-color)' };
      case 'Completed': return { color: 'var(--text-secondary)', textDecoration: 'line-through' };
      case 'PendingApproval': return { color: '#ffb300', fontStyle: 'italic' };
      case 'Cancelled': return { color: 'var(--error-color)', opacity: 0.6 };
      default: return {};
    }
  };

  const getWaitlistStatusStyle = (status) => {
    switch (status) {
      case 'Waiting': return { color: 'var(--text-secondary)' };
      case 'Promoted': return { color: 'var(--success-color)', fontWeight: 'bold' };
      case 'Expired': return { color: 'var(--error-color)', opacity: 0.6 };
      case 'Cancelled': return { color: 'var(--error-color)', opacity: 0.6 };
      default: return {};
    }
  };

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">My Bookings & Waitlists</h1>
        <p className="page-subtitle">Track, check-in, and manage your upcoming reservations and waitlist status.</p>
      </div>

      {/* Reservations Section */}
      <div style={{ marginBottom: '3rem' }}>
        <h2 style={{ fontSize: '1.25rem', marginBottom: '1rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem' }}>
          Active & Past Reservations
        </h2>
        
        <div className="table-wrapper">
          <table className="table">
            <thead>
              <tr>
                <th>Resource</th>
                <th>Category</th>
                <th>Timeslot</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {reservations.map((resv) => (
                <tr key={resv.id}>
                  <td style={{ fontWeight: 600 }}>{resv.resource_name}</td>
                  <td><span className="category-tag">{resv.category_name}</span></td>
                  <td className="mono">{resv.start_time} to {resv.end_time}</td>
                  <td style={getStatusStyle(resv.status)}>{resv.status}</td>
                  <td>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      {resv.status === 'Confirmed' && (
                        <button 
                          className="btn btn-secondary" 
                          onClick={() => handleAction(`/api/reservations/${resv.id}/checkin`)}
                          style={{ padding: '0.3rem 0.6rem', fontSize: '0.8rem' }}
                        >
                          <LogIn size={12} /> Check In
                        </button>
                      )}
                      {resv.status === 'CheckedIn' && (
                        <button 
                          className="btn btn-secondary" 
                          onClick={() => handleAction(`/api/reservations/${resv.id}/complete`)}
                          style={{ padding: '0.3rem 0.6rem', fontSize: '0.8rem' }}
                        >
                          <LogOut size={12} /> Complete
                        </button>
                      )}
                      {['Confirmed', 'PendingApproval', 'CheckedIn'].includes(resv.status) && (
                        <button 
                          className="btn btn-danger" 
                          onClick={() => handleAction(`/api/reservations/${resv.id}/cancel`)}
                          style={{ padding: '0.3rem 0.6rem', fontSize: '0.8rem' }}
                        >
                          <X size={12} /> Cancel
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {reservations.length === 0 && (
                <tr>
                  <td colSpan="5" style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: '2rem' }}>
                    You have no reservations. Book a resource from the Catalog!
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Waitlists Section */}
      <div>
        <h2 style={{ fontSize: '1.25rem', marginBottom: '1rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem' }}>
          My Waitlists
        </h2>
        
        <div className="table-wrapper">
          <table className="table">
            <thead>
              <tr>
                <th>Resource</th>
                <th>Desired Timeslot</th>
                <th>Priority Score</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {waitlists.map((item) => (
                <tr key={item.id}>
                  <td style={{ fontWeight: 600 }}>{item.resource_name}</td>
                  <td className="mono">{item.start_time} to {item.end_time}</td>
                  <td className="mono">{item.priority_score}</td>
                  <td style={getWaitlistStatusStyle(item.status)}>{item.status}</td>
                  <td>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      {item.status === 'Promoted' && (
                        <>
                          <button 
                            className="btn btn-secondary" 
                            onClick={() => handleAction(`/api/waitlists/${item.id}/confirm`, 'POST')}
                            style={{ padding: '0.3rem 0.6rem', fontSize: '0.8rem' }}
                          >
                            <Check size={12} /> Claim
                          </button>
                          <button 
                            className="btn btn-danger" 
                            onClick={() => handleAction(`/api/waitlists/${item.id}/reject`, 'POST')}
                            style={{ padding: '0.3rem 0.6rem', fontSize: '0.8rem' }}
                          >
                            <X size={12} /> Decline
                          </button>
                        </>
                      )}
                      {item.status === 'Waiting' && (
                        <button 
                          className="btn btn-danger" 
                          onClick={() => {
                            // Cancel waitlist entry: we can hit decline/reject endpoint which expires/cancels it
                            handleAction(`/api/waitlists/${item.id}/reject`, 'POST');
                          }}
                          style={{ padding: '0.3rem 0.6rem', fontSize: '0.8rem' }}
                        >
                          <Trash2 size={12} /> Leave Waitlist
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {waitlists.length === 0 && (
                <tr>
                  <td colSpan="5" style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: '2rem' }}>
                    You are not on any resource waitlists.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
