import http from 'http';
import db from './db.js';

// We import the server's listener by starting a temporary server instance
// To avoid conflicts, we'll run the API logic directly by mocking a fast server or making direct concurrent calls to our backend!
// Since we want to test our backend's Express endpoints under actual concurrency:
const PORT = 5001;

console.log("Starting temporary test server on port 5001...");

// Set up clean database state for test
// Delete any existing bookings for resource ID 1 on our test slot date
db.transaction(() => {
  db.save(); // Save current state
})();

// We will send mock concurrent requests directly to the express listener
// Let's dynamically import the express app but run it on 5001.
// To do this, we can start our server.js in another process, or just start it here by setting process.env.PORT.
// Or even simpler: we can test the concurrency of the db.createReservation function itself!
// Wait! testing the API endpoint is much better because it tests both the Lock Manager (Layer 1) and the DB constraints (Layer 3) under concurrent event loop ticks.
// Let's launch a child process of server.js on port 5001.

import { spawn } from 'child_process';

const child = spawn('node', ['server.js'], {
  env: { ...process.env, PORT: String(PORT) }
});

child.stdout.on('data', (data) => {
  const output = data.toString();
  if (output.includes('API Server running')) {
    runConcurrencyTest();
  }
});

child.stderr.on('data', (data) => {
  console.error(`[Server Error] ${data}`);
});

async function runConcurrencyTest() {
  console.log("\n--- Starting Concurrency Test ---");
  console.log("Simulating 2 users booking the same slot at the exact same millisecond...");

  const testBooking = {
    user_id: 1, // Alice
    resource_id: 1, // Study Room A
    start_time: "2026-07-20 14:00",
    end_time: "2026-07-20 15:00"
  };

  // Ensure database has no conflicting active bookings for this slot before we start
  const existing = db.getReservations().filter(r => 
    r.resource_id === 1 && 
    r.start_time === testBooking.start_time && 
    ['Confirmed', 'PendingApproval', 'CheckedIn'].includes(r.status)
  );
  for (const r of existing) {
    db.updateReservationStatus(r.id, 'Cancelled');
  }

  console.log(`Sending concurrent requests to http://localhost:${PORT}/api/reservations ...`);
  
  // We send two fetch requests simultaneously
  const p1 = fetch(`http://localhost:${PORT}/api/reservations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(testBooking)
  });

  const p2 = fetch(`http://localhost:${PORT}/api/reservations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
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
