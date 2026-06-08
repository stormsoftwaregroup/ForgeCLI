/**
 * Template capability manifest — what the reference implementation provides.
 * Used by the prompt review stage to detect conflicts.
 */
export const CAPABILITIES = [
  {
    key: 'logging',
    name: 'Logging',
    tech: 'Winston + Morgan',
    files: ['server/src/utils/logger.js', 'server/src/middleware/httpLogger.js'],
    conflicts: ['pino', 'bunyan', 'log4js', 'console.log for logging', 'set up logging', 'install.*logging'],
  },
  {
    key: 'error-handling',
    name: 'Error Handling',
    tech: 'Custom error classes + global errorHandler middleware',
    files: ['server/src/utils/errors.js', 'server/src/middleware/errorHandler.js', 'server/src/utils/errorLogger.js'],
    conflicts: ['express-async-errors', 'set up error handling', 'create.*error handler', 'build.*error handling'],
  },
  {
    key: 'auth',
    name: 'Authentication',
    tech: 'JWT + refresh token rotation (httpOnly cookies)',
    files: ['server/src/utils/jwt.js', 'server/src/middleware/auth.js', 'server/src/services/authService.js'],
    conflicts: ['passport', 'auth0', 'firebase auth', 'clerk', 'implement authentication', 'set up auth', 'supabase auth'],
  },
  {
    key: 'validation',
    name: 'Request Validation',
    tech: 'Zod schemas + validate middleware',
    files: ['server/src/middleware/validate.js', 'server/src/validators/'],
    conflicts: ['\\bjoi\\b', '\\byup\\b', 'express-validator', '\\bajv\\b', 'set up validation', 'install.*validator'],
  },
  {
    key: 'security',
    name: 'Security Headers',
    tech: 'Helmet',
    files: ['server/app.js'],
    conflicts: ['set up security headers', 'install.*security', 'csp middleware'],
  },
  {
    key: 'rate-limiting',
    name: 'Rate Limiting',
    tech: 'express-rate-limit',
    files: ['server/app.js'],
    conflicts: ['set up rate limit', 'install.*rate.?limit', 'bottleneck'],
  },
  {
    key: 'cors',
    name: 'CORS',
    tech: 'cors middleware',
    files: ['server/app.js'],
    conflicts: ['set up cors', 'configure cors', 'install.*cors'],
  },
  {
    key: 'orm',
    name: 'ORM / Database',
    tech: 'Prisma + PostgreSQL',
    files: ['server/prisma/schema.prisma', 'server/src/utils/prisma.js'],
    conflicts: ['sequelize', 'typeorm', '\\bknex\\b', 'mongoose', 'drizzle', 'set up database', 'install.*orm', 'mongodb'],
  },
  {
    key: 'state',
    name: 'Client State Management',
    tech: 'Zustand',
    files: ['client/src/stores/'],
    conflicts: ['\\bredux\\b', 'redux.?toolkit', '@reduxjs', 'mobx', 'jotai', 'recoil', 'context api for state', 'install.*state'],
  },
  {
    key: 'routing',
    name: 'Client Routing',
    tech: 'React Router v7',
    files: ['client/src/App.jsx'],
    conflicts: ['next.?router', 'tanstack.*router', 'wouter', 'install.*router'],
  },
  {
    key: 'styling',
    name: 'Styling',
    tech: 'Tailwind CSS',
    files: ['client/tailwind.config.js'],
    conflicts: ['styled-components', '\\bemotion\\b', 'css modules', '\\bsass\\b', '\\bscss\\b', 'set up styling', 'install.*css-in-js'],
  },
  {
    key: 'api-client',
    name: 'API Client',
    tech: 'Axios with token refresh interceptor',
    files: ['client/src/services/api.js'],
    conflicts: ['\\bswr\\b', 'react-query', 'tanstack.*query', 'set up api client', 'install.*fetch'],
  },
  {
    key: 'testing',
    name: 'Testing',
    tech: 'Jest + Supertest (server), Playwright (e2e)',
    files: ['server/jest.config.js', 'playwright.config.js'],
    conflicts: ['\\bmocha\\b', '\\bvitest\\b', '\\bcypress\\b', 'set up testing', 'install.*test.?framework'],
  },
  {
    key: 'email',
    name: 'Email',
    tech: 'Nodemailer + SendGrid (optional module)',
    files: ['server/src/services/emailService.js'],
    conflicts: ['\\bses\\b.*email', 'mailgun', 'postmark', 'resend', 'set up email'],
  },
  {
    key: 'file-upload',
    name: 'File Upload',
    tech: 'Multer + Azure Blob (optional module)',
    files: ['server/src/middleware/upload.js', 'server/src/services/storageService.js'],
    conflicts: ['\\bs3\\b.*upload', 'formidable', 'busboy', 'set up file upload', 'cloudinary'],
  },
  {
    key: 'api-docs',
    name: 'API Documentation',
    tech: 'Swagger/OpenAPI via swagger-jsdoc',
    files: ['server/src/config/swagger.js'],
    conflicts: ['set up api docs', 'install.*swagger', 'redoc', 'stoplight'],
  },
  {
    key: 'ci-cd',
    name: 'CI/CD',
    tech: 'GitHub Actions',
    files: ['.github/workflows/'],
    conflicts: ['set up ci', 'circleci', 'travis', 'gitlab ci', 'jenkins'],
  },
  {
    key: 'containerization',
    name: 'Containerization',
    tech: 'None — local PostgreSQL, npm workspaces',
    files: [],
    conflicts: ['\\bdocker\\b', 'docker-compose', 'dockerfile', 'container', '\\bk8s\\b', 'kubernetes', 'podman'],
  },
  {
    key: 'package-manager',
    name: 'Package Manager',
    tech: 'npm with workspaces',
    files: ['package.json'],
    conflicts: ['\\byarn\\b', '\\bpnpm\\b', '\\bbun\\b(?!dle)', 'yarn\\.lock', 'pnpm-lock'],
  },
  {
    key: 'charts',
    name: 'Charts / Data Visualization',
    tech: 'Recharts',
    files: ['client/package.json'],
    conflicts: ['\\bchart\\.?js\\b', 'd3\\.js', '\\bnivo\\b', 'highcharts', 'apex.?charts', 'victory'],
  },
];

