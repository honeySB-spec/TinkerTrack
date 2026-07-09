# TinkerTrack — Distributed Microservices Resource Booking & Waitlist Management

TinkerTrack is a high-performance, concurrent, and intelligent resource booking and waitlist management platform. Refactored from a monolithic codebase, this repository implements a **Distributed Event-Driven Microservices Architecture** utilizing PostgreSQL, Redis, and RabbitMQ to manage shared resources (study rooms, lab devices, media gear, etc.) for high-demand spaces.

---

## 🚀 Setup & Run Instructions

### 1. Prerequisites
- **Node.js** (v18 or higher)
- **npm** (v9 or higher)
- **Docker & Docker Compose** (to run database and messaging backends)

### 2. Installation
Install the project dependencies:
```bash
npm install
```

### 3. Spin Up Infrastructure Backends
Start the PostgreSQL, Redis, and RabbitMQ services in the background using Docker Compose:
```bash
docker compose up -d
```
This boots:
- **Postgres 14** (listening on host port `5433` to avoid host conflicts)
- **Redis 7** (listening on port `6379`)
- **RabbitMQ 4** (port `5672`, Management UI console on `http://localhost:15672`)

### 4. Initialize & Seed Database
Initialize the database schemas, ranges, constraints, and seed data:
```bash
node services/shared/db-init.js
```

