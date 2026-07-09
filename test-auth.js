import { spawn } from 'child_process';
import { initDb } from './services/shared/db-init.js';

const PORT = 5001;

console.log("Starting temporary server for Authentication and JWT verification...");

// Set up clean database state
await initDb();

const child = spawn('node', ['services/gateway/gateway.js'], {
  env: { ...process.env, PORT: String(PORT) }
});

child.stdout.on('data', (data) => {
  const output = data.toString();
  if (output.includes('API Gateway] Running on port')) {
    runAuthTests();
  }
});

child.stderr.on('data', (data) => {
  console.error(`[Server Error] ${data}`);
});

async function runAuthTests() {
  console.log("\n--- Starting JWT Authentication & Encryption Tests ---");
  let testPassed = true;

  try {
    // 1. Fetch protected resource WITHOUT JWT token (Expect 401 Unauthorized)
    console.log("Test 1: Requesting reservations without Authorization header...");
    const resNoToken = await fetch(`http://localhost:${PORT}/api/reservations`);
    const dataNoToken = await resNoToken.json();
    
    if (resNoToken.status === 401 && dataNoToken.error.includes('missing')) {
      console.log("🟢 Passed: Request correctly blocked with 401 Unauthorized.");
    } else {
      console.log(`🔴 Failed: Expected 401 status, got ${resNoToken.status}. Response:`, dataNoToken);
      testPassed = false;
    }

    // 2. Perform Login with seeded credentials (encrypted check)
    console.log("\nTest 2: Logging in as Alice using secure hashed credentials...");
    const loginRes = await fetch(`http://localhost:${PORT}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'alice@tinkertrack.edu', password: 'pass123' })
    });
    const loginData = await loginRes.json();

    let aliceToken = '';
    if (loginRes.status === 200 && loginData.token) {
      aliceToken = loginData.token;
      console.log("🟢 Passed: Secure login successful. Signed JWT received:", aliceToken.substring(0, 30) + "...");
    } else {
      console.log(`🔴 Failed: Login failed. Status: ${loginRes.status}. Response:`, loginData);
      testPassed = false;
    }

    // 3. Try to login with WRONG password
    console.log("\nTest 3: Attempting login with incorrect password...");
    const badLoginRes = await fetch(`http://localhost:${PORT}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'alice@tinkertrack.edu', password: 'wrongpassword' })
    });
    const badLoginData = await badLoginRes.json();

    if (badLoginRes.status === 401 && badLoginData.error.includes('Invalid')) {
      console.log("🟢 Passed: Login blocked with 401 for incorrect credentials.");
    } else {
      console.log(`🔴 Failed: Allowed bad login or wrong status. Status: ${badLoginRes.status}. Response:`, badLoginData);
      testPassed = false;
    }

    // 4. Fetch protected resource WITH JWT token (Expect 200 OK)
    if (aliceToken) {
      console.log("\nTest 4: Requesting reservations with valid JWT Bearer token...");
      const resWithToken = await fetch(`http://localhost:${PORT}/api/reservations`, {
        headers: { 'Authorization': `Bearer ${aliceToken}` }
      });
      const dataWithToken = await resWithToken.json();

      if (resWithToken.status === 200 && Array.isArray(dataWithToken)) {
        console.log(`🟢 Passed: Request succeeded with 200 OK. Loaded ${dataWithToken.length} reservations.`);
      } else {
        console.log(`🔴 Failed: Request failed. Status: ${resWithToken.status}. Response:`, dataWithToken);
        testPassed = false;
      }
    }

    // Print summary
    if (testPassed) {
      console.log("\n🟢 ALL AUTHENTICATION TESTS PASSED SUCCESSFUL!");
    } else {
      console.log("\n🔴 SOME AUTHENTICATION TESTS FAILED.");
    }

  } catch (error) {
    console.error("Test process aborted with error:", error);
  } finally {
    console.log("Cleaning up test server...");
    child.kill();
    process.exit(testPassed ? 0 : 1);
  }
}
