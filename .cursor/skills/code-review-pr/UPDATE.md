# Code Review PR Skill - Update Instructions

**Share this with your team** so everyone uses the same multi-agent workflow.

## What Changed

The skill now supports **3 reviewers + 1 validator**:

- **Claude Code**, **GPT**, and **Cursor** each contribute findings to shared JSON files
- A **validator** aggregates all findings, deduplicates, and produces the final report
- Findings from multiple agents get confidence boosts when they agree

## How to Update

1. **Replace** your existing `code-review-pr` skill with this version:
   - Project: copy `.cursor/skills/code-review-pr/` into your repo
   - Personal: copy to `~/.cursor/skills/code-review-pr/`

2. **Create** `.code-review/` in your repo root (on first use, or manually):
   ```bash
   mkdir .code-review
   ```

3. **Optional**: Add `.code-review/` to `.gitignore` if findings should stay local. Omit if you want to commit findings for CI or team sharing.

## New Commands

| Command | Action |
|---------|--------|
| `/code-review` | Run review, write findings to `.code-review/findings-{agent}.json` |
| `/code-review --validate` | Aggregate all findings, deduplicate, output final report |
| `/code-review --validate --comment` | Same + post to PR via `gh` |

## Agent Identification

Tell the agent which LLM you use so it writes to the correct file:

- "Code review as Claude Code" -> `findings-claude-code.json`
- "Code review as GPT" -> `findings-gpt.json`
- "Code review" (in Cursor) -> `findings-cursor.json`

## Workflow

1. Person with Claude Code runs `/code-review` -> writes `findings-claude-code.json`
2. Person with GPT runs `/code-review` -> writes `findings-gpt.json`
3. Person with Cursor runs `/code-review` -> writes `findings-cursor.json`
4. Anyone runs `/code-review --validate` -> merged, deduplicated final report
