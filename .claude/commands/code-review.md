---
description: Run multi-agent PR review in contributor mode (write findings JSON) or validator mode (merge all findings), with confidence filtering and optional PR comment.
argument-hint: [--validate] [--comment] [--agent <claude-code|cursor|gpt>]
allowed-tools: Bash(gh:*), Bash(git:*), Bash(rg:*), Bash(find:*), Bash(cat:*), Bash(head:*), Bash(sed:*), Bash(awk:*), Bash(node:*), Bash(mkdir:*), Task, Read, Grep, Glob
---

Run an automated pull request review with shared findings files so multiple agents/LLMs can contribute.

Arguments: `$ARGUMENTS`

Parse flags:

1. `is_validate=true` when `$ARGUMENTS` contains `--validate`.
2. `post_comment=true` when `$ARGUMENTS` contains `--comment`.
3. `agent`:
   - If `$ARGUMENTS` includes `--agent <value>`, use it.
   - Allowed: `claude-code`, `cursor`, `gpt`.
   - Default to `claude-code` when omitted.
4. Ensure `.code-review/` exists (`mkdir -p .code-review`).

## Review goals

1. Skip closed, draft, trivial/automated, or already-reviewed PRs.
2. Gather and apply repository `CLAUDE.md` guidance.
3. In contributor mode: review changed code with 4 parallel agents:
   - Agent 1: `CLAUDE.md` compliance audit
   - Agent 2: independent `CLAUDE.md` compliance audit
   - Agent 3: obvious bugs introduced by the PR
   - Agent 4: historical context via `git blame` / `git log`
4. Score each issue from 0 to 100 confidence.
5. Filter out issues below 80.
6. In contributor mode: write findings to `.code-review/findings-<agent>.json`.
7. In validator mode: read all agent findings files, deduplicate and merge.
8. Output to terminal, or post PR comment when `--comment` is present.

## Required process

### 1) Preflight and PR discovery

1. Confirm tooling:
   - Run `gh --version` and `gh auth status`.
2. Resolve PR:
   - Prefer `gh pr view --json number,url,title,body,state,isDraft,author,additions,deletions,changedFiles,headRefOid`.
   - If that fails, stop with a clear instruction to run the command from a PR branch or pass PR context.
3. Skip immediately when:
   - `state` is not `OPEN`
   - `isDraft` is true
4. Detect already-reviewed status using marker comment:
   - Marker format: `<!-- code-review-plugin:v1 sha=<HEAD_SHA> mode=validated -->`
   - Run `gh pr view --comments` and skip if the exact marker already exists.
   - Only apply this skip when `is_validate=true` (contributors should still be able to write findings).

### 2) Trivial/automated PR skip check

Skip when PR is clearly trivial/automated:

1. Author is bot-like (`dependabot`, `renovate`, `github-actions[bot]`) AND changes are dependency/version churn.
2. `changedFiles <= 2` AND `additions + deletions <= 25` with no logic changes.
3. Files are only lockfiles/version metadata/docs formatting (for example: `package-lock.json`, `pnpm-lock.yaml`, `yarn.lock`, `.md` typo-only changes).

If skipped, print one concise reason and stop.

### 3) Gather context

1. Repo identity:
   - `gh repo view --json nameWithOwner -q .nameWithOwner`
   - Save as `OWNER_REPO`.
2. Collect guidelines:
   - Find all `CLAUDE.md` files in repo (exclude `node_modules`, `.git`, build output).
   - Read all discovered files. If none, continue without guideline checks.
3. Collect PR change set:
   - `gh pr diff --name-only`
   - `gh pr diff`
   - `gh pr view --json files` (for per-file additions/deletions)
4. Build short PR summary:
   - Intent, main files touched, risk areas.

### 4) Contributor mode only: launch 4 parallel review agents

If `is_validate=true`, skip this section and go to section 5B.

Run 4 `Task` tool calls in parallel. Provide each agent:

1. PR summary.
2. Relevant `CLAUDE.md` guidance (full text if small, otherwise targeted excerpts).
3. Changed files and diff hunks.
4. Constraint: report only issues introduced by this PR.

Each agent must return JSON array only. Schema:

```json
[
  {
    "title": "string",
    "description": "string",
    "path": "relative/file/path.ts",
    "startLine": 10,
    "endLine": 14,
    "category": "claude-guideline|bug|history-context",
    "evidence": "why this is a real issue introduced by this PR",
    "guidelineFile": "path/to/CLAUDE.md or null",
    "guidelineQuote": "exact guideline text or null"
  }
]
```

Agent requirements:

1. Agents 1 and 2:
   - Check explicit `CLAUDE.md` compliance only.
   - Do not invent guidelines.
   - Include `guidelineFile` and `guidelineQuote`.
2. Agent 3:
   - Find obvious functional bugs/regressions in changed code.