### 5. Running the Application
Start both the microservice backend ecosystem and the Vite React frontend concurrently:
```bash
npm run dev
```
- **Vite React Frontend**: Runs on [http://localhost:5173](http://localhost:5173) (proxies `/api` to port 5005)
- **API Gateway (Proxy & Auth)**: Runs on port `5005`
- **Auth Microservice**: Runs on port `5010`
- **Resource Catalog Microservice**: Runs on port `5020`
- **Reservation Microservice**: Runs on port `5030`
- **Waitlist Priority Microservice**: Runs on port `5040`
- **Notification Microservice**: Runs on port `5050`
- **Analytics Microservice**: Runs on port `5060`

### 6. Running Integration Tests
The tests run a gateway instance on port `5001` that routes to your running backend services. Make sure the backend services are running (`npm run server`) before running tests.

- **Test JWT Auth & PBKDF2 Hashing**:
  ```bash
  node test-auth.js
  ```
- **Test Parallel Concurrency booking**:
  ```bash
  node test-concurrency.js
  ```

---

## 🏛️ System Architecture

TinkerTrack uses a decoupled, event-driven architecture to achieve low-latency scheduling, robust concurrent resource locking, and high horizontal scalability.

```
                                  +------------------------------------+
                                  |         React Client App           |
                                  +-----------------+------------------+
                                                    |  HTTP Requests
                                                    v
                                  +-----------------+------------------+
                                  |         API Gateway (Port 5005)    |
                                  +--------+-----------------+---------+
                                           |                 |
                         +-----------------+                 +-----------------+
                         |                                                     |
+------------------------v--------+   +---------------------------------+      |
|     Auth Service (Port 5010)    |   |   Catalog Service (Port 5020)   |      |
+------------------------+--------+   +---------------------------------+      |
                         |                                                     |
+------------------------v--------+                                            |
|  Reservation Service (Port 5030)|                                            |
+------------------------+--------+                                            |
                         |  Check overlap / Write                              |
                         v                                                     |
+------------------------v-------------------------------------------------v---+
|                                PostgreSQL DB (Port 5433)                     |
+------------------------------------------------------------------------------+
                                         |
                                         v  RabbitMQ Event Channel (Port 5672)
+----------------------------------------+-------------------------------------+
|                                        |                                     |
+------------------------v---------------+  +----------------------------------v
|    Waitlist Service (Port 5040)        |  |    Notification Service (Port 5050)
+----------------------------------------+  +----------------------------------+
|    Analytics Service (Port 5060)       |
+----------------------------------------+
```

### Decoupled Service Interfaces:
1. **API Gateway ([services/gateway/gateway.js](file:///Users/meta/Desktop/tinkeringlab/services/gateway/gateway.js))**: The single entrypoint. It performs stateless JWT verification, matches route endpoints, and decorates proxied HTTP headers with user context (e.g., `X-User-Id`, `X-User-Role`).
2. **Auth Service ([services/auth/auth.js](file:///Users/meta/Desktop/tinkeringlab/services/auth/auth.js))**: Validates profiles, manages register/login, and executes password verification using salted PBKDF2 cryptography.
3. **Catalog Service ([services/catalog/catalog.js](file:///Users/meta/Desktop/tinkeringlab/services/catalog/catalog.js))**: Serves categories and resources. Emits a `resource.recovered` event to RabbitMQ when resources transition from maintenance back to available.
4. **Reservation Service ([services/reservation/reservation.js](file:///Users/meta/Desktop/tinkeringlab/services/reservation/reservation.js))**: Exposes reservation logic. Secures slots via **Redis Locks** (`lock:resource:{id}`) to handle high-contention spikes and delegates integrity rules to Postgres. Emits `booking.cancelled` events when reservations are cancelled.
5. **Waitlist Service ([services/waitlist/waitlist.js](file:///Users/meta/Desktop/tinkeringlab/services/waitlist/waitlist.js))**: Listens to cancelled/recovered events. Automatically evaluates user priority scores, creates a temporary booking (`PendingApproval`), dispatches promotion events, and sweeps expired items.
6. **Notification Service ([services/notifications/notifications.js](file:///Users/meta/Desktop/tinkeringlab/services/notifications/notifications.js))**: Consumes waitlist and booking approval events asynchronously to save persistent alerts and warn users of upcoming bookings.
7. **Analytics Service ([services/analytics/analytics.js](file:///Users/meta/Desktop/tinkeringlab/services/analytics/analytics.js))**: Audits events to save `activity_logs` and runs resource usage analytics.

---

## 🛠️ Key Design Decisions

### 1. Dual-Layer Concurrency Protection
To prevent overlapping schedules under concurrent requests:
- **Layer 1 (Redis Locks)**: The Reservation endpoint attempts to acquire a Redis lock for the requested `resource_id`. If another concurrent request holds it, the api responds immediately with a `409 Conflict`.
- **Layer 2 (Postgres Exclusion Constraints)**: The reservations table employs a Postgres `gist` index range check:
  ```sql
  ALTER TABLE reservations ADD CONSTRAINT no_overlapping_bookings
  EXCLUDE USING gist (
      resource_id WITH =,
      tsrange(start_time, end_time, '[)') WITH &&
  ) WHERE (status IN ('Confirmed', 'PendingApproval', 'CheckedIn'));
  ```
  This guarantees database-level integrity for overlapping half-open (`[)`) timestamps.

### 2. Fair-Use Priority Queue Formula
The Waitlist service evaluates queue positions dynamically based on:
$$\text{Priority Score} = \text{Base Role Weight} - (\text{Total Reservations} \times \text{Active booking Penalty})$$
- Role weights grant higher priority to Staff (30) and Graduates (20) over Undergraduates (10).
- An active booking penalty (default: -1 per active reservation) prevents users from hoarding resources.

### 3. Decoupled Event-Driven Operations
All side-effects of scheduling (e.g. log auditing, alert notifications, waitlist promotions) are decoupled using **RabbitMQ topic exchanges**. For example, when a booking is cancelled:
1. Reservation service updates the status to `Cancelled` and publishes `booking.cancelled` to RabbitMQ.
2. Waitlist service consumes the message asynchronously, determines the next candidate, creates a temporary reservation, and publishes `waitlist.promoted`.
3. Notification service consumes `waitlist.promoted` and inserts a database alert.
This keeps HTTP response times low and system parts loosely coupled.

### 4. Promotion Expiration Sweeper
Promoted users receive a temporary reservation with status `PendingApproval`. To ensure resources aren't locked by inactive waitlist users, a background worker sweeps `waitlists` every 10 seconds. If the `promoted_at` date exceeds the claim window (default: 15 minutes), the promotion is marked `Expired`, the booking is cancelled, and the next user in line is promoted.

---

## 💡 Assumptions Made

1. **Authentication Token Lifecycle**: Authentication is handled by stateless JWT tokens with a 2-hour lifespan. Client requests include the token in the `Authorization: Bearer <token>` header, which the Gateway parses.
2. **Database Schema Isolation**: Each microservice logically manages its own table boundaries. In production, these would be separated into dedicated Postgres schemas or distinct instances.
3. **Gateway Offloading**: Downstream microservices trust headers injected by the Gateway (such as `X-User-Id` and `X-User-Role`) for identity and authorization checks, reducing database lookup overhead inside the microservices.
4. **Time Rounding**: Time expressions used in scheduling and checking overlaps are standardized at the minute boundary.

---

## ✨ Additional Features Implemented

- **Intelligent Scheduling (Alternatives)**: When booking fails due to a conflict, the system suggests alternative resources of the same category, or the next 3 closest available timeslots.
- **Natural Language Processing AI Assistant**: A slide-out sidebar allows booking via queries like *"Book Study Room A tomorrow at 2 PM for 2 hours"*, parsing dates/times and rendering one-click booking buttons.
- **Settings overrides**: Admin dashboard to change quotas, weights, and TTLs in real-time.
- **Analytics aggregation**: Dashboard charts displaying utilization and popular hours calculated via time-series aggregates in Postgres.
