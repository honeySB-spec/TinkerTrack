import express from 'express';
import { getDb, getRabbitChannel } from '../shared/shared.js';

const app = express();
app.use(express.json());
const PORT = 5050;

const pool = getDb();

function formatDateTime(d) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

async function ensureNotificationExists(userId, type, title, message, actionable, actionType, actionData) {
  const check = await pool.query(
    `SELECT * FROM notifications 
     WHERE user_id = $1 AND type = $2 AND action_data = $3`,
    [userId, type, JSON.stringify(actionData)]
  );

  if (check.rows.length === 0) {
    await pool.query(
      `INSERT INTO notifications (user_id, type, title, message, actionable, action_type, action_data) 
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [userId, type, title, message, actionable, actionType, JSON.stringify(actionData)]
    );
  }
}

// 1. Get Notifications
app.get('/api/notifications', async (req, res) => {
  const userId = parseInt(req.header('X-User-Id'));
  const role = req.header('X-User-Role');

  if (!userId) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const now = new Date();
    const nowStr = formatDateTime(now);
    const twoHoursLaterStr = formatDateTime(new Date(now.getTime() + 2 * 60 * 60 * 1000));

    // A. Waitlist Promotions
    const promotedRes = await pool.query(
      `SELECT w.id, w.start_time, w.end_time, r.name as resource_name 
       FROM waitlists w 
       JOIN resources r ON w.resource_id = r.id 
       WHERE w.user_id = $1 AND w.status = 'Promoted'`,
      [userId]
    );

    for (const item of promotedRes.rows) {
      await ensureNotificationExists(
        userId,
        'WAITLIST_PROMOTION',
        'Waitlist Promoted!',
        `Your waitlist slot for "${item.resource_name}" (${formatDateTime(new Date(item.start_time))} - ${formatDateTime(new Date(item.end_time))}) has opened up. You have 15 minutes to claim it!`,
        true,
        'waitlist_confirm',
        { waitlistId: item.id }
      );
    }

    // B. Check for upcoming bookings
    const upcomingRes = await pool.query(
      `SELECT r.id, r.start_time, res.name as resource_name 
       FROM reservations r 
       JOIN resources res ON r.resource_id = res.id 
       WHERE r.user_id = $1 AND r.status = 'Confirmed' AND r.start_time >= $2 AND r.start_time <= $3`,
      [userId, nowStr, twoHoursLaterStr]
    );

    for (const item of upcomingRes.rows) {
      await ensureNotificationExists(
        userId,
        'UPCOMING_RESERVATION',
        'Upcoming Reservation',
        `Your reservation for "${item.resource_name}" starts at ${formatDateTime(new Date(item.start_time))}. Remember to check in!`,
        false,
        null,
        { bookingId: item.id }
      );
    }

    // C. Admin notifications (pending approvals)
    if (role === 'Admin') {
      const pendingRes = await pool.query(
        `SELECT r.id, r.start_time, r.end_time, res.name as resource_name, u.name as user_name 
         FROM reservations r 
         JOIN resources res ON r.resource_id = res.id 
         JOIN users u ON r.user_id = u.id 
         WHERE r.status = 'PendingApproval'`
      );

      for (const item of pendingRes.rows) {
        await ensureNotificationExists(
          userId,
          'PENDING_APPROVAL',
          'Pending Admin Approval',
          `User ${item.user_name} has requested "${item.resource_name}" for ${formatDateTime(new Date(item.start_time))} - ${formatDateTime(new Date(item.end_time))}.`,
          true,
          'admin_approve',
          { bookingId: item.id }
        );
      }
    }

    // Return notifications
    const finalNotifsRes = await pool.query(
      "SELECT * FROM notifications WHERE user_id = $1 ORDER BY id DESC",
      [userId]
    );

    const formatted = finalNotifsRes.rows.map(row => ({
      id: row.id,
      user_id: row.user_id,
      type: row.type,
      title: row.title,
      message: row.message,
      read: row.read,
      actionable: row.actionable,
      actionType: row.action_type,
      actionData: row.action_data,
      created_at: formatDateTime(new Date(row.created_at))
    }));

    res.json(formatted);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 2. Mark read
app.post('/api/notifications/:id/read', async (req, res) => {
  const { id } = req.params;
  try {
    await pool.query("UPDATE notifications SET read = TRUE WHERE id = $1", [id]);
    res.json({ message: "Notification marked as read." });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 3. Mark all read
app.post('/api/notifications/read-all', async (req, res) => {
  const userId = parseInt(req.header('X-User-Id'));
  try {
    await pool.query("UPDATE notifications SET read = TRUE WHERE user_id = $1", [userId]);
    res.json({ message: "All notifications marked as read." });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// RabbitMQ Subscriber
async function initRabbitSubscriber() {
  try {
    const channel = await getRabbitChannel();
    
    const q = await channel.assertQueue('notification_queue', { durable: true });
    await channel.bindQueue(q.queue, 'tinkertrack_events', 'waitlist.promoted');
    await channel.bindQueue(q.queue, 'tinkertrack_events', 'booking.approved');
    await channel.bindQueue(q.queue, 'tinkertrack_events', 'booking.rejected');

    channel.consume(q.queue, async (msg) => {
      if (msg !== null) {
        const routingKey = msg.fields.routingKey;
        const data = JSON.parse(msg.content.toString());

        console.log(`[Notification Service] Received RabbitMQ event: ${routingKey}`);

        const { userId, type, title, message, actionable, actionType, actionData } = data;
        
        await pool.query(
          `INSERT INTO notifications (user_id, type, title, message, actionable, action_type, action_data) 
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [userId, type, title, message, actionable || false, actionType || null, JSON.stringify(actionData || null)]
        );

        channel.ack(msg);
      }
    });
    console.log("[Notification Service] Subscribed to RabbitMQ notifications topics");
  } catch (err) {
    console.error("[Notification Service] RabbitMQ Subscription failed:", err.message);
    setTimeout(initRabbitSubscriber, 5000);
  }
}

app.listen(PORT, () => {
  console.log(`[Notification Service] Running on port ${PORT}`);
  setTimeout(initRabbitSubscriber, 6000);
});
