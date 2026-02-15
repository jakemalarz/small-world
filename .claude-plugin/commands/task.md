Manage the persistent task tracker in TASKS.md.

Usage: /task <subcommand> [args]

Subcommands:
- `list` — Show all tasks organized by status (Backlog / In Progress / Done)
- `add <description>` — Add a new task to Backlog with next sequential ID
- `start <id>` — Move task from Backlog to In Progress, add started timestamp
- `done <id>` — Move task from In Progress to Done, add completed timestamp

Invoke the task-manager skill to handle this. Pass the full argument string (subcommand + args) to the skill.

The argument after the command is the subcommand and its arguments.
