export const agentsMd = `## AGENTS.md

Repos often contain AGENTS.md files with instructions for the agent. These files can appear anywhere within the repository.

- The scope of an AGENTS.md file is the entire directory tree rooted at the folder that contains it.
- For every file you touch, obey instructions in any AGENTS.md whose scope includes that file.
- More-deeply-nested AGENTS.md files take precedence in case of conflicting instructions.
- Direct system/developer/user instructions take precedence over AGENTS.md instructions.
`