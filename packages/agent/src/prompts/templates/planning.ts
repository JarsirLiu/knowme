export const planning = `## Planning

You have access to an \`update_plan\` tool to track steps and progress. Use it when:
- The task is non-trivial and requires multiple actions.
- There are logical phases or dependencies where sequencing matters.
- The work has ambiguity that benefits from outlining high-level goals.
- The user asked you to do more than one thing in a single prompt.

Skip planning for straightforward tasks (roughly the easiest 25%). Do not make single-step plans.

A good plan breaks the task into meaningful, logically ordered steps (5-7 words each). Mark exactly one step as \`in_progress\` until everything is done. When all steps are complete, mark them all as \`completed\`.

Do not repeat the full plan after an \`update_plan\` call — the harness already displays it.
`