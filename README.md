# taddle-box API

Production-grade social community platform API built with **Node.js 20**, **Express 5**, **PostgreSQL** (raw SQL, no ORM), **Redis**, **Socket.io**, **BullMQ**, **Vimeo**, **Razorpay**, and **AWS S3 + CloudFront**.

---

## Architecture

```
Request → Route → Controller → Service → Repository → PostgreSQL
                                       ↓
                                  Integration  (when an external API call is needed)
```

```
src/
├── config/           # DB pool, Redis, S3, Vimeo, Razorpay, Nodemailer client setup
├── middlewares/      # auth, RBAC, rate-limiter, Zod validator, logger, upload
├── validators/       # Zod schemas — one file per domain
├── models/           # Field constants + format() + sanitize() — NO DB calls
├── repositories/     # Raw parameterized SQL queries — one file per table
├── services/         # Business logic — orchestrates repos + integrations
├── integrations/     # External third-party adapters
│   ├── email/        #   Nodemailer (AWS SES) + HTML templates
│   ├── oauth/        #   Google OAuth ID token verification
│   ├── payment/      #   Razorpay order creation + HMAC verification
│   ├── storage/      #   AWS S3 pre-signed URLs + CloudFront CDN
│   └── video/        #   Vimeo TUS direct upload
├── controllers/      # Thin — extract params, call service, send response
├── routes/           # Express routers — no logic, only middleware chains
├── sockets/          # Socket.io server + real-time notification/wallet events
├── jobs/
│   ├── queues/       # BullMQ queue definitions (email, notification, video)
│   └── workers/      # BullMQ workers — email, notification fanout, Vimeo polling
├── utils/            # Pure helpers: error, response, token, password, pagination, sanitize
├── container.js      # DI wiring — repos + integrations → services → controllers
└── app.js            # Express app setup (middleware stack, routes)

db/
├── migrate.js        # Idempotent migration runner (transactional, tracks in _migrations table)
├── migrations/       # 013 ordered SQL files (001_users → 013_indexes)
└── seeds/            # Dev seed data (5 users, 3 communities, 3 posts)

docker/
├── Dockerfile        # Multi-stage build, non-root user, healthcheck
└── docker-compose.yml# API + PostgreSQL 16 + Redis 7 with health checks

nginx/
└── nginx.conf        # HTTPS, WebSocket upgrade, gzip, security headers
```

---

## Layer Responsibilities

| Layer           | Does                                             | Does NOT                       |
| --------------- | ------------------------------------------------ | ------------------------------ |
| **Route**       | Attach middleware, forward to controller         | No logic                       |
| **Controller**  | Extract req params, call service, send response  | No DB calls, no business logic |
| **Service**     | Business logic, orchestrate repos + integrations | No raw SQL, no req/res         |
| **Repository**  | Raw parameterized SQL queries                    | No business rules              |
| **Integration** | Wrap external APIs (S3, Vimeo, Razorpay, etc.)   | No DB calls                    |
| **Model**       | Define field lists + format/sanitize DB rows     | No DB calls                    |

---

## Quick Start

```bash
# 1. Clone and install
npm install

# 2. Set environment variables
cp .env.example .env
# → Fill in all required secrets (see .env.example)

# 3. Run all DB migrations
npm run migrate

# 4. (Optional) Load dev seed data
node db/migrate.js --seed

# 5. Start local dev server
npm run dev
```

---

## Available Scripts

| Command                 | Description                       |
| ----------------------- | --------------------------------- |
| `npm run dev`           | Start with nodemon (auto-restart) |
| `npm start`             | Start production server           |
| `npm run migrate`       | Run pending DB migrations         |
| `npm test`              | Run Jest test suite               |
| `npm run test:coverage` | Run tests with coverage report    |
| `npm run lint`          | ESLint check                      |
| `npm run lint:fix`      | ESLint auto-fix                   |
| `npm run format`        | Prettier format `src/`            |

---

## Environment Variables

See [`.env.example`](.env.example) for all variables.

**Required on startup (will crash if missing):**

