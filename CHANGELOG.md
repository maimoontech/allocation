# Changelog — Claude Migration Baseline

## 2026-09-12 — Claude Code Context Baseline

Created a Claude-oriented project context based on the supplied Trae AI project.

### Current Stack
- React 18 + TypeScript + Vite
- Redux Toolkit
- React Router
- Tailwind CSS
- Node.js + Express + TypeScript
- MySQL2
- JWT + bcryptjs

### Current Domains
- Authentication
- Zones
- Mohallahs
- Parties
- Venues
- Miqaats
- Schedules
- Reports
- Ratings
- Import/Export

### Existing Documentation
The project already contains developer, process, UI/UX and user documentation under `Documentation/`.

### Important Existing Work
The repository contains substantial scheduling logic and historical debugging artifacts around duplicate assignments/schedule generation. Preserve these when working on scheduling.

### Known Technical Findings
1. Current source uses MySQL2 directly, while older documentation mentions Prisma.
2. `ensureSchema.ts` can alter selected database columns during startup.
3. Environment configuration contains fallback credential/secret values in source; this is a security risk and should be addressed deliberately.
4. Generated `dist` directories are present; source under `src` should be treated as the editable source.
5. Temporary/debug scripts are present under the backend and should not be removed without checking their purpose.

### Migration Rule

This baseline documents the existing system. It does not authorize fixes to the above issues. Fixes must be separately requested/planned and tested.
