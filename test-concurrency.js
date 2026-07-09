import { spawn } from 'child_process';
import { initDb } from './services/shared/db-init.js';

const PORT = 5001;

console.log("Starting temporary test server on port 5001...");

// Set up clean database state for test
await initDb();

const child = spawn('node', ['services/gateway/gateway.js'], {
  env: { ...process.env, PORT: String(PORT) }
});

child.stdout.on('data', (data) => {
  const output = data.toString();
  if (output.includes('API Gateway] Running on port')) {
    runConcurrencyTest();
  }
});

child.stderr.on('data', (data) => {
  console.error(`[Server Error] ${data}`);
});

async function runConcurrencyTest() {
  console.log("\n--- Starting Concurrency Test ---");
  
  // Log in to obtain JWT token first
  let token = '';
  try {
    const loginRes = await fetch(`http://localhost:${PORT}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'alice@tinkertrack.edu', password: 'pass123' })
    });
    const loginData = await loginRes.json();
    token = loginData.token;
  } catch (err) {
    console.error("Login failed before concurrency test", err);
  }

  if (!token) {
    console.log("🔴 FAILURE: Could not obtain JWT token for test.");
    child.kill();
    process.exit(1);
  }

  console.log("Simulating 2 users booking the same slot at the exact same millisecond...");

  const testBooking = {
    user_id: 1, // Alice
    resource_id: 1, // Study Room A
    start_time: "2026-07-20 14:00",
    end_time: "2026-07-20 15:00"
  };

  console.log(`Sending concurrent requests to http://localhost:${PORT}/api/reservations ...`);
  
  // We send two fetch requests simultaneously
  const p1 = fetch(`http://localhost:${PORT}/api/reservations`, {
    method: 'POST',
    headers: { 
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify(testBooking)
  });

  const p2 = fetch(`http://localhost:${PORT}/api/reservations`, {
    method: 'POST',
    headers: { 
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify(testBooking)
  });

  try {
    const [res1, res2] = await Promise.all([p1, p2]);
    const data1 = await res1.json();
    const data2 = await res2.json();

    console.log(`\nResponse 1 (Status ${res1.status}):`, data1);
    console.log(`Response 2 (Status ${res2.status}):`, data2);

    const statuses = [res1.status, res2.status];
    const createdCount = statuses.filter(s => s === 201).length;
    const conflictCount = statuses.filter(s => s === 409).length;

    console.log("\n--- Assertions ---");
    console.log(`- Succeeded bookings (Expected: 1): ${createdCount}`);
    console.log(`- Blocked double-bookings (Expected: 1): ${conflictCount}`);

    if (createdCount === 1 && conflictCount === 1) {
      console.log("\n🟢 SUCCESS: Concurrency controls successfully prevented double-booking!");
    } else {
      console.log("\n🔴 FAILURE: Double booking occurred or requests failed unexpectedly.");
    }

  } catch (error) {
    console.error("Test execution failed:", error);
  } finally {
    console.log("Shutting down test server...");
    child.kill();
    process.exit(0);
  }
}