| Variable                      | Description                      |
| ----------------------------- | -------------------------------- |
| `DB_URL`                      | PostgreSQL connection string     |
| `REDIS_URL`                   | Redis connection string          |
| `ACCESS_TOKEN_SECRET`         | JWT access token signing secret  |
| `REFRESH_TOKEN_SECRET`        | JWT refresh token signing secret |
| `EMAIL_VERIFY_TOKEN_SECRET`   | Email verification token secret  |
| `PASSWORD_RESET_TOKEN_SECRET` | Password reset token secret      |
| `RAZORPAY_KEY_ID`             | Razorpay key ID                  |
| `RAZORPAY_KEY_SECRET`         | Razorpay key secret              |
| `RAZORPAY_WEBHOOK_SECRET`     | Razorpay webhook HMAC secret     |
| `AWS_ACCESS_KEY_ID`           | AWS credentials                  |
| `AWS_SECRET_ACCESS_KEY`       | AWS credentials                  |
| `AWS_S3_BUCKET_NAME`          | S3 bucket name                   |
| `CLOUDFRONT_DOMAIN`           | CloudFront distribution domain   |
| `VIMEO_ACCESS_TOKEN`          | Vimeo API access token           |
| `GOOGLE_CLIENT_ID`            | Google OAuth client ID           |
| `EMAIL_FROM`                  | Sender email address             |

---

## API Routes

### Auth — `/api/v1/auth`

| Method | Path                   | Auth                                          | Description |
| ------ | ---------------------- | --------------------------------------------- | ----------- |
| POST   | `/signup`              | Register with email + password                |
| POST   | `/login`               | Login, returns httpOnly cookies               |
| POST   | `/google`              | Google OAuth sign-in / sign-up                |
| POST   | `/logout`              | Clear tokens + invalidate refresh token in DB |
| POST   | `/refresh-token`       | Rotate access + refresh tokens                |
| POST   | `/forgot-password`     | Send password reset email                     |
| POST   | `/reset-password`      | Reset password with token                     |
| GET    | `/verify-email/:token` | Verify email address                          |
| GET    | `/me`                  | Get own profile (private fields)              |

### Users — `/api/v1/users`

| Method | Path                 | Auth                      | Description                   |
| ------ | -------------------- | ------------------------- | ----------------------------- |
| GET    | `/search`            | Optional                  | Search users by name/username |
| GET    | `/:username`         | Optional                  | Get public profile            |
| PATCH  | `/me/profile`        | Update name, bio, website |
| PATCH  | `/me/avatar`         | Update avatar             |
| PATCH  | `/me/username`       | Change username           |
| GET    | `/:userId/followers` | List followers            |
| GET    | `/:userId/following` | List following            |
| POST   | `/:userId/follow`    | Follow a user             |
| DELETE | `/:userId/follow`    | Unfollow a user           |

### Posts — `/api/v1/posts`

| Method | Path                | Auth                  | Description         |
| ------ | ------------------- | --------------------- | ------------------- |
| GET    | `/`                 | Optional              | Browse/search posts |
| POST   | `/`                 | Create post           |
| GET    | `/user/:userId`     | Optional              | Get posts by user   |
| GET    | `/:postId`          | Optional              | Get post detail     |
| PATCH  | `/:postId`          | Edit own post         |
| DELETE | `/:postId`          | Soft delete own post  |
| POST   | `/:postId/like`     | Like post             |
| DELETE | `/:postId/like`     | Unlike post           |
| POST   | `/:postId/share`    | Increment share count |
| GET    | `/:postId/comments` | Optional              | List post comments  |

### Communities — `/api/v1/communities`

| Method | Path                                    | Auth                              | Description           |
| ------ | --------------------------------------- | --------------------------------- | --------------------- |
| GET    | `/`                                     | Optional                          | Browse communities    |
| POST   | `/`                                     | Create community                  |
| GET    | `/:slug`                                | Optional                          | Get community by slug |
| PATCH  | `/:communityId`                         | Update community                  |
| DELETE | `/:communityId`                         | Delete community                  |
| POST   | `/:communityId/join`                    | Join (or request to join private) |
| DELETE | `/:communityId/join`                    | Leave community                   |
| GET    | `/:communityId/members`                 | List members                      |
| GET    | `/:communityId/posts`                   | Optional                          | List community posts  |
| POST   | `/:communityId/members/:userId/approve` | Approve pending member            |
| DELETE | `/:communityId/members/:userId`         | Remove member                     |

### Comments — `/api/v1/comments`

