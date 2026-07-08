import React, { useState, useEffect } from 'react';
import { Plus, Edit2, Trash2, Check, X, ShieldAlert, Settings, Package } from 'lucide-react';

export default function AdminPanel({ currentUser, showToast, reloadCounter, onReload, authFetch }) {
  const [resources, setResources] = useState([]);
  const [categories, setCategories] = useState([]);
  const [reservations, setReservations] = useState([]);
  const [resourceModal, setResourceModal] = useState(null); // 'create' | resourceObj (for edit) | null
  const [activeSubTab, setActiveSubTab] = useState('resources'); // 'resources' | 'settings'

  // Form fields for resource
  const [name, setName] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [status, setStatus] = useState('Available');
  const [requiresApproval, setRequiresApproval] = useState(false);
  const [restrictedRoles, setRestrictedRoles] = useState([]); // Array of restricted role names
  const [description, setDescription] = useState('');

  // Form fields for settings
  const [settings, setSettings] = useState(null);
  const [undergradQuota, setUndergradQuota] = useState(2);
  const [gradQuota, setGradQuota] = useState(5);
  const [waitlistTtl, setWaitlistTtl] = useState(15);
  const [undergradWeight, setUndergradWeight] = useState(10);
  const [gradWeight, setGradWeight] = useState(20);
  const [staffWeight, setStaffWeight] = useState(30);
  const [adminWeight, setAdminWeight] = useState(40);
  const [bookingPenalty, setBookingPenalty] = useState(1);

  const rolesList = ['Undergraduate', 'Graduate', 'Staff'];

  useEffect(() => {
    authFetch('/api/resources')
      .then((res) => res.json())
      .then((data) => {
        setResources(data.resources);
        setCategories(data.categories);
        if (data.categories.length > 0) {
          setCategoryId(data.categories[0].id.toString());
        }
      })
      .catch((err) => console.error("Error loading resources:", err));

    authFetch('/api/reservations')
      .then((res) => res.json())
      .then((data) => setReservations(data))
      .catch((err) => console.error("Error loading reservations:", err));

    authFetch('/api/admin/settings')
      .then((res) => res.json())
      .then((data) => {
        setSettings(data);
        if (data) {
          setUndergradQuota(data.quotas?.Undergraduate || 2);
          setGradQuota(data.quotas?.Graduate || 5);
          setWaitlistTtl(data.waitlistTtlMinutes || 15);
          setUndergradWeight(data.priorityWeights?.Undergraduate || 10);
          setGradWeight(data.priorityWeights?.Graduate || 20);
          setStaffWeight(data.priorityWeights?.Staff || 30);
          setAdminWeight(data.priorityWeights?.Admin || 40);
          setBookingPenalty(data.priorityWeights?.bookingPenalty || 1);
        }
      })
      .catch((err) => console.error("Error loading settings:", err));
  }, [reloadCounter]);

  const openCreateModal = () => {
    setName('');
    if (categories.length > 0) setCategoryId(categories[0].id.toString());
    setStatus('Available');
    setRequiresApproval(false);
    setRestrictedRoles([]);
    setDescription('');
    setResourceModal('create');
  };

  const openEditModal = (res) => {
    setName(res.name);
    setCategoryId(res.category_id.toString());
    setStatus(res.status);
    setRequiresApproval(res.requires_approval === 1);
    setRestrictedRoles(JSON.parse(res.restricted_roles));
    setDescription(res.description || '');
    setResourceModal(res);
  };

  const handleSaveResource = (e) => {
    e.preventDefault();

    const isEdit = resourceModal !== 'create';
    const endpoint = isEdit ? `/api/resources/${resourceModal.id}` : '/api/resources';
    const method = isEdit ? 'PUT' : 'POST';

    authFetch(endpoint, {
      method,
      body: JSON.stringify({
        name,
        category_id: parseInt(categoryId),
        status,
        requires_approval: requiresApproval,
        restricted_roles: restrictedRoles,
        description
      })
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.error) {
          showToast(data.error);
        } else {
          showToast(isEdit ? "Resource updated successfully!" : "Resource created successfully!");
          setResourceModal(null);
          onReload();
        }
      })
      .catch((err) => console.error(err));
  };

  const handleDeleteResource = (id) => {
    if (!window.confirm("Are you sure you want to delete this resource? All active bookings for it will be cancelled.")) return;

    authFetch(`/api/resources/${id}`, {
      method: 'DELETE'
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.error) {
          showToast(data.error);
        } else {
          showToast("Resource deleted.");
          onReload();
        }
      })
      .catch((err) => console.error(err));
  };

  const handleApprove = (id) => {
    authFetch(`/api/admin/reservations/${id}/approve`, {
      method: 'POST'
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.error) showToast(data.error);
        else {
          showToast("Approved booking.");
          onReload();
        }
      });
  };

  const handleReject = (id) => {
    authFetch(`/api/admin/reservations/${id}/reject`, {
      method: 'POST'
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.error) showToast(data.error);
        else {
          showToast("Rejected/Cancelled booking.");
          onReload();
        }
      });
  };

  const toggleRestrictedRole = (role) => {
    setRestrictedRoles(prev => 
      prev.includes(role) ? prev.filter(r => r !== role) : [...prev, role]
    );
  };

  const handleSaveSettings = (e) => {
    e.preventDefault();
    authFetch('/api/admin/settings', {
      method: 'PUT',
      body: JSON.stringify({
        quotas: {
          Undergraduate: parseInt(undergradQuota),
          Graduate: parseInt(gradQuota),
          Staff: 999,
          Admin: 999
        },
        priorityWeights: {
          Undergraduate: parseInt(undergradWeight),
          Graduate: parseInt(gradWeight),
          Staff: parseInt(staffWeight),
          Admin: parseInt(adminWeight),
          bookingPenalty: parseInt(bookingPenalty)
        },
        waitlistTtlMinutes: parseInt(waitlistTtl)
      })
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.error) {
          showToast(data.error);
        } else {
          showToast("Access rules and settings updated successfully!");
          onReload();
        }
      })
      .catch((err) => console.error(err));
  };

  const pendingApprovals = reservations.filter(r => r.status === 'PendingApproval');

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Admin Management Console</h1>
        <p className="page-subtitle">Configure resources, handle approval workflows, and override schedules.</p>
      </div>

      {/* Admin Tab Selector */}
      <div className="filter-bar" style={{ marginBottom: '2rem' }}>
        <div className="categories-tabs">
          <button 
            className={`cat-tab ${activeSubTab === 'resources' ? 'active' : ''}`}
            onClick={() => setActiveSubTab('resources')}
          >
            <Package size={14} style={{ marginRight: '6px' }} />
            Resource Operations & Approvals
          </button>
          <button 
            className={`cat-tab ${activeSubTab === 'settings' ? 'active' : ''}`}
            onClick={() => setActiveSubTab('settings')}
          >
            <Settings size={14} style={{ marginRight: '6px' }} />
            System Settings & Quotas
          </button>
        </div>
      </div>

      {activeSubTab === 'resources' && (
        <>
          {/* Section 1: Pending Approvals Queue */}
          <div style={{ marginBottom: '3rem' }}>
            <h2 style={{ fontSize: '1.25rem', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem' }}>
              <ShieldAlert size={18} /> Approvals Queue ({pendingApprovals.length})
            </h2>
            
            <div className="table-wrapper">
              <table className="table">
                <thead>
                  <tr>
                    <th>User</th>
                    <th>Resource</th>
                    <th>Timeslot</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {pendingApprovals.map((item) => (
                    <tr key={item.id}>
                      <td>
                        <div style={{ fontWeight: 600 }}>{item.user_name}</div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{item.user_email}</div>
                      </td>
                      <td>{item.resource_name}</td>
                      <td className="mono">{item.start_time} to {item.end_time}</td>
                      <td>
                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                          <button 
                            className="btn btn-secondary" 
                            onClick={() => handleApprove(item.id)}
                            style={{ padding: '0.3rem 0.6rem', fontSize: '0.8rem' }}
                          >
                            <Check size={12} /> Approve
                          </button>
                          <button 
                            className="btn btn-danger" 
                            onClick={() => handleReject(item.id)}
                            style={{ padding: '0.3rem 0.6rem', fontSize: '0.8rem' }}
                          >
                            <X size={12} /> Reject
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {pendingApprovals.length === 0 && (
                    <tr>
                      <td colSpan="4" style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: '2rem' }}>
                        Approvals queue is empty.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Section 2: Catalog Resource CRUD */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h2 style={{ fontSize: '1.25rem', margin: 0 }}>Configure Resources</h2>
              <button className="btn" onClick={openCreateModal} style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem' }}>
                <Plus size={14} /> Add Resource
              </button>
            </div>

            <div className="table-wrapper">
              <table className="table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Category</th>
                    <th>Status</th>
                    <th>Approval</th>
                    <th>Restrictions</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {resources.map((res) => (
                    <tr key={res.id}>
                      <td style={{ fontWeight: 600 }}>{res.name}</td>
                      <td><span className="category-tag">{res.category_name}</span></td>
                      <td>
                        <span className={`status-badge ${res.status.toLowerCase()}`}>
                          {res.status}
                        </span>
                      </td>
                      <td>{res.requires_approval === 1 ? "Required" : "None"}</td>
                      <td style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                        {JSON.parse(res.restricted_roles).length > 0 
                          ? `Restricted: ${JSON.parse(res.restricted_roles).join(', ')}` 
                          : 'None'}
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                          <button 
                            className="btn btn-secondary" 
                            onClick={() => openEditModal(res)}
                            style={{ padding: '0.3rem 0.6rem', fontSize: '0.8rem' }}
                          >
                            <Edit2 size={12} /> Edit
                          </button>
                          <button 
                            className="btn btn-danger" 
                            onClick={() => handleDeleteResource(res.id)}
                            style={{ padding: '0.3rem 0.6rem', fontSize: '0.8rem' }}
                          >
                            <Trash2 size={12} /> Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {activeSubTab === 'settings' && (
        <div style={{ backgroundColor: 'var(--card-bg)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius)', padding: '2rem' }}>
          <h2 style={{ fontSize: '1.25rem', marginBottom: '1.5rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem' }}>
            Advanced Access Rules & Quotas Configuration
          </h2>

          <form onSubmit={handleSaveSettings}>
            
            {/* Quota Settings */}
            <div style={{ marginBottom: '2rem' }}>
              <h3 style={{ fontSize: '1rem', marginBottom: '1rem', color: 'var(--text-color)' }}>1. Booking Quota Limits</h3>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
                <div className="form-group">
                  <label>Undergraduate Max Active Bookings</label>
                  <input
                    type="number"
                    min="1"
                    max="100"
                    className="form-control"
                    value={undergradQuota}
                    onChange={(e) => setUndergradQuota(e.target.value)}
                    required
                  />
                </div>
                <div className="form-group">
                  <label>Graduate Max Active Bookings</label>
                  <input
                    type="number"
                    min="1"
                    max="100"
                    className="form-control"
                    value={gradQuota}
                    onChange={(e) => setGradQuota(e.target.value)}
                    required
                  />
                </div>
              </div>
            </div>

            {/* Waitlist Settings */}
            <div style={{ marginBottom: '2rem' }}>
              <h3 style={{ fontSize: '1rem', marginBottom: '1rem', color: 'var(--text-color)' }}>2. Waitlist Expiration Settings</h3>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '1.5rem' }}>
                <div className="form-group">
                  <label>Waitlist Promotion Claim Window (Minutes)</label>
                  <input
                    type="number"
                    min="1"
                    max="1440"
                    className="form-control"
                    value={waitlistTtl}
                    onChange={(e) => setWaitlistTtl(e.target.value)}
                    required
                  />
                  <small style={{ color: 'var(--text-secondary)', display: 'block', marginTop: '0.25rem' }}>
                    How long (in minutes) a promoted user has to claim their waitlist slot before promotion expires and passes to the next user.
                  </small>
                </div>
              </div>
            </div>

            {/* Priority Score Settings */}
            <div style={{ marginBottom: '2.5rem' }}>
              <h3 style={{ fontSize: '1rem', marginBottom: '1rem', color: 'var(--text-color)' }}>3. Priority Queue Weight System</h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1.25rem', marginBottom: '1.25rem' }}>
                <div className="form-group">
                  <label>Undergraduate Weight</label>
                  <input
                    type="number"
                    className="form-control"
                    value={undergradWeight}
                    onChange={(e) => setUndergradWeight(e.target.value)}
                    required
                  />
                </div>
                <div className="form-group">
                  <label>Graduate Weight</label>
                  <input
                    type="number"
                    className="form-control"
                    value={gradWeight}
                    onChange={(e) => setGradWeight(e.target.value)}
                    required
                  />
                </div>
                <div className="form-group">
                  <label>Staff Weight</label>
                  <input
                    type="number"
                    className="form-control"
                    value={staffWeight}
                    onChange={(e) => setStaffWeight(e.target.value)}
                    required
                  />
                </div>
                <div className="form-group">
                  <label>Admin Weight</label>
                  <input
                    type="number"
                    className="form-control"
                    value={adminWeight}
                    onChange={(e) => setAdminWeight(e.target.value)}
                    required
                  />
                </div>
              </div>
              <div className="form-group">
                <label>Active Bookings Penalty (Modifier)</label>
                <input
                  type="number"
                  className="form-control"
                  value={bookingPenalty}
                  onChange={(e) => setBookingPenalty(e.target.value)}
                  required
                />
                <small style={{ color: 'var(--text-secondary)', display: 'block', marginTop: '0.25rem' }}>
                  Waitlist priority formula: <code>Priority = Base Role Weight - (Total Reservations * Penalty)</code>. Higher priority values queue first.
                </small>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button type="submit" className="btn">
                Apply System Configurations
              </button>
            </div>

          </form>
        </div>
      )}

      {/* Resource Modal */}
      {resourceModal && (
        <div className="modal-backdrop">
          <div className="modal-content">
            <div className="modal-header">
              <h3>{resourceModal === 'create' ? 'Add New Resource' : 'Edit Resource'}</h3>
              <button className="modal-close" onClick={() => setResourceModal(null)}>&times;</button>
            </div>

            <form onSubmit={handleSaveResource}>
              <div className="form-group">
                <label>Resource Name</label>
                <input
                  type="text"
                  className="form-control"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Study Room C"
                  required
                />
              </div>

              <div className="form-group">
                <label>Category</label>
                <select
                  className="form-control"
                  value={categoryId}
                  onChange={(e) => setCategoryId(e.target.value)}
                  required
                >
                  {categories.map((cat) => (
                    <option key={cat.id} value={cat.id}>{cat.name}</option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label>Operation Status</label>
                <select
                  className="form-control"
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                  required
                >
                  <option value="Available">Available</option>
                  <option value="Maintenance">Maintenance</option>
                  <option value="Retired">Retired</option>
                </select>
              </div>

              <div className="form-group" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '1rem' }}>
                <input
                  type="checkbox"
                  id="requires_approval"
                  checked={requiresApproval}
                  onChange={(e) => setRequiresApproval(e.target.checked)}
                />
                <label htmlFor="requires_approval" style={{ margin: 0, cursor: 'pointer' }}>
                  Requires Admin Approval for Booking
                </label>
              </div>

              <div className="form-group" style={{ marginTop: '1.25rem' }}>
                <label>Restricted Roles (Blocked from reservation)</label>
                <div style={{ display: 'flex', gap: '1rem', marginTop: '0.4rem' }}>
                  {rolesList.map((role) => (
                    <label key={role} style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.85rem', textTransform: 'none', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={restrictedRoles.includes(role)}
                        onChange={() => toggleRestrictedRole(role)}
                      />
                      {role}
                    </label>
                  ))}
                </div>
              </div>

              <div className="form-group" style={{ marginTop: '1.25rem' }}>
                <label>Description</label>
                <textarea
                  className="form-control"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Provide specifications, key features..."
                  rows="3"
                />
              </div>

              <div className="form-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setResourceModal(null)}>
                  Cancel
                </button>
                <button type="submit" className="btn">
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
