## Required Code Review

For every task that changes application source code, configuration, tests, or dependencies:

1. Implement the requested change and run the appropriate focused validation.
2. Before presenting the final result, delegate an independent review to the configured default subagent.
3. The review subagent must inspect the final `git diff`, relevant surrounding code, and validation results.
4. The review subagent must not edit files unless explicitly asked; it reports findings grouped by severity.
5. Fix all confirmed high- and medium-severity findings, then rerun affected validation.
6. In the final response, state that the review ran and summarize any remaining low-severity findings.

Skip this review only for prose-only changes, unless the user explicitly asks for review.