/**
 * Requirements that should be injected into every prompt to ensure
 * alignment with template conventions. Each entry has a key, label,
 * and the text that gets appended.
 */
export const TEMPLATE_REQUIREMENTS = [
  {
    key: 'logging',
    label: 'Logging',
    text: `- Use the existing Winston logger (import from \`server/src/utils/logger.js\`) for all server-side logging.
- Use logger.info() for normal operations, logger.warn() for recoverable issues, logger.error() for failures.
- Never use console.log/console.error in server code — always use the Winston logger.
- All new API routes must include the existing Morgan HTTP logging middleware (already applied globally in app.js).
- Errors that reach the global error handler are automatically logged to the ErrorLog database table — do not duplicate this.`,
  },
  {
    key: 'error-handling',
    label: 'Error Handling',
    text: `- Use the existing AppError subclasses from \`server/src/utils/errors.js\` (ValidationError, NotFoundError, UnauthorizedError, ForbiddenError, ConflictError).
- Throw these errors in route handlers and services — the global errorHandler middleware will catch them.
- Do not create custom error handling middleware — the template already has one in \`server/src/middleware/errorHandler.js\`.
- Wrap async route handlers to ensure errors propagate to the error handler.`,
  },
  {
    key: 'auth',
    label: 'Authentication & Authorization',
    text: `- Use the existing \`authenticate\` and \`authorize\` middleware from \`server/src/middleware/auth.js\` for protected routes.
- Use \`authorizeOwner(paramField)\` when a resource should only be accessible by its owner.
- Access tokens are JWTs in the Authorization header; refresh tokens are httpOnly cookies — do not change this pattern.
- On the client, use the Zustand auth store (\`client/src/stores/authStore.js\`) for user state and the Axios interceptor in \`client/src/services/api.js\` for automatic token handling.`,
  },
  {
    key: 'database',
    label: 'Database',
    text: `- Use Prisma ORM for all database operations — import the client from \`server/src/utils/prisma.js\`.
- Add new models to \`server/prisma/schema.prisma\` and create a migration with \`npx prisma migrate dev --name <name>\`.
- Use Prisma's relation syntax for foreign keys and associations.
- Never write raw SQL unless Prisma cannot express the query (and even then, use \`prisma.$queryRaw\`).`,
  },
  {
    key: 'testing',
    label: 'Testing',
    text: `- Write Jest + Supertest tests in \`server/tests/\` for all new API endpoints.
- Tests should use the test database (\`.env.test\`) — do not mock the database.
- Follow the pattern in existing tests (auth.test.js, admin.test.js) for setup/teardown.
- Add Playwright e2e tests in \`e2e/\` for any new user-facing flows.`,
  },
  {
    key: 'frontend',
    label: 'Frontend Conventions',
    text: `- Use Tailwind CSS utility classes for all styling — do not add CSS files or styled-components.
- Use Zustand for client-side state management — create stores in \`client/src/stores/\`.
- Use React Router v7 for routing — add routes in \`client/src/App.jsx\`.
- Use the Axios instance from \`client/src/services/api.js\` for API calls (it handles auth automatically).
- Use Recharts for any charts or data visualization.`,
  },
  {
    key: 'validation',
    label: 'Validation',
    text: `- Use Zod schemas for request validation — create schemas in \`server/src/validators/\`.
- Apply the \`validate\` middleware from \`server/src/middleware/validate.js\` to routes that accept input.`,
  },
  {
    key: 'api-docs',
    label: 'API Documentation',
    text: `- Add Swagger/OpenAPI JSDoc comments to all new API routes so they appear in /api-docs.
- Follow the existing annotation pattern in the template's route files.`,
  },
];
