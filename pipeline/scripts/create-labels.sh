#!/usr/bin/env bash
# =============================================================================
# Create required GitHub labels for the agentic pipeline
# Usage: ./scripts/create-labels.sh --repo <owner/repo>
# =============================================================================

set -euo pipefail

REPO="${1:?Usage: ./scripts/create-labels.sh <owner/repo>}"

echo "Creating pipeline labels for $REPO..."

create_label() {
  local name="$1" color="$2" description="$3"
  if gh label create "$name" --repo "$REPO" --color "$color" --description "$description" 2>/dev/null; then
    echo "  ✅ Created: $name"
  else
    # Label might already exist — try to update it
    gh label edit "$name" --repo "$REPO" --color "$color" --description "$description" 2>/dev/null && \
      echo "  🔄 Updated: $name" || echo "  ⚠️  Skipped: $name"
  fi
}

create_label "po-approved"         "0E8A16" "Product Owner approved this issue"
create_label "po-needs-info"       "FBCA04" "PO has questions for the author"
create_label "architect-approved"  "1D76DB" "Architect approved with implementation plan"
create_label "architect-blocked"   "D93F0B" "Architectural concerns to resolve first"
create_label "build-complete"      "0E8A16" "Implementation PR has been created"
create_label "ready-for-review"    "7057FF" "PR is ready for human review"
create_label "automated"           "BFDADC" "Created by pipeline automation"
create_label "health-scan"         "C2E0C6" "From weekly codebase health scan"
create_label "security"            "D93F0B" "Security-related finding"
create_label "testing"             "BFD4F2" "Test coverage gap"
create_label "tech-debt"           "FEF2C0" "Technical debt to address"
create_label "accessibility"       "D4C5F9" "Accessibility improvement needed"

echo ""
echo "Done. Labels are ready at https://github.com/$REPO/labels"
