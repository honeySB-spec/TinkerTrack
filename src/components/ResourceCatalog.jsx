import React, { useState, useEffect } from 'react';
import { Search, Calendar, Users, AlertTriangle } from 'lucide-react';

export default function ResourceCatalog({ currentUser, showToast, reloadCounter, onReload }) {
  const [resources, setResources] = useState([]);
  const [categories, setCategories] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [bookingModal, setBookingModal] = useState(null); // holds resource object if open
  
  // Form fields
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  
  // Conflict state
  const [conflict, setConflict] = useState(false);

  useEffect(() => {
    fetch('/api/resources')
      .then((res) => res.json())
      .then((data) => {
        setResources(data.resources);
        setCategories(data.categories);
      })
      .catch((err) => console.error("Error loading resources:", err));
  }, [reloadCounter]);

  // Set default times when booking modal opens
  const openBookingModal = (resObj) => {
    // Default to tomorrow 10:00 to 11:00
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    const formatDateTime = (date, hour) => {
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}T${String(hour).padStart(2, '0')}:00`;
    };

    setStartTime(formatDateTime(tomorrow, 10));
    setEndTime(formatDateTime(tomorrow, 11));
    setConflict(false);
    setBookingModal(resObj);
  };

  const handleReserve = (e) => {
    e.preventDefault();
    if (!startTime || !endTime) return;

    // Convert datetime-local ISO format "2026-07-09T10:00" to "2026-07-09 10:00"
    const startStr = startTime.replace('T', ' ');
    const endStr = endTime.replace('T', ' ');

    fetch('/api/reservations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user_id: currentUser.id,
        resource_id: bookingModal.id,
        start_time: startStr,
        end_time: endStr
      })
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.error) {
          if (data.error.includes('overlap') || data.error.includes('conflict')) {
            setConflict(true);
            showToast("Overlap conflict. You can join the waitlist.");
          } else {
            showToast(data.error);
          }
        } else {
          showToast(`Successfully booked ${bookingModal.name}!`);
          setBookingModal(null);
          onReload();
        }
      })
      .catch((err) => console.error(err));
  };

  const handleJoinWaitlist = () => {
    const startStr = startTime.replace('T', ' ');
    const endStr = endTime.replace('T', ' ');

    fetch('/api/waitlists', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user_id: currentUser.id,
        resource_id: bookingModal.id,
        start_time: startStr,
        end_time: endStr
      })
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.error) {
          showToast(data.error);
        } else {
          showToast(`Successfully joined waitlist for ${bookingModal.name}!`);
          setBookingModal(null);
          onReload();
        }
      })
      .catch((err) => console.error(err));
  };

  // Filter Catalog items
  const filteredResources = resources.filter((res) => {
    const matchesCategory = selectedCategory === 'All' || res.category_name === selectedCategory;
    const matchesSearch = res.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          res.description.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Resources Catalog</h1>
        <p className="page-subtitle">Discover and reserve shared workspace items, gear, and labs.</p>
      </div>

      {/* Filter and Search Controls */}
      <div className="filter-bar">
        <div className="categories-tabs">
          <button 
            className={`cat-tab ${selectedCategory === 'All' ? 'active' : ''}`}
            onClick={() => setSelectedCategory('All')}
          >
            All Resources
          </button>
          {categories.map((cat) => (
            <button
              key={cat.id}
              className={`cat-tab ${selectedCategory === cat.name ? 'active' : ''}`}
              onClick={() => setSelectedCategory(cat.name)}
            >
              {cat.name}
            </button>
          ))}
        </div>

        <div style={{ position: 'relative' }}>
          <Search size={16} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
          <input
            type="text"
            className="search-input"
            placeholder="Search resources..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{ paddingLeft: '32px' }}
          />
        </div>
      </div>

      {/* Resources Cards Grid */}
      <div className="resources-grid">
        {filteredResources.map((res) => {
          const restrictedRoles = JSON.parse(res.restricted_roles);
          const isRestricted = restrictedRoles.includes(currentUser.role);
          const hasApprovalWorkflow = res.requires_approval === 1;

          return (
            <div key={res.id} className="resource-card">
              <div>
                <div className="resource-header">
                  <span className="category-tag">{res.category_name}</span>
                  <span className={`status-badge ${res.status.toLowerCase()}`}>
                    {res.status}
                  </span>
                </div>

                <h3 className="resource-name">{res.name}</h3>
                <p className="resource-desc">{res.description}</p>
                
                {hasApprovalWorkflow && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.5rem', color: 'var(--text-secondary)', fontSize: '0.8rem' }}>
                    <Users size={12} />
                    <span>Requires Approval</span>
                  </div>
                )}
              </div>

              <div className="resource-footer">
                {isRestricted ? (
                  <div className="restriction-notice">
                    Restricted to {restrictedRoles.join(', ')} only
                  </div>
                ) : (
                  <button 
                    className="btn" 
                    disabled={res.status !== 'Available'}
                    onClick={() => openBookingModal(res)}
                  >
                    <Calendar size={14} /> Book Resource
                  </button>
                )}
              </div>
            </div>
          );
        })}
        {filteredResources.length === 0 && (
          <div style={{ gridColumn: '1/-1', textAlign: 'center', padding: '3rem', border: '1px solid var(--border-color)', color: 'var(--text-secondary)' }}>
            No resources match your search criteria.
          </div>
        )}
      </div>

      {/* Booking Form Modal */}
      {bookingModal && (
        <div className="modal-backdrop">
          <div className="modal-content">
            <div className="modal-header">
              <h3>Reserve {bookingModal.name}</h3>
              <button className="modal-close" onClick={() => setBookingModal(null)}>&times;</button>
            </div>

            <form onSubmit={handleReserve}>
              <div className="form-group">
                <label>Start Date & Time</label>
                <input
                  type="datetime-local"
                  className="form-control"
                  value={startTime}
                  onChange={(e) => {
                    setStartTime(e.target.value);
                    setConflict(false);
                  }}
                  required
                />
              </div>

              <div className="form-group">
                <label>End Date & Time</label>
                <input
                  type="datetime-local"
                  className="form-control"
                  value={endTime}
                  onChange={(e) => {
                    setEndTime(e.target.value);
                    setConflict(false);
                  }}
                  required
                />
              </div>

              {conflict && (
                <div style={{ border: '1px solid var(--border-color)', padding: '1rem', marginBottom: '1.5rem', borderRadius: 'var(--radius)', display: 'flex', flexDirection: 'column', gap: '0.75rem', backgroundColor: 'var(--bg-color)' }}>
                  <div style={{ display: 'flex', gap: '0.5rem', color: 'var(--error-color)', fontSize: '0.85rem' }}>
                    <AlertTriangle size={16} />
                    <span>Timeslot overlaps with an existing booking. You can queue on the Waitlist for this resource and period.</span>
                  </div>
                  <button
                    type="button"
                    className="btn"
                    onClick={handleJoinWaitlist}
                    style={{ width: '100%' }}
                  >
                    Join Waitlist Queue
                  </button>
                </div>
              )}

              <div className="form-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setBookingModal(null)}>
                  Cancel
                </button>
                <button type="submit" className="btn" disabled={conflict}>
                  Submit Reservation
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
