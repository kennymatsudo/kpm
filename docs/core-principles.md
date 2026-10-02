# Core Principles

The commitments to consult when a design decision is contested. Each one takes a side on purpose: it says why KPM is built the way it is, then which way to lean. Principles name no files, tools, or settings; the mechanisms that enforce them are the invariants in [`AGENTS.md`](../AGENTS.md), which cite them as (P1)…(P10).

## Product

### 1. One developer's cockpit

KPM is where one developer goes to know what to do next, why it matters, and where it stands. The org's tracker is the team's source of truth; KPM is the developer's. The two are deliberately decoupled, so KPM's plan can be richer, faster, and messier than what the team sees. Only what the developer exports becomes the team's problem.

**Lean toward:** features that make one person's day faster.
**Lean away from:** seats, permissions, shared state, and conflict-resolution UX. There is one user.

---

### 2. Plans stay out of repos

Plans, notes, and project context belong to KPM, not to the code they describe. They never live as files inside a connected repo, so they can't be committed by accident and need no ignore rules. KPM is connected to repos, not embedded in them.

**Lean toward:** keeping every planning artifact in KPM's own storage.
**Lean away from:** plan files, exports, or tool folders written into a working tree.

---

### 3. Grounded in the whole project

The chat is a thinking partner that starts from the project's real state: the live plan, the project context, and every connected repo. The developer rarely asks for something in the abstract; they ask the AI to think alongside them with the project in view. Work often spans several repos, and KPM is the one place that sees them together. A tracker can link tickets but can't tell you that a frontend change depends on a migration that depends on an API change.

**Lean toward:** deeper grounding, and making a multi-repo effort legible from one place.
**Lean away from:** chat that starts cold, treating chat as a mode separate from the plan, and assuming a single repo or language.

---

### 4. Watch freely; act for the developer only with consent

Reading is free. KPM may read repos, scan files, poll for changes, and analyze them without ceremony, because exploration is most of what the developer does here and has no side effects.

Acting is not free. Anything that changes the plan, leaves the machine, or speaks as the developer needs their consent first. Changes the AI proposes go through review. The developer may choose to auto-apply plan edits, but not changes to how KPM's automation behaves, because text planted in a ticket or document could otherwise install behavior that outlives the chat. Trackers sync when the developer asks, and inbound changes are reviewed before they touch the plan. Consent may be standing, but it must be scoped, visible, and easy to take back.

**Lean toward:** fast review (preview, batch, undo), and consent that is obvious and revocable.
**Lean away from:** hidden bypasses, live push feeds from trackers, and consent that quietly widens beyond what the developer agreed to.

---

### 5. Inherit the developer's setup; don't imitate it

KPM runs on the developer's own tools and adds capability on top: their harness, permission rules, sandbox, and integrations all apply, and KPM's own tools sit beside them. The developer has already made those safety decisions in the tool built for them. A second, stricter answer inside KPM would refuse work their setup allows and push it into another window.

Read each setting from the tool that owns it; never approximate it. Each provider keeps its own native behavior; KPM does not wrap one in another to fake identical semantics, and it declares their differences rather than discovering them at runtime. Scope follows the work. A chat spans several repos, so no single repo's settings speak for it; an agent working inside one repo follows that repo's settings too.

**Lean toward:** passing the developer's setup through unchanged, and tracking their tools as they move forward.
**Lean away from:** KPM-side gates layered over the developer's own, stripping capability to protect a simpler abstraction, and pinning to one version of a tool.

---

### 6. Never silently substitute

When KPM can't do what the developer chose, it stops and says so. A model that is no longer available is not swapped for another; an agent that can't run is not replaced behind the developer's back; a number KPM couldn't measure is shown as unknown, not guessed; a tracker deletion that failed keeps its place until it succeeds. A visible failure costs a moment. A silent substitution costs trust in everything else KPM reports.

**Lean toward:** explicit failure with a clear way to recover.
**Lean away from:** fallbacks that change what the developer asked for without telling them.

---

### 7. Automation is a lifecycle, not a prompt

Anything KPM runs on its own (an agent working a task, a background check, a scheduled action) has a beginning, a bounded middle, and a named end. Its state is persisted, so it survives restarts, stops, and resumes. Every loop has a limit, so none runs forever. Agents write in isolation, so the developer's own branches are untouched until they merge, and work can be reviewed by a different agent than the one that wrote it. Agents are interchangeable. The sequence is something the developer chooses and configures; the safety rails stay the same whatever they choose.

**Lean toward:** isolation, persisted state, independent review, and bounded retries.
**Lean away from:** one-shot prompts without accountability, state held only in the UI, unbounded loops, and one agent's identity baked into the design.

---

### 8. Internal vocabulary stays internal

KPM has its own references, syntax, and local-only fields. None of it leaks to an external system. Every export translates internal references into readable text and drops local-only fields before anything is sent. A ticket should never contain KPM internals.

**The rule:** if it crosses an export boundary, it is translated. No exceptions.

---

## Engineering

### 9. Make the wrong thing fail to compile

A rule that matters is enforced by the type system or a test, not by a comment or a doc. When adding a case should touch several places, derive them from one registry, so forgetting one is a compile error. When a value must pass through a gate, give it a type only the gate can produce. Prose is for what the compiler can't check.

**Lean toward:** registries that derive downstream types, exhaustive maps over unions, and branded types at boundaries.
**Lean away from:** rules that live only in documentation or a reviewer's memory.

---

### 10. One owner per fact

Every fact KPM asks about repeatedly (which branch, which path, which phase, how an item is deleted) has exactly one module that answers it. Everything else asks that module rather than working the answer out again. Facts get lost when they pass between modules, so keep the number of hand-offs small and make each one carry the whole fact.

**Lean toward:** one resolver per question, called everywhere.
**Lean away from:** a second code path for something that already has an owner, and reconstructing another module's state from clues.