| Method | Path               | Auth                                                | Description |
| ------ | ------------------ | --------------------------------------------------- | ----------- |
| POST   | `/`                | Add comment (supports nested replies up to depth 5) |
| PATCH  | `/:commentId`      | Edit own comment                                    |
| DELETE | `/:commentId`      | Delete own comment                                  |
| POST   | `/:commentId/like` | Like comment                                        |
| DELETE | `/:commentId/like` | Unlike comment                                      |

### Events — `/api/v1/events`

| Method | Path                  | Auth                          | Description            |
| ------ | --------------------- | ----------------------------- | ---------------------- |
| GET    | `/`                   | Optional                      | Browse upcoming events |
| POST   | `/`                   | Create event                  |
| GET    | `/:eventId`           | Optional                      | Get event detail       |
| PATCH  | `/:eventId`           | Update event                  |
| DELETE | `/:eventId`           | Cancel event                  |
| POST   | `/:eventId/register`  | Register (free/paid/waitlist) |
| DELETE | `/:eventId/register`  | Cancel registration           |
| GET    | `/:eventId/attendees` | List attendees                |

### Wallet — `/api/v1/wallet`

| Method | Path               | Auth                            | Description |
| ------ | ------------------ | ------------------------------- | ----------- |
| GET    | `/me`              | Get wallet balance              |
| GET    | `/me/transactions` | Transaction history             |
| POST   | `/topup`           | Create Razorpay order for topup |

### Feed — `/api/v1/feed`

| Method | Path | Auth                                      | Description |
| ------ | ---- | ----------------------------------------- | ----------- |
| GET    | `/`  | Personalized feed (Redis cached, 60s TTL) |

### Notifications — `/api/v1/notifications`

| Method | Path        | Auth                                          | Description |
| ------ | ----------- | --------------------------------------------- | ----------- |
| GET    | `/`         | List notifications (`?unread=true` to filter) |
| PATCH  | `/read-all` | Mark all as read                              |
| PATCH  | `/:id/read` | Mark one as read                              |

### Media — `/api/v1/media`

| Method | Path                | Auth                                       | Description |
| ------ | ------------------- | ------------------------------------------ | ----------- |
| POST   | `/signed-url`       | Get S3 pre-signed PUT URL for image upload |
| POST   | `/confirm`          | Confirm image uploaded to S3               |
| POST   | `/video/upload-url` | Get Vimeo TUS upload link for video        |
| GET    | `/:id/status`       | Poll media processing status               |

### System

| Method | Path      | Auth                           | Description |
| ------ | --------- | ------------------------------ | ----------- |
| GET    | `/health` | Health check (DB + Redis ping) |

---

## Real-time Events (Socket.io)

Connect with JWT in handshake:

```js
const socket = io('https://api.yourapp.com', {
  auth: { token: '<access_token>' },
  // OR — browser will send cookie automatically
});
```

| Event (server → client) | Payload                             | Description                       |
| ----------------------- | ----------------------------------- | --------------------------------- |
| `notification:new`      | `{ id, type, title, message, ... }` | New notification pushed instantly |
| `wallet:updated`        | `{ balanceCents }`                  | Wallet balance changed            |

| Event (client → server)  | Payload              | Description                |
| ------------------------ | -------------------- | -------------------------- |
| `notification:mark_read` | `{ notificationId }` | Mark one notification read |

---

## Security

| Feature              | Implementation                                          |
| -------------------- | ------------------------------------------------------- |
| Auth tokens          | JWT in httpOnly cookies — XSS-safe                      |
| Token rotation       | Refresh tokens hashed in DB (SHA-256)                   |
| Payment verification | HMAC-SHA256 on Razorpay webhook raw body                |
| Input validation     | Zod on all write endpoints                              |
| SQL injection        | Parameterized queries only, zero string interpolation   |
| XSS                  | HTML stripped from all string inputs via sanitize util  |
| RBAC                 | `user` / `moderator` / `admin` / `superadmin` roles     |
| Rate limiting        | Global 100/15min · Auth 10/15min · Upload 20/hr         |
| Security headers     | Helmet (CSP, HSTS, X-Frame, etc.)                       |
| Password hashing     | bcrypt, cost factor 12                                  |
| Race conditions      | `SELECT FOR UPDATE` in wallet debit/credit transactions |

---

## DB Migrations

Migrations run in order, tracked in `_migrations` table. Each runs inside a transaction — if one fails, it rolls back and exits cleanly.

