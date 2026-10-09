# UX Studio

A personal design studio that runs on your laptop. You describe a product or feature, and a team of AI specialists takes it from research to a clickable prototype. You review every step, edit anything, and redo any stage.

**Status: all 5 steps are built** — eight specialists (Researcher, Architect, Content designer, Wireframer, Design system, UI designer, Critic, Prototyper), Figma, the critique loop, the clickable prototype with handoff notes, a project report you can save as PDF or Markdown, and an Agents page for editing instructions and models. All three sample briefs have recorded results, so everything can be tried without an API key.

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

## Connecting Figma

UX Studio uses Figma's official connection through Claude Code, so you sign in to Figma once:

1. Install [Claude Code](https://code.claude.com) if you haven't, then run:
   ```bash
   claude mcp add --scope user --transport http figma https://mcp.figma.com/mcp
   ```
2. Start `claude`, type `/mcp`, choose **figma** and sign in.
3. In UX Studio, paste your Figma file link into the **Figma** box on the project page.

Then:
- The **Design system** specialist reads the libraries attached to that file (Material 3, your own library, etc.) and uses their real colours, type and components. Apple's iOS kits can't be read this way, so iOS uses Apple's published defaults, and it says so.
- **Push to Figma** on the Wireframes or UI page adds every screen and state to your file as editable frames. On Android with Material 3, colours are bound to the library's variables and buttons are real library components.
- **Send flows to FigJam** on the Architecture page turns the task flows into FigJam diagrams.

Pushing needs live mode (an API key); in replay mode the buttons explain what's missing.

## Where your work is saved

Each project is a normal folder (default `./workspace/projects/<name>`; change it with `UXSTUDIO_HOME` in `.env`):

```
brief.md                     your brief
project.json                 settings
uploads/                     your research files
state/decisions.md           decision log
state/assumptions.json       assumptions collected from every stage
state/open-questions.json
state/figma.json             links to everything pushed to Figma
stages/01-research/v0001.json  each version, kept forever
stages/01-research/v0001.md    the same version as readable Markdown
runs/<run>/calls.jsonl       a log of every AI call (prompt, output, cost)
```

You can open these in any editor or put the folder in git.

## Sharing your work

On a project, press **Export** (or <kbd>x</kbd>) to open the report: the brief, every stage's write-up with its flow diagrams, the main screens, and the assumptions, open questions and decisions.

- **Save as PDF** (or <kbd>p</kbd>) opens your browser's print dialog; choose "Save as PDF".
- **Download Markdown** gives you the same report as one `.md` file (also saved as `exports/report.md`).
- The clickable prototype (one HTML file) and the developer handoff notes download from the Prototype stage.
- Screens and flows can be pushed to Figma from the Wireframes, UI and Architecture stages.

## Changing the specialists

Open **Agents** (top right of the projects page) to edit each specialist's instructions and pick its model: *Draft* (cheaper, for research and drafting) or *Strong* (for design system, UI and critique). Every save keeps the earlier text under "Earlier versions", so you can go back. The same page sets which model each tier uses and the spending cap per run.

The instructions live in `agents/<name>/prompt.md` and the models in `config/models.json`, if you prefer a text editor. Each specialist's "done" checklist is in `agents/<name>/index.ts`.

## Testing prompt changes

```bash
npm run pipeline                         # run all three sample briefs, unattended
npm run pipeline -- --brief clinic-booking
npm run pipeline -- --label "shorter prompt"
```

It prints which done-checks passed for each brief, how many critique rounds it took and how many serious issues are left, plus cost and time. It saves a report under `workspace/eval-runs/`, and compares it with the previous run: which agents' instructions changed, and whether checks, serious issues and cost went up or down.

Without an API key it plays back recordings for all three sample briefs, which is useful to check the app works; the comparison is only meaningful with real runs.

## For developers

- `npm test` runs the core tests (done-checks, approvals, versions, out-of-date detection).
- Architecture: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).
- Stack: Next.js, TypeScript, Claude Agent SDK, SQLite (`node:sqlite`) for the run log; files on disk are the source of truth.
