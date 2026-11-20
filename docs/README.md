# Documentation

Four documents, in the order they're worth reading. Each answers a different
question, and none of them repeats another — if something appears twice,
one of the copies is a bug.

| Document                                       | Answers                                              | Read it when                                                                                                                                                                                                                       |
| ---------------------------------------------- | ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [architecture.md](architecture.md)             | Why is the code shaped like this?                    | Before your first change. It explains the one constraint every other decision follows from: Cesium owns an imperative render loop, so React state and Cesium state are kept in deliberate sync rather than one deriving the other. |
| [adding-a-feature.md](adding-a-feature.md)     | How do I add a panel that puts something on the map? | You're building the common case — a form that adds a kind of layer, plus a list to manage what's been added. It's a step-by-step recipe with a worked GeoJSON example.                                                             |
| [coding-conventions.md](coding-conventions.md) | What should I call this, and where does it go?       | Naming, imports, TypeScript, React, CSS, and commenting rules — including the full file-naming standard the whole `src/` tree follows.                                                                                             |
| [../CLAUDE.md](../CLAUDE.md)                   | (for coding agents)                                  | The same rules, condensed, plus the invariants that cause real bugs when broken and the Cesium gotchas that look like arbitrary code until explained. Humans can read it as a checklist.                                           |

The [top-level README](../README.md) covers what the app does, how to run
it, and where each directory lives — start there if you haven't run the app
yet.

## Keeping these accurate

Documentation that drifts is worse than none, because people trust it.
Three habits keep it honest:

- **When you rename or move a file, update the docs in the same change.**
  `grep -rn "old-name" docs README.md CLAUDE.md` before you finish.
- **When you change a rule, change it here, not in a code comment.** Code
  comments explain a specific line's _why_; these documents hold the rules
  that apply repo-wide.
- **When a document explains a decision, keep the reason attached to it.**
  A rule without its reason gets "cleaned up" by the next person, and the
  bug it was preventing comes back.
