import express from 'express';
import { getDb, getRabbitChannel } from '../shared/shared.js';

const app = express();
app.use(express.json());
const PORT = 5020;

const pool = getDb();

// Helper to format resources to match frontend expectations
function formatResource(row) {
  return {
    id: row.id,
    category_id: row.category_id,
    name: row.name,
    status: row.status,
    requires_approval: row.requires_approval ? 1 : 0,
    restricted_roles: JSON.stringify(row.restricted_roles || []),
    description: row.description
  };
}

// 1. Get resources and categories
app.get('/api/resources', async (req, res) => {
  try {
    const resourcesRes = await pool.query("SELECT * FROM resources ORDER BY id ASC");
    const categoriesRes = await pool.query("SELECT * FROM categories ORDER BY id ASC");

    const resources = resourcesRes.rows.map(formatResource);
    const categories = categoriesRes.rows;

    res.json({ resources, categories });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 2. Create resource (Admin only)
app.post('/api/resources', async (req, res) => {
  const role = req.header('X-User-Role');
  const userId = req.header('X-User-Id');

  if (role !== 'Admin') {
    return res.status(403).json({ error: "Access denied. Admin role required." });
  }

  const { name, category_id, status, requires_approval, restricted_roles, description } = req.body;
  if (!name || !category_id) {
    return res.status(400).json({ error: "Missing required fields (name, category_id)." });
  }

  try {
    const isApproval = requires_approval === 1 || requires_approval === true;
    const rolesArray = Array.isArray(restricted_roles) ? restricted_roles : JSON.parse(restricted_roles || '[]');

    const insertRes = await pool.query(
      `INSERT INTO resources (category_id, name, status, requires_approval, restricted_roles, description) 
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
      [category_id, name, status || 'Available', isApproval, rolesArray, description]
    );

    const newId = insertRes.rows[0].id;

    // Log Activity via RabbitMQ
    try {
      const channel = await getRabbitChannel();
      const logMessage = JSON.stringify({
        userId: parseInt(userId),
        action: "Create Resource",
        details: `Created resource ${name} (ID: ${newId})`
      });
      channel.publish('tinkertrack_events', 'resource.created', Buffer.from(logMessage));
    } catch (mqErr) {
      console.error("[RabbitMQ] Error publishing resource.created log:", mqErr.message);
    }

    res.status(201).json({
      id: newId,
      name,
      category_id,
      status: status || 'Available',
      requires_approval: isApproval ? 1 : 0,
      restricted_roles: JSON.stringify(rolesArray),
      description
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// 3. Update resource (Admin only)
app.put('/api/resources/:id', async (req, res) => {
  const role = req.header('X-User-Role');
  const userId = req.header('X-User-Id');

  if (role !== 'Admin') {
    return res.status(403).json({ error: "Access denied. Admin role required." });
  }

  const { id } = req.params;
  const { name, category_id, status, requires_approval, restricted_roles, description } = req.body;

  try {
    const oldRes = await pool.query("SELECT * FROM resources WHERE id = $1", [id]);
    if (oldRes.rows.length === 0) {
      return res.status(404).json({ error: "Resource not found" });
    }
    const oldResource = oldRes.rows[0];

    const isApproval = requires_approval === 1 || requires_approval === true;
    const rolesArray = Array.isArray(restricted_roles) ? restricted_roles : JSON.parse(restricted_roles || '[]');

    await pool.query(
      `UPDATE resources 
       SET name = $1, category_id = $2, status = $3, requires_approval = $4, restricted_roles = $5, description = $6 
       WHERE id = $7`,
      [name, category_id, status, isApproval, rolesArray, description, id]
    );

    // Log Activity via RabbitMQ
    try {
      const channel = await getRabbitChannel();
      const logMessage = JSON.stringify({
        userId: parseInt(userId),
        action: "Update Resource",
        details: `Updated resource ${name} (ID: ${id})`
      });
      channel.publish('tinkertrack_events', 'resource.updated', Buffer.from(logMessage));

      // Trigger Waitlist promotion if resource transitions back to Available
      if (oldResource.status !== 'Available' && status === 'Available') {
        const recoveryMessage = JSON.stringify({
          resourceId: parseInt(id),
          resourceName: name
        });
        channel.publish('tinkertrack_events', 'resource.recovered', Buffer.from(recoveryMessage));
      }
    } catch (mqErr) {
      console.error("[RabbitMQ] Error publishing resource.updated events:", mqErr.message);
    }

    res.json({ message: "Resource updated successfully" });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// 4. Delete resource (Admin only)
app.delete('/api/resources/:id', async (req, res) => {
  const role = req.header('X-User-Role');
  const userId = req.header('X-User-Id');

  if (role !== 'Admin') {
    return res.status(403).json({ error: "Access denied. Admin role required." });
  }

  const { id } = req.params;

  try {
    await pool.query("DELETE FROM resources WHERE id = $1", [id]);

    // Log Activity via RabbitMQ
    try {
      const channel = await getRabbitChannel();
      const logMessage = JSON.stringify({
        userId: parseInt(userId),
        action: "Delete Resource",
        details: `Deleted resource ID: ${id}`
      });
      channel.publish('tinkertrack_events', 'resource.deleted', Buffer.from(logMessage));
    } catch (mqErr) {
      console.error("[RabbitMQ] Error publishing resource.deleted log:", mqErr.message);
    }

    res.json({ message: "Resource deleted successfully" });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`[Catalog Service] Running on port ${PORT}`);
});
