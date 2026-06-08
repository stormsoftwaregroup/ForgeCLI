#!/bin/bash
# =============================================================================
# Storm Software Group — Agentic Pipeline Setup
# Self-hosted GitHub Actions runner + Claude Code Max OAuth
# =============================================================================
# Prerequisites:
#   - Claude Code installed (npm install -g @anthropic-ai/claude-code)
#   - Claude Code authenticated with your Max subscription (run: claude)
#   - GitHub CLI installed (gh)
#   - You are a repo admin on the target repository
# =============================================================================

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

echo -e "${CYAN}========================================${NC}"
echo -e "${CYAN} Storm Agentic Pipeline Setup${NC}"
echo -e "${CYAN}========================================${NC}"
echo ""

# ---------------------------------------------------------------------------
# Step 1: Verify prerequisites
# ---------------------------------------------------------------------------
echo -e "${YELLOW}[1/6] Checking prerequisites...${NC}"

command -v claude >/dev/null 2>&1 || { echo -e "${RED}ERROR: Claude Code CLI not found. Run: npm install -g @anthropic-ai/claude-code${NC}"; exit 1; }
command -v gh >/dev/null 2>&1 || { echo -e "${RED}ERROR: GitHub CLI not found. Install from https://cli.github.com${NC}"; exit 1; }
command -v node >/dev/null 2>&1 || { echo -e "${RED}ERROR: Node.js not found. Required 18+${NC}"; exit 1; }

NODE_VERSION=$(node -v | sed 's/v//' | cut -d. -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
  echo -e "${RED}ERROR: Node.js 18+ required. Found: $(node -v)${NC}"
  exit 1
fi

echo -e "${GREEN}  ✓ Claude Code CLI found${NC}"
echo -e "${GREEN}  ✓ GitHub CLI found${NC}"
echo -e "${GREEN}  ✓ Node.js $(node -v) found${NC}"
echo ""

# ---------------------------------------------------------------------------
# Step 2: Generate OAuth token for GitHub Actions
# ---------------------------------------------------------------------------
echo -e "${YELLOW}[2/6] Generating Claude Code OAuth token...${NC}"
echo -e "  This creates a long-lived token that GitHub Actions will use"
echo -e "  to authenticate as your Max subscription."
echo ""
echo -e "  ${CYAN}IMPORTANT: This token bills against your Max plan, NOT per-token API.${NC}"
echo ""

# Check if ANTHROPIC_API_KEY is set — warn about the $1800 mistake
if [ -n "${ANTHROPIC_API_KEY:-}" ]; then
  echo -e "${RED}  ⚠ WARNING: ANTHROPIC_API_KEY is set in your environment!${NC}"
  echo -e "${RED}  If Claude Code picks this up, it will bill per-token to your API account,${NC}"
  echo -e "${RED}  NOT your Max subscription. Consider unsetting it:${NC}"
  echo -e "${RED}    unset ANTHROPIC_API_KEY${NC}"
  echo ""
  read -p "  Continue anyway? (y/N): " confirm
  [ "$confirm" = "y" ] || exit 1
fi

echo -e "  Running: claude setup-token"
claude setup-token
echo ""
echo -e "${GREEN}  ✓ OAuth token generated${NC}"
echo -e "  ${CYAN}Copy the token output above. You'll need it in the next step.${NC}"
echo ""

# ---------------------------------------------------------------------------
# Step 3: Store the token in GitHub repo secrets
# ---------------------------------------------------------------------------
echo -e "${YELLOW}[3/6] Storing OAuth token in GitHub repo secrets...${NC}"
echo ""
read -p "  Enter your GitHub repo (owner/repo): " GITHUB_REPO
read -sp "  Paste the OAuth token: " OAUTH_TOKEN
echo ""

gh secret set CLAUDE_CODE_OAUTH_TOKEN --repo "$GITHUB_REPO" --body "$OAUTH_TOKEN"
echo -e "${GREEN}  ✓ CLAUDE_CODE_OAUTH_TOKEN stored in ${GITHUB_REPO}${NC}"
echo ""

# ---------------------------------------------------------------------------
# Step 4: Install self-hosted runner
# ---------------------------------------------------------------------------
echo -e "${YELLOW}[4/6] Setting up self-hosted GitHub Actions runner...${NC}"
echo ""
echo -e "  This installs the runner on your local machine so workflows"
echo -e "  execute here instead of GitHub's cloud."
echo ""

RUNNER_DIR="$HOME/actions-runner"

if [ -d "$RUNNER_DIR" ]; then
  echo -e "  Runner directory already exists at $RUNNER_DIR"
  read -p "  Skip runner installation? (Y/n): " skip_runner
  if [ "${skip_runner:-Y}" != "n" ]; then
    echo -e "${GREEN}  ✓ Using existing runner${NC}"
  fi
else
  mkdir -p "$RUNNER_DIR"
  cd "$RUNNER_DIR"

  # Detect OS and architecture
  OS=$(uname -s | tr '[:upper:]' '[:lower:]')
  ARCH=$(uname -m)

  case "$OS" in
    linux)  RUNNER_OS="linux" ;;
    darwin) RUNNER_OS="osx" ;;
    *)      echo -e "${RED}ERROR: Unsupported OS: $OS${NC}"; exit 1 ;;
  esac

  case "$ARCH" in
    x86_64)  RUNNER_ARCH="x64" ;;
    aarch64|arm64) RUNNER_ARCH="arm64" ;;
    *)       echo -e "${RED}ERROR: Unsupported architecture: $ARCH${NC}"; exit 1 ;;
  esac

  echo -e "  Detected: ${RUNNER_OS}-${RUNNER_ARCH}"
  echo ""
  echo -e "  ${CYAN}Go to: https://github.com/${GITHUB_REPO}/settings/actions/runners/new${NC}"
  echo -e "  ${CYAN}Select '${RUNNER_OS}' and '${RUNNER_ARCH}', then copy the download URL and token.${NC}"
  echo ""
  read -p "  Paste the runner download URL: " RUNNER_URL
  read -p "  Paste the registration token: " REG_TOKEN

  echo -e "  Downloading runner..."
  curl -o actions-runner.tar.gz -L "$RUNNER_URL"
  tar xzf actions-runner.tar.gz
  rm actions-runner.tar.gz

  echo -e "  Configuring runner..."
  ./config.sh --url "https://github.com/${GITHUB_REPO}" \
    --token "$REG_TOKEN" \
    --name "storm-agentic-runner" \
    --labels "self-hosted,storm-agentic" \
    --work "_work" \
    --runnergroup "Default" \
    --replace

  echo -e "${GREEN}  ✓ Runner installed and configured${NC}"
  echo ""
  echo -e "  To start the runner:"
  echo -e "    cd $RUNNER_DIR && ./run.sh"
  echo ""
  echo -e "  To install as a service (starts on boot):"
  echo -e "    cd $RUNNER_DIR && sudo ./svc.sh install && sudo ./svc.sh start"
