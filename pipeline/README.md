# Agentic Pipeline — Self-Hosted, Max Subscription

## Overview

A fully agentic development pipeline that runs on your local machine using
your Claude Max subscription. No API billing. No cloud runners.

**Issue → PO Agent → Architect Agent → Builder → Tests → Scans → PR**

```
┌─────────────────────────────────────────────────────────────────┐
│  GitHub Issue Created                                           │
│  ↓                                                              │
│  [01] Product Owner Agent (challenges, questions, approves)     │
│        label: po-approved                                       │
│  ↓                                                              │
│  [02] Architect Agent (evaluates patterns, produces plan)       │
│        label: architect-approved                                │
│  ↓                                                              │
│  [03] Builder (implements, tests, scans, creates PR)            │
│        ├── Code implementation (follows architect's plan)       │
│        ├── Unit + integration + E2E tests                       │
│        ├── Playwright visual verification                       │
│        ├── Security scan (/security-review)                     │
│        ├── Accessibility check (axe-core)                       │
│        └── PR with full changelog                               │
│  ↓                                                              │
│  [04] Weekly Health Scan (cron, finds issues, creates tickets)  │
└─────────────────────────────────────────────────────────────────┘

All stages run on your local self-hosted runner.
All stages use your Max subscription via OAuth token.
```

## Quick Start

### Prerequisites

- **Claude Max subscription** (Pro works but with lower limits)
- **Claude Code** installed: `npm install -g @anthropic-ai/claude-code`
- **GitHub CLI**: `brew install gh` (or equivalent)
- **Node.js 18+**
- **Git 2.23+**

### Step 1: Get Your Runner Registration Token

1. Go to: `https://github.com/<owner>/<repo>/settings/actions/runners/new`
2. Copy the registration token (expires in ~1 hour)

### Step 2: Run Setup

```bash
chmod +x setup-runner.sh
./setup-runner.sh --repo <owner>/<repo> --token <runner-token>
```

This will:
- Validate all prerequisites
- Generate a Claude Code OAuth token (uses your Max sub)
- Store the token as a GitHub repo secret
- Download and configure the self-hosted runner
- Create start/stop/status convenience scripts

### Step 3: Copy Pipeline Files to Your Repo

```bash
# From your repo root:
cp -r /path/to/agentic-pipeline/.github .
cp -r /path/to/agentic-pipeline/.claude .
cp /path/to/agentic-pipeline/CLAUDE.md .

# Edit CLAUDE.md to match your actual project
git add .github/ .claude/ CLAUDE.md
git commit -m "feat: add agentic pipeline"
git push
```

### Step 4: Create Required Labels

| Label | Color | Description |
|-------|-------|-------------|
| `po-approved` | `#0E8A16` | Product Owner approved |
| `po-needs-info` | `#FBCA04` | PO has questions |
| `architect-approved` | `#1D76DB` | Architect approved with plan |
| `architect-blocked` | `#D93F0B` | Architectural concerns |
| `build-complete` | `#0E8A16` | Implementation PR created |
| `ready-for-review` | `#7057FF` | PR ready for human review |
| `automated` | `#BFDADC` | Created by automation |
| `health-scan` | `#C2E0C6` | From weekly health scan |

### Step 5: Start and Test

```bash
./start-runner.sh
# Create a GitHub issue and watch the PO agent respond
```

---

## File Reference

```
.github/workflows/
    01-po-triage.yml        # PO evaluates new issues
    01b-po-reeval.yml       # PO re-evaluates after author responds
    02-architect-review.yml # Architect plans implementation
    03-build-and-pr.yml     # Build, test, scan, PR
    04-health-scan.yml      # Weekly codebase health scan

.claude/
    agents/
        product-owner.md    # Skeptical requirements reviewer
        architect.md        # Pattern enforcer and planner
    settings.json           # Hooks for quality gates

CLAUDE.md                   # Project conventions (customize this)
setup-runner.sh             # One-time setup
start-runner.sh             # Start runner (generated)
stop-runner.sh              # Stop runner (generated)
runner-status.sh            # Check status (generated)
```

## How It Works

### Label-Based Handoffs
Labels are the handoff mechanism between stages:
- `issues.opened` → PO triage
- `po-approved` label → Architect review
- `architect-approved` label → Build

### Loop Prevention
Every workflow guards against infinite loops:
- `github.actor != 'claude[bot]'` skips bot-triggered events
- Concurrency groups prevent duplicate runs
- Label checks prevent re-running completed stages

### Hooks (Quality Gates)
In `.claude/settings.json`:
- **PostToolUse:** Type-check + lint after every TS file edit
- **PreToolUse:** Block destructive commands
- **Stop:** Log session completion

## Model Selection

In workflow YAML `claude_args`:
- **PO agent:** Opus (judgment-heavy)
- **Architect:** Opus (needs deep codebase understanding)
- **Builder:** Opus for complex, Sonnet for simple issues
- **Health scan:** Sonnet (breadth over depth)

## Cost

- **Runner:** Free (your machine)
- **GitHub Actions minutes:** Free for self-hosted runners
- **Claude Code:** Your Max subscription (no API billing)

**Critical:** Ensure `ANTHROPIC_API_KEY` is NOT set in your shell.
If set, Claude Code bills per-token to your API account instead of
using your Max subscription. The start-runner.sh script unsets it
automatically.

## Adding Playwright MCP

```bash
claude mcp add playwright -- npx @playwright/mcp@latest --headless
```

## Troubleshooting

**Runner not picking up jobs:**
```bash
./runner-status.sh && ./stop-runner.sh && ./start-runner.sh
```

**Subagents not invoked:** Verify `.claude/agents/` files are committed
and the prompt explicitly names the agent by name.

**OAuth token expired:** Run `claude setup-token` and update the secret:
```bash
gh secret set CLAUDE_CODE_OAUTH_TOKEN --repo <owner>/<repo>
```
