---
name: code-review-pr
description: Automated code review for pull requests using multi-perspective analysis and confidence-based scoring. Supports multiple LLM reviewers (Claude Code, GPT, Cursor) contributing findings to a shared format, plus a validator to aggregate and deduplicate. Use when reviewing PRs, code changes, contributing findings, or running /code-review, /code-review --validate.
---

# Code Review (PR) - Multi-Agent

Automated code review with multi-perspective analysis and confidence scoring. Supports **3 reviewers + 1 validator** workflow: Claude Code, GPT, and Cursor each contribute findings; the validator aggregates and deduplicates into a final report.

## Modes

| Mode | Command | What it does |
|------|---------|--------------|
| **Review** | `/code-review` | Run review, write findings to `.code-review/findings-{agent}.json` |
| **Validate** | `/code-review --validate` | Read all findings, deduplicate, merge, output final report |

## Shared Findings Format

All agents write to `.code-review/findings-{agent}.json`. Use the agent slug: `claude-code`, `gpt`, or `cursor`.

**File structure:**
```json
{
  "version": "1.0",
  "agent": "cursor",
  "timestamp": "2025-02-10T12:00:00Z",
  "pr": { "branch": "feature-x", "sha": "abc123..." },
  "findings": [
    {
      "title": "Missing error handling for OAuth callback",
      "reason": "CLAUDE.md compliance",
      "confidence": 85,
      "file": "src/auth.ts",
      "lineStart": 67,
      "lineEnd": 72,
      "sha": "abc123...",
      "url": "https://github.com/owner/repo/blob/abc123.../src/auth.ts#L67-L72",
      "detail": "CLAUDE.md says 'Always handle OAuth errors'"
    }
  ]
}
```

## Review Mode (Contributing)

When the user says "code review" or `/code-review`:

1. **Identify agent**: Use `cursor`, `claude-code`, or `gpt` (ask if unclear)
2. **Gather context**: CLAUDE.md, .cursorrules, AGENTS.md
3. **Get changes**: `git diff` or `gh pr diff`
4. **Audit from 4 perspectives**:
   - Compliance (CLAUDE.md / guidelines)
   - Compliance (redundant pass)
   - Bugs (in changed code only)
   - History (git blame, context-based issues)
5. **Score each issue** 0-100 (see Confidence Scoring)
6. **Filter**: Keep only issues with confidence >= 80
7. **Write** to `.code-review/findings-{agent}.json`
8. **Output** a summary to chat (e.g., "Wrote 3 findings to .code-review/findings-cursor.json")

## Validate Mode (Aggregating)

When the user says "validate review" or `/code-review --validate`:

1. **Read** all `.code-review/findings-*.json` files
2. **Deduplicate**:
   - Same file + overlapping line range + similar title/reason → treat as same issue
   - Merge: keep highest confidence, list which agents found it
3. **Boost confidence** when 2+ agents agree: add 5 per agreeing agent (cap at 100)
4. **Filter**: Keep only merged confidence >= 80
5. **Output** final report in review format (see below)
6. **Optional**: Post to PR with `--comment` if `gh` available

## Confidence Scoring

| Score | Meaning |
|-------|---------|
| 0 | Not confident, likely false positive |
| 25 | Somewhat confident, might be real |
| 50 | Moderately confident, real but minor |
| 75 | Highly confident, real and important |
| 100 | Absolutely certain, definitely real |

For CLAUDE.md issues: only score 80+ if the guideline explicitly mentions the violation.

## What to Filter Out (Do Not Report)

- Pre-existing issues not introduced in this PR
- Code that looks like a bug but isn't
- Pedantic nitpicks
- Issues linters will catch
- General quality issues (unless in CLAUDE.md)
- Issues where code has explicit lint-ignore comments

## Final Report Format (Validator Output)

```markdown
## Code review (validated)

Found N issues (from cursor, claude-code, gpt):

1. [Issue title] ([reason]) — found by: cursor, claude-code

[GitHub blob URL]

2. ...
```

### Link Format

```
https://github.com/owner/repo/blob/[full-sha]/path/file.ext#L[start]-L[end]
```

## When to Skip Review

- Closed or draft PRs
- Trivial / automated PRs
- PR already has a recent review
- No changes to review

## Setup (Tell Everyone)

1. **Create `.code-review/`** in repo root (add to .gitignore if findings should stay local)
2. **Install this skill** into `.cursor/skills/code-review-pr/` (or personal `~/.cursor/skills/`)
3. **Agent identifier**: When running review, specify agent: "I'm using Claude Code" or "run as gpt" so the correct `findings-{agent}.json` is written

## Workflow

```bash
# Person 1 (Claude Code): contribute findings
/code-review
# -> writes .code-review/findings-claude-code.json

# Person 2 (GPT): contribute findings
/code-review
# -> writes .code-review/findings-gpt.json

# Person 3 (Cursor): contribute findings
/code-review
# -> writes .code-review/findings-cursor.json

# Anyone: validate and get final report
/code-review --validate
# -> reads all 3, merges, deduplicates, outputs final report

# Optional: post to PR
/code-review --validate --comment
```

## Requirements

- Git repository (GitHub preferred for link format)
- `gh` CLI for PR details and posting (optional)
- `.code-review/` directory (create on first run)

## Additional Resources

- For troubleshooting and configuration, see [reference.md](reference.md)
- For findings JSON schema, see [schema.md](schema.md)
