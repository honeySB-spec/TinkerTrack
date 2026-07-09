import pg from 'pg';
import crypto from 'crypto';

const pgConfig = {
  host: process.env.PGHOST || 'localhost',
  port: process.env.PGPORT || 5433,
  database: process.env.PGDATABASE || 'tinkertrack',
  user: process.env.PGUSER || 'postgres',
  password: process.env.PGPASSWORD || 'password123',
};

async function initDb() {
  const pool = new pg.Pool(pgConfig);
  let client;
  
  // Retry connection
  for (let i = 0; i < 15; i++) {
    try {
      client = await pool.connect();
      console.log("Connected to PostgreSQL successfully.");
      break;
    } catch (e) {
      console.log(`Waiting for PostgreSQL to be ready... (${i + 1}/15)`);
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }

  if (!client) {
    console.error("Could not connect to PostgreSQL after 15 retries.");
    process.exit(1);
  }

  try {
    await client.query("BEGIN");
    
    // Create extension
    await client.query("CREATE EXTENSION IF NOT EXISTS btree_gist;");

    // Drop tables if they exist
    await client.query("DROP TABLE IF EXISTS activity_logs CASCADE;");
    await client.query("DROP TABLE IF EXISTS notifications CASCADE;");
    await client.query("DROP TABLE IF EXISTS waitlists CASCADE;");
    await client.query("DROP TABLE IF EXISTS reservations CASCADE;");
    await client.query("DROP TABLE IF EXISTS resources CASCADE;");
    await client.query("DROP TABLE IF EXISTS categories CASCADE;");
    await client.query("DROP TABLE IF EXISTS users CASCADE;");
    await client.query("DROP TABLE IF EXISTS roles CASCADE;");
    await client.query("DROP TABLE IF EXISTS settings CASCADE;");

    // Create Tables
    await client.query(`
      CREATE TABLE roles (
        id SERIAL PRIMARY KEY,
        name VARCHAR(50) UNIQUE NOT NULL,
        permissions TEXT[] NOT NULL
      );
    `);

    await client.query(`
      CREATE TABLE users (
        id SERIAL PRIMARY KEY,
        role_id INT REFERENCES roles(id) ON DELETE RESTRICT,
        name VARCHAR(100) NOT NULL,
        email VARCHAR(100) UNIQUE NOT NULL,
        password_hash VARCHAR(256) NOT NULL,
        salt VARCHAR(64) NOT NULL
      );
    `);

    await client.query(`
      CREATE TABLE categories (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100) UNIQUE NOT NULL,
        description TEXT
      );
    `);

    await client.query(`
      CREATE TABLE resources (
        id SERIAL PRIMARY KEY,
        category_id INT REFERENCES categories(id) ON DELETE CASCADE,
        name VARCHAR(100) NOT NULL,
        status VARCHAR(50) DEFAULT 'Available',
        requires_approval BOOLEAN DEFAULT FALSE,
        restricted_roles TEXT[] DEFAULT '{}',
        description TEXT
      );
    `);

    await client.query(`
      CREATE TABLE reservations (
        id SERIAL PRIMARY KEY,
        user_id INT REFERENCES users(id) ON DELETE CASCADE,
        resource_id INT REFERENCES resources(id) ON DELETE CASCADE,
        start_time TIMESTAMP NOT NULL,
        end_time TIMESTAMP NOT NULL,
        status VARCHAR(50) DEFAULT 'Confirmed'
      );
    `);

    // overlapping exclusion constraint
    await client.query(`
      ALTER TABLE reservations ADD CONSTRAINT no_overlapping_bookings
      EXCLUDE USING gist (
        resource_id WITH =,
        tsrange(start_time, end_time, '[)') WITH &&
      ) WHERE (status IN ('Confirmed', 'PendingApproval', 'CheckedIn'));
    `);

    await client.query(`
      CREATE TABLE waitlists (
        id SERIAL PRIMARY KEY,
        user_id INT REFERENCES users(id) ON DELETE CASCADE,
        resource_id INT REFERENCES resources(id) ON DELETE CASCADE,
        start_time TIMESTAMP NOT NULL,
        end_time TIMESTAMP NOT NULL,
        priority_score INT DEFAULT 0,
        status VARCHAR(50) DEFAULT 'Waiting',
        promoted_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await client.query(`
      CREATE TABLE notifications (
        id SERIAL PRIMARY KEY,
        user_id INT REFERENCES users(id) ON DELETE CASCADE,
        type VARCHAR(50) NOT NULL,
        title VARCHAR(256) NOT NULL,
        message TEXT NOT NULL,
        read BOOLEAN DEFAULT FALSE,
        actionable BOOLEAN DEFAULT FALSE,
        action_type VARCHAR(50),
        action_data JSONB,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await client.query(`
      CREATE TABLE activity_logs (
        id SERIAL PRIMARY KEY,
        user_id INT REFERENCES users(id) ON DELETE SET NULL,
        action VARCHAR(100) NOT NULL,
        details TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await client.query(`
      CREATE TABLE settings (
        key VARCHAR(100) PRIMARY KEY,
        value JSONB NOT NULL
      );
    `);

    // SEEDING ROLES
    await client.query(`
      INSERT INTO roles (id, name, permissions) VALUES
      (1, 'Undergraduate', ARRAY['read', 'reserve']),
      (2, 'Graduate', ARRAY['read', 'reserve', 'bypass_approval']),
      (3, 'Staff', ARRAY['read', 'reserve', 'bypass_approval', 'unlimited_quota']),
      (4, 'Admin', ARRAY['read', 'reserve', 'bypass_approval', 'unlimited_quota', 'admin']);
    `);
    await client.query("SELECT setval('roles_id_seq', 4);");

    // SEEDING USERS
    const saltAlice = crypto.randomBytes(16).toString('hex');
    const saltBob = crypto.randomBytes(16).toString('hex');
    const saltCharlie = crypto.randomBytes(16).toString('hex');
    const saltDavid = crypto.randomBytes(16).toString('hex');

    const passAlice = crypto.pbkdf2Sync("pass123", saltAlice, 10000, 64, 'sha512').toString('hex');
    const passBob = crypto.pbkdf2Sync("pass123", saltBob, 10000, 64, 'sha512').toString('hex');
    const passCharlie = crypto.pbkdf2Sync("pass123", saltCharlie, 10000, 64, 'sha512').toString('hex');
    const passDavid = crypto.pbkdf2Sync("admin123", saltDavid, 10000, 64, 'sha512').toString('hex');

    await client.query(`
      INSERT INTO users (id, role_id, name, email, password_hash, salt) VALUES
      (1, 1, 'Alice (Undergrad)', 'alice@tinkertrack.edu', $1, $2),
      (2, 2, 'Bob (Graduate)', 'bob@tinkertrack.edu', $3, $4),
      (3, 3, 'Charlie (Staff)', 'charlie@tinkertrack.edu', $5, $6),
      (4, 4, 'David (Admin)', 'admin@tinkertrack.edu', $7, $8);
    `, [passAlice, saltAlice, passBob, saltBob, passCharlie, saltCharlie, passDavid, saltDavid]);
    await client.query("SELECT setval('users_id_seq', 4);");

    // SEEDING CATEGORIES
    await client.query(`
      INSERT INTO categories (id, name, description) VALUES
      (1, 'Meeting Spaces', 'Rooms and areas for group work or study.'),
      (2, 'Lab Equipment', 'High-value laboratory instruments and tools.'),
      (3, 'Media Gear', 'Cameras, audio recorders, and presentation tools.');
    `);
    await client.query("SELECT setval('categories_id_seq', 3);");

    // SEEDING RESOURCES
    await client.query(`
      INSERT INTO resources (id, category_id, name, status, requires_approval, restricted_roles, description) VALUES
      (1, 1, 'Study Room A', 'Available', FALSE, '{}', 'Collaborative study room for up to 4 people. Has whiteboard.'),
      (2, 1, 'Study Room B', 'Available', FALSE, '{}', 'Collaborative study room for up to 6 people. Has TV screen.'),
      (3, 1, 'Conference Room', 'Available', TRUE, '{}', 'Large conference room. Requires approval for non-staff.'),
      (4, 2, 'Ultimaker 3D Printer', 'Available', TRUE, '{}', 'FDM 3D printer. High-demand resource, requires training approval.'),
      (5, 2, 'Zeiss Electron Microscope', 'Available', TRUE, ARRAY['Undergraduate'], 'Restricted to Graduates and Staff only. Requires admin approval.'),
      (6, 2, 'Tektronix Oscilloscope', 'Available', FALSE, '{}', '100MHz Digital Oscilloscope for hardware debugging.'),
      (7, 3, 'Canon EOS R5 DSLR', 'Available', FALSE, '{}', 'High-resolution full-frame mirrorless camera with 24-70mm lens.'),
      (8, 3, 'Epson 4K Projector', 'Available', FALSE, '{}', 'Portable ultra-short throw projector.');
    `);
    await client.query("SELECT setval('resources_id_seq', 8);");

    // SEEDING SETTINGS
    const settings = {
      quotas: {
        Undergraduate: 2,
        Graduate: 5,
        Staff: 999,
        Admin: 999
      },
      priorityWeights: {
        Undergraduate: 10,
        Graduate: 20,
        Staff: 30,
        Admin: 40,
        bookingPenalty: 1
      },
      waitlistTtlMinutes: 15
    };
    await client.query(`
      INSERT INTO settings (key, value) VALUES
      ('quotas', $1),
      ('priorityWeights', $2),
      ('waitlistTtlMinutes', $3);
    `, [JSON.stringify(settings.quotas), JSON.stringify(settings.priorityWeights), settings.waitlistTtlMinutes]);

    await client.query("COMMIT");
    console.log("Database initialized and seeded successfully!");
  } catch (err) {
    if (client) {
      await client.query("ROLLBACK");
    }
    console.error("Database initialization failed:", err);
  } finally {
    if (client) {
      client.release();
    }
    await pool.end();
  }
}

// If run directly
if (import.meta.url === `file://${process.argv[1]}` || (process.argv[1] && process.argv[1].endsWith('db-init.js'))) {
  initDb();
}

export { initDb };
