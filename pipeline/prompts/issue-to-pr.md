Check for new GitHub issues that need implementation in the following repos:
- stormsoftwaregroup/calendar (local path: C:/Dev/calendar)

For each repo, run: gh issue list --repo <owner/repo> --state open --json number,title,body,labels --jq '[.[] | select(.labels | map(.name) | index("in-progress") | not)]'

If there are no issues without the "in-progress" label, do nothing.

For each new issue found:

1. Add the "in-progress" label: gh label create "in-progress" --repo <owner/repo> 2>/dev/null; gh issue edit <number> --repo <owner/repo> --add-label "in-progress"

2. Navigate to the local repo directory for that project.

3. Make sure you're on the main branch and up to date: git checkout main && git pull

4. Create a feature branch: git checkout -b feature/issue-<number>

5. Read the issue carefully. Read CLAUDE.md for project conventions. Explore the codebase to understand relevant files and patterns.

6. If the issue is vague or missing details, fill them in yourself:
   - Write acceptance criteria
   - Define scope
   - State assumptions
   - Identify edge cases
   Do NOT ask the issue author for clarification. You are the engineer. Decide and build.

7. Plan your implementation. Decide which files to change, which patterns to follow, what tests to write. Do not post the plan anywhere — just do it.

8. Implement the code. Follow existing patterns. Follow CLAUDE.md conventions. Commit atomically with conventional commit messages referencing the issue number.

9. Write tests:
   - Unit tests for new functions
   - Integration tests for service interactions
   - E2E tests with Playwright for UI changes
   - Run the full test suite. If tests fail, fix and re-run. Do not skip tests.

10. Use Playwright MCP to visually verify UI changes if applicable. Screenshot key states. Fix any visual bugs.

11. Self-review your work. Read your own diff. Look for:
    - Missed edge cases
    - Unclear naming
    - Unnecessary complexity
    - Missing error handling
    - Incomplete tests
    - Security issues (hardcoded secrets, injection, auth flaws)
    - Accessibility gaps (ARIA, keyboard nav, contrast)
    Fix anything you would flag in a code review. Repeat until satisfied.

12. Push the branch and create a PR:
    - git push -u origin feature/issue-<number>
    - gh pr create --title "feat: <description> (#<number>)" --body "Closes #<number>\n\n<summary of what was implemented and tested>"
    - gh issue comment <number> --repo <owner/repo> --body "PR created: <pr_url>"

13. If you genuinely cannot proceed (repo won't build, tests are fundamentally broken in ways unrelated to your changes), post a comment on the issue explaining what blocked you and add the "agent-failed" label. This should be extremely rare.
