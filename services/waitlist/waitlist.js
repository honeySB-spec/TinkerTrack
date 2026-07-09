import express from 'express';
import { getDb, getRabbitChannel } from '../shared/shared.js';

const app = express();
app.use(express.json());
const PORT = 5040;

const pool = getDb();

function formatDateTime(d) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// 1. Get Waitlists
app.get('/api/waitlists', async (req, res) => {
  try {
    const waitlistsRes = await pool.query(
      `SELECT w.id, w.user_id, w.resource_id, w.start_time, w.end_time, w.priority_score, w.status, w.promoted_at, w.created_at, res.name as resource_name 
       FROM waitlists w 
       JOIN resources res ON w.resource_id = res.id 
       ORDER BY w.id ASC`
    );
    const formatted = waitlistsRes.rows.map(row => ({
      id: row.id,
      user_id: row.user_id,
      resource_id: row.resource_id,
      start_time: formatDateTime(new Date(row.start_time)),
      end_time: formatDateTime(new Date(row.end_time)),
      priority_score: row.priority_score,
      status: row.status,
      promoted_at: row.promoted_at ? formatDateTime(new Date(row.promoted_at)) : null,
      created_at: formatDateTime(new Date(row.created_at)),
      resource_name: row.resource_name
    }));
    res.json(formatted);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 2. Join Waitlist
app.post('/api/waitlists', async (req, res) => {
  const { resource_id, start_time, end_time } = req.body;
  const user_id = parseInt(req.header('X-User-Id'));
  const user_role = req.header('X-User-Role');

  if (!resource_id || !start_time || !end_time) {
    return res.status(400).json({ error: "Missing required fields." });
  }

  try {
    const userRes = await pool.query(
      `SELECT u.id, u.name, r.name as role_name, r.permissions 
       FROM users u 
       JOIN roles r ON u.role_id = r.id 
       WHERE u.id = $1`,
      [user_id]
    );
    if (userRes.rows.length === 0) {
      return res.status(404).json({ error: "User not found." });
    }

    // Get settings
    const weightsRes = await pool.query("SELECT value FROM settings WHERE key = 'priorityWeights'");
    const priorityWeights = weightsRes.rows[0].value;
    const baseScore = priorityWeights[user_role] !== undefined ? priorityWeights[user_role] : 10;
    const penalty = priorityWeights.bookingPenalty !== undefined ? priorityWeights.bookingPenalty : 1;

    // Small modifier to prioritize users with fewer bookings (fair-use)
    const bookingCountRes = await pool.query("SELECT COUNT(*) FROM reservations WHERE user_id = $1", [user_id]);
    const bookingCount = parseInt(bookingCountRes.rows[0].count);
    const priorityScore = baseScore - (bookingCount * penalty);

    await pool.query(
      `INSERT INTO waitlists (user_id, resource_id, start_time, end_time, priority_score, status) 
       VALUES ($1, $2, $3, $4, $5, 'Waiting')`,
      [user_id, resource_id, start_time, end_time, priorityScore]
    );

    // Publish log activity event
    try {
      const channel = await getRabbitChannel();
      const logMessage = JSON.stringify({
        userId: user_id,
        action: "Join Waitlist",
        details: `Joined waitlist for resource ID: ${resource_id} [Priority: ${priorityScore}]`
      });
      channel.publish('tinkertrack_events', 'activity.log', Buffer.from(logMessage));
    } catch (mqErr) {
      console.error("[RabbitMQ] Error publishing waitlist join log:", mqErr.message);
    }

    res.status(201).json({ message: "Successfully joined waitlist." });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 3. Confirm waitlist promotion
app.post('/api/waitlists/:id/confirm', async (req, res) => {
  const { id } = req.params;
  const user_id = parseInt(req.header('X-User-Id'));

  try {
    const itemRes = await pool.query("SELECT * FROM waitlists WHERE id = $1", [id]);
    if (itemRes.rows.length === 0) {
      return res.status(404).json({ error: "Waitlist item not found." });
    }
    const item = itemRes.rows[0];

    if (item.user_id !== user_id) {
      return res.status(403).json({ error: "Unauthorized." });
    }
    if (item.status !== 'Promoted') {
      return res.status(400).json({ error: "Waitlist entry is not promoted." });
    }

    // Set waitlist item status to Promoted
    // In database, status transitions to completed/closed state: 'Confirmed' (or we keep 'Promoted' but complete the reservation)
    // Wait, the original code had: db.updateWaitlistStatus(id, 'Promoted'); which just updates waitlist status. Let's make waitlist status transition to 'Confirmed' to show it's successfully claimed.
    await pool.query("UPDATE waitlists SET status = 'Confirmed' WHERE id = $1", [id]);

    // Find and confirm the temporary reservation
    await pool.query(
      `UPDATE reservations SET status = 'Confirmed' 
       WHERE user_id = $1 AND resource_id = $2 AND start_time = $3 AND end_time = $4 AND status = 'PendingApproval'`,
      [item.user_id, item.resource_id, item.start_time, item.end_time]
    );

    // Publish log activity
    try {
      const channel = await getRabbitChannel();
      const logMessage = JSON.stringify({
        userId: user_id,
        action: "Confirm Waitlist Booking",
        details: `Confirmed waitlist slot for resource ID: ${item.resource_id}`
      });
      channel.publish('tinkertrack_events', 'activity.log', Buffer.from(logMessage));
    } catch (mqErr) {
      console.error("[RabbitMQ] Error publishing waitlist confirmation log:", mqErr.message);
    }

    res.json({ message: "Reservation confirmed successfully." });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 4. Reject waitlist promotion
app.post('/api/waitlists/:id/reject', async (req, res) => {
  const { id } = req.params;
  const user_id = parseInt(req.header('X-User-Id'));

  try {
    const itemRes = await pool.query("SELECT * FROM waitlists WHERE id = $1", [id]);
    if (itemRes.rows.length === 0) {
      return res.status(404).json({ error: "Waitlist item not found." });
    }
    const item = itemRes.rows[0];

    if (item.user_id !== user_id) {
      return res.status(403).json({ error: "Unauthorized." });
    }
    if (item.status !== 'Promoted' && item.status !== 'Waiting') {
      return res.status(400).json({ error: "Waitlist entry is not in active state." });
    }

    await expireWaitlistPromotion(item);
    res.json({ message: "Declined promotion successfully." });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 5. Test Fast-forward
app.post('/api/test/fast-forward', async (req, res) => {
  try {
    const promotedRes = await pool.query("SELECT * FROM waitlists WHERE status = 'Promoted'");
    let count = 0;
    
    // Set promoted_at back 16 minutes in the past
    for (const item of promotedRes.rows) {
      const pastDate = new Date(Date.now() - 16 * 60 * 1000);
      await pool.query("UPDATE waitlists SET promoted_at = $1 WHERE id = $2", [pastDate, item.id]);
      count++;
    }

    // Trigger check immediately
    await checkWaitlistExpirations();

    res.json({ message: `Fast-forwarded ${count} promoted waitlist items by 15 minutes.` });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Core logic: promote waitlist
async function promoteWaitlist(resourceId, startTime, endTime) {
  const waitlistsRes = await pool.query(
    `SELECT * FROM waitlists 
     WHERE resource_id = $1 AND status = 'Waiting' AND start_time < $2 AND end_time > $3 
     ORDER BY priority_score DESC, created_at ASC`,
    [resourceId, endTime, startTime]
  );
  
  if (waitlistsRes.rows.length === 0) return;

  for (const topMatch of waitlistsRes.rows) {
    // Check if the slot is still free in reservations
    const overlapRes = await pool.query(
      `SELECT * FROM reservations 
       WHERE resource_id = $1 
         AND status IN ('Confirmed', 'PendingApproval', 'CheckedIn')
         AND start_time < $2 
         AND end_time > $3`,
      [resourceId, topMatch.end_time, topMatch.start_time]
    );
    
    if (overlapRes.rows.length === 0) {
      // Promote this user
      await pool.query(
        "UPDATE waitlists SET status = 'Promoted', promoted_at = NOW() WHERE id = $1",
        [topMatch.id]
      );
      
      // Create temporary reservation
      const insertRes = await pool.query(
        `INSERT INTO reservations (user_id, resource_id, start_time, end_time, status) 
         VALUES ($1, $2, $3, $4, 'PendingApproval') RETURNING id`,
        [topMatch.user_id, resourceId, topMatch.start_time, topMatch.end_time]
      );
      const bookingId = insertRes.rows[0].id;
      
      const resNameRes = await pool.query("SELECT name FROM resources WHERE id = $1", [resourceId]);
      const resourceName = resNameRes.rows[0].name;

      // Publish to RabbitMQ so Notification Service creates notification
      try {
        const channel = await getRabbitChannel();
        const eventPayload = JSON.stringify({
          userId: topMatch.user_id,
          type: "WAITLIST_PROMOTION",
          title: "Waitlist Promoted!",
          message: `Your waitlist slot for "${resourceName}" (${formatDateTime(new Date(topMatch.start_time))} - ${formatDateTime(new Date(topMatch.end_time))}) has opened up. Claim it within 15 minutes!`,
          actionable: true,
          actionType: "waitlist_confirm",
          actionData: { waitlistId: topMatch.id, bookingId }
        });
        channel.publish('tinkertrack_events', 'waitlist.promoted', Buffer.from(eventPayload));

        const logPayload = JSON.stringify({
          userId: topMatch.user_id,
          action: "Waitlist Promoted",
          details: `Promoted to claim resource ID: ${resourceId} for ${formatDateTime(new Date(topMatch.start_time))} - ${formatDateTime(new Date(topMatch.end_time))}`
        });
        channel.publish('tinkertrack_events', 'activity.log', Buffer.from(logPayload));
      } catch (mqErr) {
        console.error("[RabbitMQ] Error publishing waitlist.promoted:", mqErr.message);
      }
      break; 
    }
  }
}

// Expire waitlist promotion
async function expireWaitlistPromotion(item) {
  await pool.query("UPDATE waitlists SET status = 'Expired' WHERE id = $1", [item.id]);

  await pool.query(
    `UPDATE reservations SET status = 'Cancelled' 
     WHERE user_id = $1 AND resource_id = $2 AND start_time = $3 AND end_time = $4 AND status = 'PendingApproval'`,
    [item.user_id, item.resource_id, item.start_time, item.end_time]
  );

  try {
    const channel = await getRabbitChannel();
    const logPayload = JSON.stringify({
      userId: item.user_id,
      action: "Waitlist Expired",
      details: `Waitlist promotion expired for resource ID: ${item.resource_id}`
    });
    channel.publish('tinkertrack_events', 'activity.log', Buffer.from(logPayload));
  } catch (mqErr) {
    console.error("[RabbitMQ] Error publishing waitlist expiration log:", mqErr.message);
  }

  // Promote next waitlisted user
  await promoteWaitlist(item.resource_id, item.start_time, item.end_time);
}

// Sweep Expired Promotions
async function checkWaitlistExpirations() {
  try {
    const now = new Date();
    const promotedRes = await pool.query("SELECT * FROM waitlists WHERE status = 'Promoted'");
    
    const ttlRes = await pool.query("SELECT value FROM settings WHERE key = 'waitlistTtlMinutes'");
    const ttlMinutes = parseInt(ttlRes.rows[0].value) || 15;

    for (const item of promotedRes.rows) {
      const promotedAt = new Date(item.promoted_at);
      const diffMinutes = (now - promotedAt) / (1000 * 60);
      if (diffMinutes >= ttlMinutes) {
        await expireWaitlistPromotion(item);
      }
    }
  } catch (err) {
    console.error("Error checking waitlist expirations:", err.message);
  }
}

// Run expiration sweep check every 10 seconds
setInterval(checkWaitlistExpirations, 10000);

// Initialize RabbitMQ Subscriber
async function initRabbitSubscriber() {
  try {
    const channel = await getRabbitChannel();
    
    // Assert and bind Queue
    const q = await channel.assertQueue('waitlist_queue', { durable: true });
    await channel.bindQueue(q.queue, 'tinkertrack_events', 'booking.cancelled');
    await channel.bindQueue(q.queue, 'tinkertrack_events', 'resource.recovered');

    channel.consume(q.queue, async (msg) => {
      if (msg !== null) {
        const routingKey = msg.fields.routingKey;
        const data = JSON.parse(msg.content.toString());

        console.log(`[Waitlist Service] Received RabbitMQ event: ${routingKey}`);

        if (routingKey === 'booking.cancelled') {
          const { resourceId, startTime, endTime } = data;
          await promoteWaitlist(resourceId, startTime, endTime);
        } else if (routingKey === 'resource.recovered') {
          const { resourceId } = data;
          // For recovered resources, scan the waitlist for this resource and promote
          // Scan a broad time range (e.g. from now until 30 days out)
          const startTime = formatDateTime(new Date());
          const endTime = formatDateTime(new Date(Date.now() + 30 * 24 * 60 * 60 * 1000));
          await promoteWaitlist(resourceId, startTime, endTime);
        }

        channel.ack(msg);
      }
    });
    console.log("[Waitlist Service] Subscribed to RabbitMQ booking.cancelled and resource.recovered events");
  } catch (err) {
    console.error("[Waitlist Service] RabbitMQ Subscription failed:", err.message);
    setTimeout(initRabbitSubscriber, 5000);
  }
}

// Start Server and RabbitMQ Subscriber
app.listen(PORT, async () => {
  console.log(`[Waitlist Service] Running on port ${PORT}`);
  // Wait a few seconds for RabbitMQ to start up
  setTimeout(initRabbitSubscriber, 6000);
});
