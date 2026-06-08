# Unicorn Forge Express

> Personal project accelerator. Clone, customize, ship.
> [unicornforged.com](https://unicornforged.com)

## What Is This?

A complete, production-ready full-stack template that eliminates the first 20-40 hours of setup on every new project. Clone it, customize the data model and business logic, and ship.

## What's Included (Out of the Box)

- React 19 + Vite + Tailwind CSS 3 + Zustand frontend
- Node.js + Express 4 backend (JavaScript ES6+)
- PostgreSQL + Prisma ORM with migrations
- JWT access tokens + refresh token rotation (httpOnly cookies)
- RBAC authorization middleware (ADMIN / USER roles)
- Admin error log dashboard (errors saved to DB + full admin UI)
- Swagger/OpenAPI auto-generated docs at `/api-docs`
- Winston + Morgan structured logging with DB error transport
- Helmet.js security headers
- Rate limiting (disabled in dev, enabled in prod)
- CORS configuration (open in dev, strict in prod)
- Zod request validation
- Jest + Supertest server tests (84 tests)
- Playwright E2E tests with axe-core accessibility checks (12 tests)
- ESLint + Prettier + Husky pre-commit hooks with lint-staged
- GitHub Actions CI/CD pipelines
- Azure App Service + Static Web Apps deployment configs
- Optional email module (Nodemailer + SendGrid, disabled by default)
- Optional file upload module (local dev + Azure Blob prod, disabled by default)

## Prerequisites

- [Node.js](https://nodejs.org/) 20+
- [PostgreSQL](https://www.postgresql.org/) 15+ (local or remote)
- npm (included with Node.js)

## Quick Start

```bash
# 1. Clone the template
git clone <repo-url> my-project
cd my-project

# 2. Install all dependencies (both client and server via workspaces)
npm install

# 3. Set up environment variables
cp server/.env.example server/.env
# Edit server/.env with your database credentials and secrets

# 4. Create the database
psql -U postgres -f server/prisma/setup-db.sql

# 5. Run migrations and seed
cd server
npx prisma migrate dev
npx prisma db seed
cd ..

# 6. Start development (client + server concurrently)
npm run dev
```

The client runs at **http://localhost:5173** and the server at **http://localhost:3001**.

API docs are at **http://localhost:3001/api-docs**.

## Default Accounts

| Role  | Email             | Password    |
| ----- | ----------------- | ----------- |
| Admin | admin@forge.local | changeme123 |
| User  | user@forge.local  | changeme123 |

## Available Scripts

### Root (monorepo)

| Command                | Description                                  |
| ---------------------- | -------------------------------------------- |
| `npm run dev`          | Start client + server concurrently           |
| `npm run build`        | Build the client for production              |
| `npm test`             | Run all server tests                         |
| `npm run test:e2e`     | Run Playwright E2E tests                     |
| `npm run test:e2e:ui`  | Open Playwright UI for interactive debugging |
| `npm run lint`         | Lint all JS/JSX files                        |
| `npm run format`       | Format all files with Prettier               |
| `npm run format:check` | Check formatting without writing             |

### Server (`cd server` or `-w server`)

| Command                 | Description                             |
| ----------------------- | --------------------------------------- |
| `npm run dev`           | Start server with nodemon (auto-reload) |
| `npm start`             | Start server (production)               |
| `npm test`              | Run Jest tests against test database    |
| `npm run test:watch`    | Run tests in watch mode                 |
| `npm run test:coverage` | Run tests with coverage report          |
| `npm run db:migrate`    | Create and apply a new Prisma migration |
| `npm run db:seed`       | Seed the database with default accounts |
| `npm run db:studio`     | Open Prisma Studio GUI                  |

### Client (`cd client` or `-w client`)

| Command           | Description                       |
| ----------------- | --------------------------------- |
| `npm run dev`     | Start Vite dev server (port 5173) |
| `npm run build`   | Production build to `dist/`       |
| `npm run preview` | Preview production build locally  |

## Project Structure

```
unicorn-forge-express/
├── client/                    # React frontend (Vite)
│   └── src/
│       ├── components/        # Shared components (ProtectedRoute, ui/)
│       ├── layouts/           # Page layouts (MainLayout with sidebar)
│       ├── pages/             # Route pages (Login, Register, Dashboard, admin/)
│       ├── services/          # API service layer (api.js, authService, adminService)
│       ├── stores/            # Zustand state management (authStore)
│       └── hooks/ contexts/ utils/  # Extension points
├── server/                    # Express backend
│   ├── app.js                 # Express app configuration
│   ├── server.js              # Server entry point with graceful shutdown
│   ├── src/
│   │   ├── config/            # Swagger configuration
│   │   ├── controllers/       # Route handlers (auth, admin)
│   │   ├── middleware/        # Auth, error handler, HTTP logger, upload, validation
│   │   ├── routes/            # Route definitions with Swagger JSDoc
│   │   ├── services/          # Business logic (auth, email, storage)
│   │   ├── utils/             # Logger, Prisma client, JWT, errors, error logger
│   │   └── validators/        # Zod request schemas
│   ├── prisma/                # Schema, migrations, seed, setup SQL
│   └── tests/                 # Jest test suites (84 tests)
├── e2e/                       # Playwright E2E tests (12 tests)
│   └── helpers/               # Auth and accessibility helpers
├── forge/                     # Tooling directory (prompts, scripts, templates)
├── .github/workflows/         # CI/CD (ci.yml, deploy-frontend.yml, deploy-backend.yml)
├── playwright.config.js       # Playwright configuration
└── package.json               # Monorepo root with npm workspaces
```

## Adding New Features (The Forge Way)

1. **Data model** — Add your model to `server/prisma/schema.prisma`, then run `npm run db:migrate -w server`
2. **Service** — Create `server/src/services/yourService.js` with business logic
3. **Validation** — Add Zod schemas in `server/src/validators/`
4. **Controller** — Create `server/src/controllers/yourController.js` following the auth controller pattern
5. **Routes** — Add routes in `server/src/routes/` with Swagger JSDoc annotations, mount in `routes/index.js`
6. **Frontend service** — Add `client/src/services/yourService.js` using the `api` instance
7. **Page** — Create your page component in `client/src/pages/`, add the route to `App.jsx`
8. **Navigation** — Add sidebar links in `MainLayout.jsx` (navItems or adminItems)
9. **Tests** — Add server tests in `server/tests/`, E2E specs in `e2e/`

## Authentication Flow

- **Login** returns a short-lived JWT access token (15 min) + httpOnly refresh token cookie (7 days)
- **Refresh** rotates the refresh token on each use (token rotation for security)
- **Logout** invalidates the refresh token server-side
- **Protected routes** check `isAuthenticated` in the Zustand auth store; redirect to `/login` if false
- **API interceptor** in `client/src/services/api.js` automatically refreshes expired tokens

## Middleware Stack (server/app.js)

Applied in this order:

1. `helmet()` — Security headers
2. `cors()` — Cross-origin resource sharing
3. `express.json()` / `express.urlencoded()` — Body parsing
4. `cookieParser()` — Cookie parsing for refresh tokens
5. `httpLogger` — Morgan request logging (disabled in test)
6. `rateLimit` — Rate limiting on `/api` (production only)
7. Swagger UI at `/api-docs`
8. Health check at `/api/health`
9. Application routes
10. `errorHandler` — Global error handler (always last)

## Optional Modules

### Email (Nodemailer + SendGrid)

Disabled by default. To enable:

```env
ENABLE_EMAIL=true
SENDGRID_API_KEY=SG.your-api-key-here
EMAIL_FROM=noreply@yourdomain.com
```

When disabled, all email functions (`sendEmail`, `sendPasswordReset`, `sendWelcome`) are silent no-ops that log a message and return `null`.

### File Uploads (Local + Azure Blob)

Disabled by default. To enable:

```env
ENABLE_UPLOADS=true
# Production only:
AZURE_STORAGE_CONNECTION_STRING=DefaultEndpointsProtocol=https;...
AZURE_STORAGE_CONTAINER=uploads
```

- **Development:** Files stored locally in `server/uploads/` (gitignored)
- **Production:** Files uploaded to Azure Blob Storage
- Upload middleware at `server/src/middleware/upload.js` (multer, 5 MB limit, images + documents)

When disabled, storage functions throw a descriptive error.

## Environment Variables

| Variable                          | Required | Default                 | Description                         |
| --------------------------------- | -------- | ----------------------- | ----------------------------------- |
| `NODE_ENV`                        | No       | `development`           | Environment mode                    |
| `PORT`                            | No       | `3001`                  | Server port                         |
| `DATABASE_URL`                    | Yes      | —                       | PostgreSQL connection string        |
| `JWT_SECRET`                      | Yes      | —                       | Secret for signing access tokens    |
| `JWT_EXPIRY`                      | No       | `15m`                   | Access token expiration             |
| `REFRESH_TOKEN_SECRET`            | Yes      | —                       | Secret for signing refresh tokens   |
| `REFRESH_TOKEN_EXPIRY`            | No       | `7d`                    | Refresh token expiration            |
| `ALLOWED_ORIGINS`                 | No       | `http://localhost:5173` | Comma-separated CORS origins        |
| `RATE_LIMIT_WINDOW_MS`            | No       | `900000`                | Rate limit window (ms)              |
| `RATE_LIMIT_MAX`                  | No       | `100`                   | Max requests per window             |
| `LOG_LEVEL`                       | No       | `debug`                 | Winston log level                   |
| `ENABLE_EMAIL`                    | No       | `false`                 | Enable email module                 |
| `SENDGRID_API_KEY`                | No       | —                       | SendGrid API key (if email enabled) |
| `EMAIL_FROM`                      | No       | `noreply@example.com`   | Sender email address                |
| `ENABLE_UPLOADS`                  | No       | `false`                 | Enable file upload module           |
| `AZURE_STORAGE_CONNECTION_STRING` | No       | —                       | Azure Blob connection (prod only)   |
| `AZURE_STORAGE_CONTAINER`         | No       | `uploads`               | Azure Blob container name           |

## Testing

```bash
# Server unit/integration tests (84 tests, ~2s)
npm test

# Server tests with coverage report
npm run test:coverage -w server

# Playwright E2E tests (12 tests, ~8s)
npm run test:e2e

# Playwright interactive UI
npm run test:e2e:ui
```

Tests use a separate `forge_template_test` database configured in `server/.env.test`.

## Deployment

### Frontend — Azure Static Web Apps

The client builds to static files. Deploy with the GitHub Actions workflow (`.github/workflows/deploy-frontend.yml`).

**Required repository secret:** `AZURE_SWA_TOKEN`

### Backend — Azure App Service

The server deploys as a Node.js app. Deploy with the GitHub Actions workflow (`.github/workflows/deploy-backend.yml`).

**Required repository secrets:** `AZURE_APP_SERVICE_NAME`, `AZURE_PUBLISH_PROFILE`

### CI Pipeline

Every push to `main` and every pull request triggers the CI workflow (`.github/workflows/ci.yml`):

1. **Lint** — ESLint across the full codebase
2. **Server Tests** — Jest against a PostgreSQL service container
3. **E2E Tests** — Playwright with Chromium (uploads report artifact on failure)
4. **Build** — Verifies the client compiles without errors

## License

Private template. See [unicornforged.com](https://unicornforged.com).
