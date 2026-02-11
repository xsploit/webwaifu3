# Code Review PR - Reference

## Multi-Agent Setup

### Sharing the Skill

Distribute this skill to your team:

1. Copy `.cursor/skills/code-review-pr/` to your repo (project skill) or `~/.cursor/skills/` (personal)
2. Create `.code-review/` in repo root (optional: add to .gitignore if findings stay local)
3. Each reviewer uses their agent: Claude Code, GPT, or Cursor

### Agent Identification

When running review, tell the agent which one you use:

- "Run code review as Claude Code" -> `findings-claude-code.json`
- "Run code review as GPT" -> `findings-gpt.json`
- "Run code review" (in Cursor) -> `findings-cursor.json`

### Validator Behavior

- Reads all `findings-*.json` in `.code-review/`
- Deduplicates by file + overlapping lines + similar title
- Boosts confidence +5 per agreeing agent (max 100)
- Outputs merged report with "found by: agent1, agent2"

## Configuration

### Confidence Threshold

Default: 80. Only issues scoring 80 or higher are reported.

To adjust: edit the skill and change "Report only issues with confidence >= 80" to your preferred value (0-100).

### Customizing Review Focus

Add or modify perspectives in the skill:
- Security-focused analysis
- Performance analysis
- Accessibility checking
- Documentation quality

## Troubleshooting

### Review takes too long

Normal for large PRs. Consider splitting large PRs into smaller ones.

### Too many false positives

- Default threshold 80 already filters most
- Make CLAUDE.md more specific
- Re-evaluate if flagged issues are actually valid

### No review comment posted

Check:
- PR is closed (reviews skipped)
- PR is draft (reviews skipped)
- PR is trivial/automated (reviews skipped)
- PR already has review (reviews skipped)
- No issues scored >= 80 (no comment needed)

### Link formatting broken

Links must follow:
```
https://github.com/owner/repo/blob/[full-sha]/path/file.ext#L[start]-L[end]
```
- Full SHA (not abbreviated)
- `#L` notation
- Line range with at least 1 line of context

### GitHub CLI not working

- Install: `brew install gh` (macOS) or see [GitHub CLI installation](https://cli.github.com/)
- Authenticate: `gh auth login`
- Verify repository has GitHub remote

## Best Practices

- **Write specific CLAUDE.md files**: Clear guidelines improve reviews
- **Include context in PRs**: Helps understand intent
- **Trust the 80+ threshold**: Filtered issues are usually correct
- **Iterate on guidelines**: Update CLAUDE.md based on recurring patterns
- **Trust the filtering**: Threshold prevents noise

## Technical Details

### Perspectives

1. **2x Compliance**: CLAUDE.md / project guideline verification (redundancy catches misses)
2. **1x Bug detector**: Obvious bugs in changes only
3. **1x History analyzer**: Git blame and history for context-based issues

### Scoring

- Each issue scored 0-100 independently
- Considers evidence strength and verification
- For CLAUDE.md: verify guideline explicitly mentions the violation
