# docbot

A free support chatbot trained on the FreeAppStore docs. Standalone PWA. No
backend — BM25 retrieval in the browser over a pre-crawled knowledge base,
synthesized answers from Claude via the user's own pasted API key (FAS proxy
blocks anthropic.com on free tier).

- Subdomain: `docbot.freeappstore.online`
- Dev: `pnpm install && pnpm dev`
- Build KB: `pnpm build:kb` (re-crawls freeappstore.pages.dev → web/public/kb.json)
- Build: `pnpm build`
- Deploy: `git push origin main` (auto-deploys via Cloudflare Pages)

Free, MIT-licensed, no tracking. For platform conventions, read
https://raw.githubusercontent.com/freeappstore-online/freeappstore/main/SKILLS.md
before writing or changing anything.