```bash
# Run all pending migrations
npm run migrate

# Run migrations + seed dev data
node db/migrate.js --seed
```

| File                               | Creates                                             |
| ---------------------------------- | --------------------------------------------------- |
| `001_create_users.sql`             | `users` table                                       |
| `002_create_followers.sql`         | `followers` table                                   |
| `003_create_media.sql`             | `media` table                                       |
| `004_create_communities.sql`       | `communities` table                                 |
| `005_create_community_members.sql` | `community_members` table                           |
| `006_create_posts.sql`             | `posts` table                                       |
| `007_create_post_likes_views.sql`  | `post_likes`, `post_views` tables                   |
| `008_create_comments.sql`          | `comments`, `comment_likes` tables                  |
| `009_create_events.sql`            | `events`, `event_attendees` tables                  |
| `010_create_wallets.sql`           | `wallets`, `transactions` tables                    |
| `011_create_notifications.sql`     | `notifications` table                               |
| `012_create_feed_tables.sql`       | `user_feed_preferences`, `post_interactions` tables |
| `013_create_all_indexes.sql`       | All performance indexes                             |

---

## Tech Stack

| Layer                | Technology                                 |
| -------------------- | ------------------------------------------ |
| Runtime              | Node.js 20                                 |
| Framework            | Express 5                                  |
| Database             | PostgreSQL 16 — raw `pg`, no ORM           |
| Cache / Queue broker | Redis 7                                    |
| Job queue            | BullMQ                                     |
| Real-time            | Socket.io                                  |
| Video                | Vimeo (TUS client-side direct upload)      |
| Object storage       | AWS S3 + CloudFront CDN                    |
| Payments             | Razorpay                                   |
| Auth                 | JWT (httpOnly cookies) + Google OAuth 2.0  |
| Email                | Nodemailer via AWS SES SMTP                |
| Process manager      | PM2 (cluster mode)                         |
| Containerization     | Docker (multi-stage) + nginx reverse proxy |

---

## Docker

```bash
# Build and start all services
cd docker
docker-compose up -d

# Check logs
docker-compose logs -f api
```

Services: `api` (port 1999) · `postgres` (16-alpine) · `redis` (7-alpine)

---

## Deployment (AWS EC2)

```bash
# 1. SSH into instance
ssh -i key.pem ec2-user@<PUBLIC_IP>

# 2. Install Node 20 + PM2
curl -fsSL https://rpm.nodesource.com/setup_20.x | sudo bash -
sudo yum install -y nodejs
sudo npm i -g pm2

# 3. Clone repo, install deps, migrate
npm install
npm run migrate

# 4. Start with PM2 cluster mode
pm2 start ecosystem.config.js --env production
pm2 save
pm2 startup

# 5. Configure nginx (copy nginx/nginx.conf → /etc/nginx/conf.d/)
# 6. Certbot for SSL: sudo certbot --nginx -d api.yourapp.com
```

---

## Dev Seed Credentials

All seed users share the password: **`Admin@123!`**

| Email                     | Username     | Role       |
| ------------------------- | ------------ | ---------- |
| `superadmin@tadlebox.dev` | `superadmin` | superadmin |
| `priya@tadlebox.dev`      | `priya_shah` | user       |
| `aryan@tadlebox.dev`      | `aryan_k`    | user       |
| `meera@tadlebox.dev`      | `meera_nair` | user       |
| `dev@tadlebox.dev`        | `dev_patel`  | user       |

**Seed communities:** `tech-builders-india` · `design-collective` · `indie-hackers-inr`

---

## For Junior Developers

### Where to add a new feature

1. **New DB table** → add a migration file in `db/migrations/`
2. **New field on existing model** → update the model's field constants and `format()` function
3. **New query** → add a function in the relevant `repositories/` file
4. **New business rule** → add a method in the relevant `services/` file
5. **New endpoint** → add to the route file, call the service in the controller
6. **New external API** → add a new folder under `integrations/`, wire it in `container.js`

### Coding rules

- Never write SQL in controllers or services
- Never import repositories directly in controllers
- Never use `req`/`res` in services or repositories
- Never use string interpolation in SQL (`${userId}` → use `$1`)
- All DB queries go through `repositories/`
- All business logic goes through `services/`
- All external API calls go through `integrations/`
- All controllers receive dependencies via constructor injection from `container.js`
