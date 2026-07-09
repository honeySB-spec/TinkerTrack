# TinkerTrack — Distributed Microservices Resource Booking & Waitlist Management

TinkerTrack is a high-performance, concurrent, and intelligent resource booking and waitlist management platform. Refactored from a monolithic codebase, this repository implements a **Distributed Event-Driven Microservices Architecture** utilizing PostgreSQL, Redis, and RabbitMQ to manage shared resources (study rooms, lab devices, media gear, etc.) for high-demand spaces.

---

## 🛠️ Technology Stack

TinkerTrack is built on a decoupled, production-grade stack to ensure high performance, reliable message delivery, and robust concurrency handling:

### Backend Services
- **Runtime Environment**: **Node.js** (v18+) with **Express** (v4) for microservice APIs.
- **API Gateway & Routing**: Built using `express-http-proxy` to act as a single entrypoint with state-agnostic JWT validation.
- **AI Engine**: Integrated with **Google Gemini API** for natural language conversational booking processing.

### Databases & Cache
- **Primary Relational Database**: **PostgreSQL 14** (leveraging native `tsrange` types, `gist` index exclusion constraints, and complex time-series queries).
- **Distributed Cache / Lock Registry**: **Redis 7** (for low-latency distributed mutex locks to handle concurrent reservation contention).

### Messaging Broker
- **Event Bus / Message Broker**: **RabbitMQ 4** (running a topic exchange named `tinkertrack_events` to manage asynchronous event propagation like waitlist auto-promotion, analytics, and notification processing).

### Frontend Application
- **Build Tool**: **Vite 6** (fast bundler and dev server).
- **Library**: **React 19** (declarative component structure for the dynamic user interface).
- **Icons & Styling**: **Lucide React** for icons, styled with vanilla **CSS variables** for custom layouts, grids, and themes.

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
- **AI Microservice (Gemini)**: Runs on port `5070`

### 6. Default Test Users
Once the database is initialized and seeded, you can sign in to the web application or run tests with the following accounts:

| User | Role | Email | Password |
| :--- | :--- | :--- | :--- |
| **David (Admin)** | Admin | `admin@tinkertrack.edu` | `admin123` |
| Charlie (Staff) | Staff | `charlie@tinkertrack.edu` | `pass123` |
| Bob (Graduate) | Graduate | `bob@tinkertrack.edu` | `pass123` |
| Alice (Undergrad) | Undergraduate | `alice@tinkertrack.edu` | `pass123` |

### 7. Running Integration Tests
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
8. **AI Service ([services/ai/ai.js](file:///Users/meta/Desktop/tinkeringlab/services/ai/ai.js))**: Conversational scheduling assistant. Leverages Google Gemini API to interpret natural language requests, checks timeslots and roles against current DB state, recommends alternatives, and returns structured booking actions.

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

## ✨ Key Platform Features

TinkerTrack provides a comprehensive ecosystem for high-concurrency resource management:

### 1. Core Scheduling & Reservation Engine
- **Visual Reservation Calendar**: Interactive scheduling grid allowing users to view real-time availability and request specific reservation slots.
- **Smart Slot Recommendations**: If a requested slot is occupied, the system automatically suggests the next 3 closest available timeslots or alternative resources in the same category.
- **Interactive Claims**: Streamlined check-in, completion, and cancellation workflows for active reservations directly from the user dashboard.

### 2. Distributed Microservices Architecture
- **API Gateway**: Single entrypoint routing, stateless JWT validation, and context injection (user ID, roles) into downstream microservice request headers.
- **Dedicated Auth Service**: Manages secure user profiles and registrations with secure salted PBKDF2 password hashing.
- **Resource Catalog Service**: Manages resource metadata, categories, role-based availability constraints, and maintenance statuses.
- **Decoupled Event Channels**: Powered by RabbitMQ topic exchanges to run analytics, send notifications, and handle waitlist promotions asynchronously.

### 3. High-Concurrency & Overlap Protection
- **Distributed Redis Locks**: Prevents scheduling race conditions under concurrent spikes by locking resources before checking availability or writing.
- **Postgres Exclusion Constraints**: Leverages GIST indices and `tsrange` checks to guarantee database-level integrity for overlapping half-open (`[)`) timestamps.

### 4. Dynamic Fair-Use Waitlist Queue
- **Dynamic Priority Formula**: Queue positions are computed dynamically based on the user's role weight (e.g., Staff: 30, Grad: 20, Undergrad: 10) minus active booking penalties to prevent resource hoarding.
- **Auto-Promotion Engine**: Automatically promotes the highest-priority waitlisted candidate when a booking is cancelled or a resource recovered.
- **Claim Timeouts (TTL)**: Automatically sweeps expired promotions after a 15-minute claim window using a background worker, promoting the next user in line.

### 5. Gemini AI Scheduling Assistant
- **Natural Language Parsing**: An integrated AI sidebar that translates user expressions (e.g., *"Book Lab Device B tomorrow at 3 PM for 1 hour"*) into absolute timestamps.
- **Real-Time Database Verification**: Checks availability and role restrictions on the fly, offering direct inline action buttons to book or join the waitlist.

### 6. Admin Controls & System Overrides
- **Dynamic Settings Configuration**: Live adjustment of booking quotas, waitlist expiration claim windows, role weights, and active booking penalties.
- **Maintenance State Management**: Ability to mark resources as unavailable or transition them back to available, triggering automatic waitlist promotions.

### 7. Time-Series Analytics Dashboard
- **Usage Metrics Charts**: Visual analytics representing resource utilization rates and popular scheduling hours calculated via Postgres time-series aggregates.
- **Audit Logging**: Asynchronously tracked user action and activity logs compiled by the Analytics service.