fi
echo ""

# ---------------------------------------------------------------------------
# Step 5: Copy workflow and agent files
# ---------------------------------------------------------------------------
echo -e "${YELLOW}[5/6] Installing workflow and agent files...${NC}"
echo ""
read -p "  Enter the local path to your repo clone: " REPO_PATH

if [ ! -d "$REPO_PATH/.git" ]; then
  echo -e "${RED}ERROR: ${REPO_PATH} is not a git repository${NC}"
  exit 1
fi

# Get the directory where this script lives
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PIPELINE_ROOT="$(dirname "$SCRIPT_DIR")"

# Copy workflow files
mkdir -p "$REPO_PATH/.github/workflows"
cp "$PIPELINE_ROOT/.github/workflows/01-po-triage.yml" "$REPO_PATH/.github/workflows/"
cp "$PIPELINE_ROOT/.github/workflows/02-architect-review.yml" "$REPO_PATH/.github/workflows/"
cp "$PIPELINE_ROOT/.github/workflows/03-builder.yml" "$REPO_PATH/.github/workflows/"

# Copy agent files
mkdir -p "$REPO_PATH/.claude/agents"
cp "$PIPELINE_ROOT/.claude/agents/product-owner.md" "$REPO_PATH/.claude/agents/"
cp "$PIPELINE_ROOT/.claude/agents/architect.md" "$REPO_PATH/.claude/agents/"

# Copy CLAUDE.md if it doesn't exist
if [ ! -f "$REPO_PATH/CLAUDE.md" ]; then
  cp "$PIPELINE_ROOT/CLAUDE.md" "$REPO_PATH/"
  echo -e "${GREEN}  ✓ CLAUDE.md created (customize this for your project!)${NC}"
else
  echo -e "${YELLOW}  ⚠ CLAUDE.md already exists — not overwriting. Review the template at:${NC}"
  echo -e "    $PIPELINE_ROOT/CLAUDE.md"
fi

echo -e "${GREEN}  ✓ Workflow files copied to .github/workflows/${NC}"
echo -e "${GREEN}  ✓ Agent files copied to .claude/agents/${NC}"
echo ""

# ---------------------------------------------------------------------------
# Step 6: Configure MCP servers
# ---------------------------------------------------------------------------
echo -e "${YELLOW}[6/6] Configuring MCP servers for Claude Code...${NC}"
echo ""

cd "$REPO_PATH"

# Playwright MCP
echo -e "  Adding Playwright MCP (browser testing)..."
claude mcp add playwright --scope project -- npx @playwright/mcp@latest --headless 2>/dev/null || echo "  (already configured or skipped)"

# GitHub MCP
echo -e "  Adding GitHub MCP (issue/PR management)..."
claude mcp add github --scope project -- npx -y @anthropic-ai/mcp-server-github 2>/dev/null || echo "  (already configured or skipped)"

echo ""
echo -e "${GREEN}  ✓ MCP servers configured${NC}"
echo ""

# ---------------------------------------------------------------------------
# Done
# ---------------------------------------------------------------------------
echo -e "${CYAN}========================================${NC}"
echo -e "${CYAN} Setup Complete!${NC}"
echo -e "${CYAN}========================================${NC}"
echo ""
echo -e "  Files installed:"
echo -e "    .github/workflows/01-po-triage.yml"
echo -e "    .github/workflows/02-architect-review.yml"
echo -e "    .github/workflows/03-builder.yml"
echo -e "    .claude/agents/product-owner.md"
echo -e "    .claude/agents/architect.md"
echo -e "    CLAUDE.md"
echo ""
echo -e "  Next steps:"
echo -e "    1. Review and customize CLAUDE.md for your project"
echo -e "    2. Start the runner:  cd ~/actions-runner && ./run.sh"
echo -e "    3. Commit and push the workflow/agent files"
echo -e "    4. Create a test issue to verify the pipeline"
echo ""
echo -e "  Pipeline flow:"
echo -e "    Issue created → PO agent evaluates → labels 'po-approved'"
echo -e "    → Architect agent plans → labels 'architect-approved'"
echo -e "    → Builder agent implements → creates PR"
echo ""
echo -e "  ${CYAN}Your machine must be on and the runner active for jobs to execute.${NC}"
echo -e "  ${CYAN}If offline, jobs queue and run when you're back.${NC}"
