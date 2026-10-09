# UX Studio

A personal design studio that runs on your laptop. You describe a product or feature, and a team of AI specialists takes it from research to a clickable prototype. You review every step, edit anything, and redo any stage.

**Status: steps 1–2 of 5 are built** — projects, the pipeline screen, and the Researcher, Architect, Content designer and Wireframer. The other specialists show as "Coming soon".

## Start it

You need [Node.js](https://nodejs.org) 22.13 or newer.

```bash
npm install
cp .env.example .env      # then paste your Anthropic API key into .env (optional, see below)
npm run dev
```

Open http://localhost:4747.

**No API key yet?** The app runs in **replay mode**: runs play back recorded sample output for the sample briefs, at no cost. Everything made this way is clearly labelled "Sample output". To run the real AI team on your own briefs, add your key to `.env` and restart.

## How it works

1. **Create a project.** Write a brief, choose web, iOS and/or Android, or start from one of the three sample briefs.
2. **Add research files** if you have them: interview notes, survey results, PDFs, screenshots, CSVs. With files, the Researcher can work from evidence; without them, it marks personas and insights as assumptions.
3. **Run the pipeline.** Watch the agent work live. Each stage has a "done" checklist it must pass.
4. **Review.** Read the result, edit it in a form (or as JSON), compare versions, and approve. Approving continues the run.
5. **Change your mind any time.** Editing the brief flags later stages as out of date so you know what to redo.

Two modes: **stop for review after each stage**, or **run on its own** (auto-approves stages that pass their checks).

Press <kbd>?</kbd> in the app for keyboard shortcuts.

## Where your work is saved

Each project is a normal folder (default `./workspace/projects/<name>`; change it with `UXSTUDIO_HOME` in `.env`):

```
brief.md                     your brief
project.json                 settings
uploads/                     your research files
state/decisions.md           decision log
state/assumptions.json       assumptions collected from every stage
state/open-questions.json
stages/01-research/v0001.json  each version, kept forever
stages/01-research/v0001.md    the same version as readable Markdown
runs/<run>/calls.jsonl       a log of every AI call (prompt, output, cost)
```

You can open these in any editor or put the folder in git.

## Changing the specialists

Each specialist's instructions are a Markdown file you can edit: `agents/researcher/prompt.md`. Its "done" checklist is in `agents/researcher/dod.ts`.

Models are set in `config/models.json`: a cheaper model for research and drafting, a stronger one for UI and critique. The per-run spending cap also lives there.

## Testing prompt changes

```bash
npm run pipeline                         # run all three sample briefs, unattended
npm run pipeline -- --brief clinic-booking
npm run pipeline -- --label "shorter prompt"
```

It prints which done-checks passed for each brief, plus cost and time, and saves a report under `workspace/eval-runs/`. In replay mode only the medication-reminders sample has recordings so far; the other two are filled in during step 5.

## For developers

- `npm test` runs the core tests (done-checks, approvals, versions, out-of-date detection).
- Architecture: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).
- Stack: Next.js, TypeScript, Claude Agent SDK, SQLite (`node:sqlite`) for the run log; files on disk are the source of truth.
