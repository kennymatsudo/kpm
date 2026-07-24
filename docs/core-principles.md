# Core Principles

The commitments a contributor — human or agent — should consult when a feature decision is contested. These are descriptive first (they explain why KPM is built the way it is) and prescriptive second (they tell you which way to lean).

## Skim summary

| # | Principle | One-line rule |
|---|-----------|---------------|
| P1 | Single-user cockpit | No seats, permissions, shared state, or conflict resolution. |
| P2 | Chat grounded in the project | Live plan + project context + focused resources + repos are always in scope. |
| P3 | Cross-repo first | A plan can span any number of connected repos. |
| P4 | Plans live in KPM | SQLite, not files in the repo. |
| P5 | Extend the dev setup | Inherit the user's MCP tools; don't replace their env. |
| P6 | Internal stays internal | Translate at every export boundary; refs and spec fields are local-only. |
| P7 | Reads by default | Chat is read-only against repos; writes are scoped to worktrees. |
| P8 | Claude proposes, user configures disposal | Plan mutations go through the `PlanAction` approval flow unless the user explicitly enables auto-apply. |
| P9 | Agent execution is a lifecycle | A bounded, persisted run driven by a chosen playbook (default: implement → opposing review → one address pass → human review) — never a one-shot prompt. |
| P10 | Sync on your terms | No live feeds. Inbound queues; outbound drafts. |

---

## 1. Single-user cockpit

KPM is the place one developer goes to know what to do next, why it matters, and where it stands. It is not a system of record for a team. Jira and Linear remain the org's source of truth; KPM is the developer's source of truth. The two are deliberately decoupled: KPM's plan hierarchy can be richer, faster, and messier than what gets exported, because only what crosses the export boundary becomes the team's problem.

**Lean toward:** features that make one person's day faster.
**Lean away from:** seats, permissions, shared state, conflict-resolution UX. There is one user.

---

## 2. The chat is a thinking partner grounded in the project

The chat always works against the live plan, project context and focused resources, and connected repos rather than starting cold. It is the primary surface for exploration, triage, investigation, and re-hydration — not a generic AI chat bolted onto a task manager. The user rarely asks Claude to do something in the abstract; they ask Claude to think alongside them with the project's real state available.

**Lean toward:** features that deepen general grounding and user-configurable capabilities (better focused resources, customizable prompts, faster doc re-hydration from live repo state).
**Lean away from:** chat experiences that start without project context, or that treat the chat as a separate mode from the plan.

---

## 3. Cross-repo first

KPM spans all connected repos so the developer doesn't have to. Plans and context live in one place regardless of how many repos the work touches. This is the layer the org's tracker can't be: Jira and Linear can link tickets, but they can't tell a developer that a Fender PR depends on a K-Repo migration which depends on an App rate-limit change. KPM's hierarchy, relations, and references are explicitly designed to coordinate across repositories without forcing a shared one.

**Lean toward:** features that make a multi-repo effort legible from one place.
**Lean away from:** assuming a single working directory or a single language.

---

## 4. Plans live in KPM, not in repos

Planning data — items, notes, and context — lives in KPM's SQLite database. It does not live as files inside repos. Code changes go wherever they need to; plan artifacts do not pollute the working tree, do not risk accidental commits, and do not require .gitignore entries. The two concerns are separate: KPM is connected to repos, not embedded in them.

---

## 5. Extend the developer's setup intentionally

KPM inherits the developer's MCP tools and adds capability on top. It does not inherit the entire Claude environment transparently — some boundaries are intentional (settings sources, tool scope) to keep the cockpit predictable. The goal is to bring in what the developer already has and augment it, not to replace it with a more limited interface and not to blindly pass through everything.

**Lean toward:** surfacing the developer's existing tools and prompts inside KPM.
**Lean away from:** stripping capability to protect a simpler abstraction, or assuming KPM is a transparent proxy for the full Claude environment.

---

## 6. Internal vocabulary stays internal; exports are clean

KPM has its own internal syntax and references. None of it leaks to external systems. Every export boundary — Jira, Linear, Confluence, GitHub — must translate internal references and clean up internal-only fields before sending. Spec fields like `intent` and `acceptance_criteria` are local; `description` is what gets synced. Internal references are resolved to human-readable text at the boundary. A Jira ticket should never contain KPM internals.

**The rule:** if it's crossing an export boundary, it must be translated. No exceptions.

---

## 7. Claude reads by default; writes are always explicit and scoped

In the chat context, repos are read-only by default. Claude can scan, analyze, and reason about any connected repo without risk of accidental modification. Writes require explicit instruction. In agent execution, writes are scoped to an isolated worktree — the developer's actual working branches are not touched until they choose to merge.

**Why:** exploration and investigation are the high-frequency use of KPM. Making reads safe by default means the developer can open the chat and ask anything without worrying about side effects.

---

## 8. Claude proposes, user configures disposal

By default, every Claude action that mutates the plan emits a `PlanAction[]` that surfaces in an approval modal before anything is written. The user is the last reviewer unless they explicitly choose the global auto-apply setting.

When auto-apply is enabled, Claude still uses the same structured KPM change paths (`PlanAction[]`, document update events, context update events, deletion events); KPM applies them immediately instead of showing an approval modal. Tools must not bypass those paths or write directly to the database.

The plan is the developer's mental model externalized. Approval remains the safe default, but a single-user cockpit can let the user trade review friction for speed when they deliberately opt in.

**Lean toward:** making approvals fast (preview, batch, undo) and making auto-apply explicit, reversible, and clearly labeled.
**Lean away from:** hidden bypasses, per-tool direct database writes, or silently changing the default review behavior.

---

## 9. Agent execution is a lifecycle

Running a coding agent is not a prompt — it is a structured run with a beginning, middle, and end. Each plan item gets an isolated git worktree so parallel runs don't collide. Implementation runs under one agent; review runs under a different one so the implementer isn't grading its own work. The automation phase is persisted to `dev_sessions.automation_phase` so the run survives restarts, stops, and resumes. Agents are interchangeable — Claude, Codex, and others plug into the same harness. The specific sequence is a *playbook* the user chooses and can configure; KPM keeps the safety rails constant across every playbook — worktree isolation, persisted phase, opposing review by policy, and bounded terminal states.

**The default playbook:** implement → opposing review → one addressing pass → human review. Other playbooks define a different bounded sequence; none is a one-shot prompt and none loops forever.

**Lean toward:** features that extend the harness (isolation, review quality, persisted state).
**Lean away from:** one-shot prompts without accountability, renderer-only orchestration state, agent identity baked into the schema.

---

## 10. Org systems sync on your terms

Import from Jira or Linear when you want to. Export when you're ready. No live feeds, no push-driven surprises. Inbound signals queue for triage; outbound artifacts are drafted and reviewed before they leave the cockpit. The developer's local reality does not become the team's reality until they decide.
