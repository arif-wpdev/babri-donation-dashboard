<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Hard rules (never violate)

1. **Never run `git push`** — not to GitHub, not to any remote — unless the owner explicitly asks for it in that same conversation. No exceptions, no "just this once", no inferred consent from a commit request. Local `git commit` is fine; pushing is not. If a change seems to require a push to be useful, stop and ask.
2. **This project ships under a different name.** It will be forked and deployed under a distinct name on GitHub, Supabase, and Vercel. When writing or editing config, metadata, package name, manifest, OG tags, or deploy settings, do not hardcode the current/original project identity — prefer env vars or a neutral placeholder so the copy can be renamed cleanly.
3. When deployment, env vars, or Supabase/Vercel wiring is involved, confirm target project name, region, and credentials with the owner before acting. Never invent them.
