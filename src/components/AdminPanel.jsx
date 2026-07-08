import React, { useState, useEffect } from 'react';
import { Plus, Edit2, Trash2, Check, X, ShieldAlert } from 'lucide-react';

export default function AdminPanel({ currentUser, showToast, reloadCounter, onReload }) {
  const [resources, setResources] = useState([]);
  const [categories, setCategories] = useState([]);
  const [reservations, setReservations] = useState([]);
  const [resourceModal, setResourceModal] = useState(null); // 'create' | resourceObj (for edit) | null
  
  // Form fields for resource
  const [name, setName] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [status, setStatus] = useState('Available');
  const [requiresApproval, setRequiresApproval] = useState(false);
  const [restrictedRoles, setRestrictedRoles] = useState([]); // Array of restricted role names
  const [description, setDescription] = useState('');

  const rolesList = ['Undergraduate', 'Graduate', 'Staff'];

  useEffect(() => {
    fetch('/api/resources')
      .then((res) => res.json())
      .then((data) => {
        setResources(data.resources);
        setCategories(data.categories);
        if (data.categories.length > 0) {
          setCategoryId(data.categories[0].id.toString());
        }
      })
      .catch((err) => console.error("Error loading resources:", err));

    fetch('/api/reservations')
      .then((res) => res.json())
      .then((data) => setReservations(data))
      .catch((err) => console.error("Error loading reservations:", err));
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

    fetch(endpoint, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name,
        category_id: parseInt(categoryId),
        status,
        requires_approval: requiresApproval,
        restricted_roles: restrictedRoles,
        description,
        requestor_id: currentUser.id
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

    fetch(`/api/resources/${id}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ requestor_id: currentUser.id })
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
    fetch(`/api/admin/reservations/${id}/approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ requestor_id: currentUser.id })
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
    fetch(`/api/admin/reservations/${id}/reject`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ requestor_id: currentUser.id })
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

  const pendingApprovals = reservations.filter(r => r.status === 'PendingApproval');

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Admin Management Console</h1>
        <p className="page-subtitle">Configure resources, handle approval workflows, and override schedules.</p>
      </div>

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
