# Connecting an AI agent to Garely (MCP)

Garely speaks the **Model Context Protocol**, so Claude (or any MCP client) can search
and read this workspace's meetings: transcripts, AI reports, decisions and tasks. You
ask a question in plain language, the agent searches every meeting you can access and
answers with links back into Garely.

The endpoint is **read-only**. No tool here creates, edits or deletes anything.

## Connect

1. Open **Settings → Profile → Connect an AI agent** and create a token. It is shown
   once; copy it then.
2. Point your client at `https://<your-garely>/api/mcp` with the token as a bearer header.

Claude Code:

```bash
claude mcp add --transport http garely https://meet.example.com/api/mcp \
  --header "Authorization: Bearer gmcp_…"
```

Claude Desktop: add the same URL and header under MCP servers in settings.

Then just ask:

> Пройдись по всіх мітах за вересень і збери, що ми вирішили про Allegro.

The agent will search, open the two or three meetings that matter, and cite them.

## What the agent can do

| Tool | What it answers |
|---|---|
| `search_meetings` | "What did we decide about X", "who raised Y" — searches every transcript and report at once |
| `list_meetings` | The index of meetings in a period, optionally with each summary |
| `get_meeting_report` | One meeting in full: summary, topics, decisions, tasks, open questions |
| `get_transcript` | The raw transcript of one meeting, paginated, or only the lines matching a query |
| `list_tasks` | Open and overdue tasks, by owner, status or meeting |
| `list_decisions` | The decisions registry |

Six wide tools, not one per API endpoint: a client loads every description into its
context, and a model given 150 near-identical tools picks badly.

## What it can see

**Exactly what you can see in the web UI, and nothing else.** The token carries your
identity, so every query runs through the same access rules as the browser: admins see
every meeting, everyone else sees the ones they created or took part in. A meeting you
cannot open answers the same as one that does not exist.

Consequences worth knowing:

- Your token is not a workspace key. Handing it to someone gives them **your** view.
- Blocking an account cuts off its agents at the same moment as its browser session.
- Revoking a token takes effect on the next call. There is no grace period.
- The token is stored as a SHA-256 hash. A lost token is replaced, never recovered.

## Notes on how it is built

- **Stateless JSON-RPC over one POST.** No SSE, no session state. A long-lived stream
  would be cut by nginx's 60-second and Cloudflare's 100-second read timeouts.
- **No new service.** It runs inside the Next app, sharing Prisma, config and the
  access helpers in `lib/access.ts` — one deploy unit, one authorization model.
- **Rate limited per token** at 120 calls a minute, because agents retry hard.
- Answers are capped: search returns ranked excerpts rather than whole transcripts, and
  `get_transcript` pages. A 50-minute meeting does not fit in a model's context, and
  dumping it there is both slow and worse at answering.

## Deliberately not exposed

Servers and their credentials, workspace settings, integration secrets, and any write
path. Transcripts contain words spoken by guests who are not part of the company; an
agent that could both read them and act on them would be a prompt-injection channel.
Read-only keeps that door shut. If write tools are ever added, they belong behind a
separate scope that is off by default.
