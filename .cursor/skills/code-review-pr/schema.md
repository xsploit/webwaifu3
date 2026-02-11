# Findings JSON Schema

Shared format for findings from any agent (Claude Code, GPT, Cursor).

## File Naming

`.code-review/findings-{agent}.json`

Agents: `claude-code`, `gpt`, `cursor`

## Root Object

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| version | string | Yes | `"1.0"` |
| agent | string | Yes | `claude-code` \| `gpt` \| `cursor` |
| timestamp | string | Yes | ISO 8601 |
| pr | object | No | PR context |
| pr.branch | string | No | Branch name |
| pr.sha | string | No | Full commit SHA |
| findings | array | Yes | Array of finding objects |

## Finding Object

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| title | string | Yes | Short issue title |
| reason | string | Yes | `CLAUDE.md compliance` \| `bug` \| `history context` |
| confidence | number | Yes | 0-100 |
| file | string | Yes | Path from repo root |
| lineStart | number | Yes | Start line |
| lineEnd | number | Yes | End line |
| sha | string | Yes | Full commit SHA |
| url | string | Yes | GitHub blob URL |
| detail | string | No | Extra context |

## Example

```json
{
  "version": "1.0",
  "agent": "cursor",
  "timestamp": "2025-02-10T12:00:00Z",
  "pr": { "branch": "feature-auth", "sha": "abc123def456" },
  "findings": [
    {
      "title": "Missing error handling for OAuth callback",
      "reason": "CLAUDE.md compliance",
      "confidence": 85,
      "file": "src/auth.ts",
      "lineStart": 67,
      "lineEnd": 72,
      "sha": "abc123def456",
      "url": "https://github.com/owner/repo/blob/abc123def456/src/auth.ts#L67-L72",
      "detail": "CLAUDE.md says 'Always handle OAuth errors'"
    }
  ]
}
```
