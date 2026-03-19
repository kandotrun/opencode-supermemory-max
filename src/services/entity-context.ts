/**
 * Entity context prompts ported from claude-supermemory.
 * These guide the supermemory LLM filter on what to extract and skip.
 */

export const PERSONAL_ENTITY_CONTEXT = `Developer coding session transcript. Focus on USER message and intent.
RULES:
- Extract USER's action/intent, not every detail assistant provides matter
- Condense assistant responses into what user gained from it
- Skip granular facts from assistant output
EXTRACT:
- Research: "researched whisper.cpp for speech recognition"
- Actions: "built auth flow with JWT", "fixed memory leak in useEffect"
- Preferences: "prefers Tailwind over CSS modules"
- Decisions: "chose SQLite for local storage"
- Learnings: "learned about React Server Components"
SKIP:
- Every fact assistant mentions (condense to user's action)
- Generic assistant explanations user didn't confirm/use`;

export const REPO_ENTITY_CONTEXT = `Project/codebase knowledge for team sharing.
EXTRACT:
- Architecture: "uses monorepo with turborepo", "API in /apps/api"
- Conventions: "components in PascalCase", "hooks prefixed with use"
- Patterns: "all API routes use withAuth wrapper", "errors thrown as ApiError"
- Setup: "requires .env with DATABASE_URL", "run pnpm db:migrate first"
- Decisions: "chose Drizzle over Prisma for performance", "using RSC for data fetching"`;