3. Agent 4:
   - Use `git blame` / `git log -p` around changed lines for context.
   - Exclude pre-existing issues not introduced by the PR.

### 5A) Contributor mode: consolidate and confidence-score

1. Merge agent outputs.
2. Deduplicate similar issues (same path + same root cause).
3. For each issue, assign confidence score `0-100` with strict criteria:
   - `0`: false positive / no evidence
   - `25`: weak signal, uncertain
   - `50`: moderate confidence, real but lower impact
   - `75`: high confidence, real and important
   - `100`: certain and directly evidenced
4. Apply false-positive filters:
   - Pre-existing problems not introduced by this PR
   - Speculative/pedantic suggestions
   - Pure lint/style nits likely handled by linters
   - Claims contradicted by code or history context
   - Guideline claims without explicit `CLAUDE.md` support
5. Keep only issues with confidence `>= 80`.
6. Build per-issue link with full `HEAD_SHA`:
   - `https://github.com/<OWNER_REPO>/blob/<HEAD_SHA>/<PATH>#L<START>-L<END>`

### 5B) Validator mode: aggregate contributed findings

1. Read all files matching `.code-review/findings-*.json`.
2. Validate structure against `.code-review/schema.json` (or the schema section below).
3. Ignore malformed files, but report which file failed validation.
4. Normalize each finding to:
   - `title`, `reason`, `confidence`, `file`, `lineStart`, `lineEnd`, `sha`, `url`, `detail`, `agent`
5. Deduplicate merged issues:
   - Treat as same issue if `file` is identical, line ranges overlap, and root cause is clearly the same.
6. Merge duplicates:
   - `foundBy`: unique agent list
   - `baseConfidence`: max confidence among duplicates
   - `mergedConfidence`: `min(100, baseConfidence + 5 * (foundByCount - 1))`
7. Keep only issues where `mergedConfidence >= 80`.
8. Prefer links using current PR `HEAD_SHA`; if unavailable, fall back to finding `url`.

### 6) Contributor mode: write shared findings artifact

Write JSON to `.code-review/findings-<agent>.json` with this shape:

```json
{
  "version": "1.0",
  "agent": "<agent>",
  "timestamp": "<ISO8601>",
  "pr": {
    "number": 123,
    "url": "https://github.com/owner/repo/pull/123",
    "branch": "feature-branch",
    "sha": "<HEAD_SHA>"
  },
  "findings": [
    {
      "title": "Issue title",
      "reason": "CLAUDE.md compliance|bug|history context",
      "confidence": 85,
      "file": "src/example.ts",
      "lineStart": 10,
      "lineEnd": 14,
      "sha": "<HEAD_SHA>",
      "url": "https://github.com/<OWNER_REPO>/blob/<HEAD_SHA>/src/example.ts#L10-L14",
      "detail": "Concise explanation",
      "guidelineFile": "path/to/CLAUDE.md or null",
      "guidelineQuote": "exact CLAUDE.md guideline text or null"
    }
  ]
}
```

Rules:

1. Overwrite the current agent's file on each run.
2. Use full SHA, never abbreviated.
3. Keep only confidence `>= 80` in saved findings.

### 7) Output or comment

If no issues remain (`>= 80`) for the active mode:

1. Print: `No high-confidence issues found (threshold: 80).`
2. In contributor mode, still write an empty findings file for the agent.
3. Do not post comment.

If issues remain:

1. Build markdown:
   - Contributor mode header: `## Code review (contributor: <agent>)`
   - Validator mode header: `## Code review (validated)`

```markdown
<!-- code-review-plugin:v1 sha=<HEAD_SHA> mode=validated -->
## Code review (validated)

Found <N> issues:

1. <Issue title and concise explanation>
   Confidence: <score>
   Found by: <agent1, agent2>  (validator mode only)

https://github.com/<OWNER_REPO>/blob/<HEAD_SHA>/<PATH>#L<START>-L<END>
```

2. If `post_comment=true`:
   - In contributor mode: do not comment unless explicitly asked by user to comment contributor output.
   - In validator mode, post with:
   - `gh pr comment <PR_NUMBER> --body-file <tempfile>`
3. Always print terminal output, even when comment posting succeeds.

## Built-in schema (fallback)

If `.code-review/schema.json` does not exist, enforce this minimum validation:

1. Root fields required: `version`, `agent`, `timestamp`, `findings`.
2. `version` must be `"1.0"`.
3. `agent` must be `claude-code|cursor|gpt`.
4. Each finding must include:
   - `title` string
   - `reason` string
   - `confidence` number `0-100`
   - `file` string
   - `lineStart` positive integer
   - `lineEnd` integer `>= lineStart`
   - `sha` string
   - `url` string

## Quality bar

1. Prefer precision over quantity.
2. Only include actionable issues with clear evidence.
3. Keep explanations concise and specific to changed code.
4. If uncertain, score below 80 and filter it out.
