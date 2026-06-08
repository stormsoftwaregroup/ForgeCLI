# CLAUDE.md — Project Configuration for Agentic Pipeline

## Project Overview
<!-- Update this section for your specific project -->

- **Project:** [Your Project Name]
- **Owner:** Chris Perrin / Storm Software Group
- **Stack:** [e.g., React/Vite/Tailwind, Express, PostgreSQL, Prisma]
- **Framework:** Five Facets of AI-Enabled Engineering

## Architecture Conventions

### File Structure
<!-- Document your actual file structure here -->
```
src/
  components/     # React components (functional only, <200 lines)
  hooks/          # Custom React hooks
  services/       # Business logic, API calls
  utils/          # Pure utility functions
  types/          # TypeScript interfaces and types
  __tests__/      # Test files mirror src/ structure
```

### Patterns to Follow
<!-- List your actual patterns — the architect agent reads this -->

- Use functional components with hooks, never class components
- All API calls go through service layer, never directly in components
- Error handling: use custom error types, never raw try/catch with console.log
- State management: [your approach]
- Authentication: [your JWT/session pattern]
- Database access: via Prisma, never raw SQL

### Patterns to AVOID

- No `any` types in TypeScript
- No `console.log` in production code (use structured logger)
- No inline styles — use Tailwind utility classes
- No direct DOM manipulation — use React refs
- No default exports except for pages/routes

## Code Standards

### Commits
- Follow conventional commits: `feat:`, `fix:`, `chore:`, `docs:`, `test:`
- Commits must be atomic — one logical change per commit
- Include issue reference: `feat: add user dashboard (#42)`

### Testing
- Unit tests: Vitest + React Testing Library
- Integration tests: Vitest with test database
- E2E tests: Playwright
- Minimum meaningful coverage — test behavior, not implementation
- Every new function/component gets at least one test

### Security
- Never hardcode secrets or credentials
- Validate all user input at the API boundary
- Use parameterized queries (Prisma handles this)
- CSRF protection on all state-changing endpoints
- Rate limiting on authentication endpoints

### Accessibility
- All interactive elements must be keyboard accessible
- Images require alt text (decorative: alt="")
- Form inputs require associated labels
- Color must not be the only means of conveying information
- Minimum contrast ratio: 4.5:1 for text

## Agent Instructions

### For the product-owner agent:
- Be thorough but not pedantic
- Focus on whether a developer can implement without questions
- Reference @.claude/agents/product-owner.md for full evaluation criteria

### For the architect agent:
- Always explore the codebase before planning
- Reference existing patterns, never invent new ones without justification
- Reference @.claude/agents/architect.md for full planning process

### For the builder (Stage 3 workflow):
- Follow the architect's plan step by step
- Run tests after every meaningful change
- Use Playwright MCP for visual verification of UI changes
- Run /security-review before creating the PR
- Commit messages must reference the issue number

## MCP Servers
<!-- Configure these for your project -->

- **Playwright:** For visual testing and browser automation
- **GitHub:** For issue/PR management (available in CI via gh CLI)
- **PostgreSQL:** For database operations (if applicable)

## Key Files
<!-- List files the agents should know about -->

- `package.json` — Dependencies and scripts
- `tsconfig.json` — TypeScript configuration
- `vite.config.ts` — Build configuration
- `playwright.config.ts` — E2E test configuration
- `.env.example` — Required environment variables
