# ChiefTalent UI Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give ChiefTalent one distinct visual system and a landing page that explains the product plainly, without changing any behaviour.

**Architecture:** Replace tokens and primitives first (so every screen inherits the new look), then rebuild the landing page as small section components, then restructure the four app screens (login/shell, dashboard, candidate review, interview + legal) one at a time. Each task is test-first: a Playwright or Python check is written, seen failing against the current code, then made to pass. All testing runs against a **scratch copy** with fake data, never the real database, recordings or SMTP.

**Tech Stack:** React 18, Vite 6, Tailwind v4, Radix primitives, react-router 6, `motion` (already installed), Flask (two string/field changes only), Playwright (already a devDependency), Pillow-free Python tests.

**Spec:** `docs/superpowers/specs/2026-11-02-chieftalent-ui-redesign-design.md` (read it first; this plan only records decisions).

## Global Constraints

- Behaviour is frozen: same routes, API calls, state machines, proctoring, timers, uploads. Only presentation, layout, copy. Sole backend exceptions: the two `nim_client.py` message strings and the `/api/admin/overview` field rename (`nim` -> `ai`, drop `model`).
- Colour tokens (spec): ink `#13110F`, orange `#EE5A2E`, orange-deep `#C4421B`, paper `#FFFFFF`, fog `#F2F3F5`, line `#DDE0E5`, muted `#5B6270`; status pass `#14532D` on `#E6EFE9`, warn `#7A4A00` on `#FFF1D6`, fail `#C1362C` on `#FBE6E3`. One accent (orange) everywhere. Text on orange is ink, never white.
- Type: **Archivo** variable only (weight 100-900, width 62-125), self-hosted `woff2` in `frontend/public/fonts/`, `font-display: swap`, primary file preloaded. Display: weight 800, width 90, line-height 0.93. Section heads: weight 740, width 105. Body: weight 420, line-height 1.55, max 65ch. Tabular numerals. No monospace anywhere. Remove Syne, DM Sans, DM Mono, Inter and every Google Fonts link.
- Radius rule (documented, used everywhere): controls 6px, panels 8px, hero data panel 10px. No drop-shadow card stacks; group with spacing and 1px `line` rules.
- Copy: sentence case, active voice, plain words. **Zero em dashes and zero en dashes in anything visible** (use a hyphen, comma, colon or full stop). At most one middle dot per line, avoid entirely. No eyebrow labels, no numbered markers outside the interview stepper, no filler verbs, no invented statistics.
- Landing structure (spec + taste-skill): black top bar with the **existing full-colour logo** (`brand/chieftalent-logo-white.png`, no recolour, no plate); orange hero; white sections; **orange closing band** (page theme lock: no mid-page dark section) then a light footer. Static (non-sticky) top bar, no scroll listeners. Hero: headline <= 2 lines, subtext <= 20 words, one primary CTA + one secondary link, nothing else. Section headers stack (headline over text, max 65ch); no split headline/paragraph headers. At least 4 distinct layout families across the sections.
- Contacts: companies `mailto:sales@dotstark.com` (label "Talk to DotStark" every time); candidates and interview problems `yash@dotstark.com`.
- Naming rule: nothing visible names NVIDIA, NIM, nim-proxy or a model family; say "AI API". Code identifiers/env/README stay.
- Planned features appear only inside the Planned section, each tagged "Planned", no dates. Nothing planned appears in any sample.
- Quality floor: usable at 360px; visible `:focus-visible` on every control; `prefers-reduced-motion` honoured; AA contrast; one `<h1>` per page; skip link; `scroll-margin-top` on anchor targets; never `transition: all`; `min-h-[100dvh]` not `h-screen`; animate transform/opacity only; `<meta name="color-scheme" content="light">`, `theme-color` `#13110F`; images with width/height; `text-wrap: balance` on headings.
- Skill deviations the owner chose: sentence case (not Vercel's Title Case); no dark mode.
- No git repo: "checkpoint" = run `scripts/ui_checkpoint.ps1 <name>` (copies source + built SPA outside the project).
- Real data is never touched. Tests use `scripts/ui_scratch.py` (fake data, SMTP off, AI endpoint unreachable, port 5055).

## Review Focus

- Very long candidate names/emails/role slugs (60+ chars, no spaces) must truncate or wrap, never break the table, rail or header (Tasks 5, 6).
- Empty states: no jobs, no candidates, no answers, no evaluation, no recordings must render a clear next action, not a blank hole (Tasks 5, 6).
- 360px width: landing, login, dashboard table and review rail have no horizontal page scroll (Tasks 3-7).
- `prefers-reduced-motion`: the hero ranked list is already in its final state and nothing animates (Task 3).
- API failure/old payload: overview error or missing `ai` key must not crash the sidebar (Task 4); a missing logo or font file falls back cleanly to the system stack.

---

### Task 0: Safety nets, scratch environment, shared test helper

**Files:**
- Create: `scripts/ui_checkpoint.ps1`, `scripts/ui_scratch.py`, `frontend/test-helpers.mjs`
- Create: `frontend/test-no-provider-names.mjs`

**Interfaces:**
- Produces: `python scripts/ui_scratch.py` builds `%TEMP%\chieftalent-scratch` (fresh data dir; copies `app/`, `scripts/`, `run.py`, `requirements.txt`, the job posting JSON, and the built `app/static/spa`; writes a `.env` with `SMTP_HOST=`, `NIM_BASE_URL=http://127.0.0.1:9/v1`, `PORT=5055`, `BASE_URL=http://localhost:5055`, `ADMIN_KEY=`), seeds fixtures, prints JSON `{"tokens": {"verify": "...", "details": "...", "guidelines": "...", "interview": "...", "completed": "..."}, "candidate_ids": {"normal": n, "long": n, "evaluated": n}}`, then starts Flask on 5055 and blocks (`--seed-only` skips the server). Fixtures: one job `net_development_intern`; candidates covering ATS-rejected, shortlisted, interview at each phase (question set injected directly into `interviews.question_set`, 1 spoken + 3 MCQs), one evaluated candidate with answers and an evaluation row, and one candidate whose name and email are 70 characters with no spaces. Users come from `auth_service.seed_users()` (`yash@dotstark.com` / `Yash@1234` admin, `recruiter@dotstark.com` / `Recruit@1234`).
- Produces (`test-helpers.mjs`): `export const BASE`, `export async function launch(viewport)` -> `{browser, page, errors}` collecting `pageerror` and console errors (ignoring the expected `/api/auth/me` 401), `export async function login(page, email, password)`, `export function assert(cond, msg)` (collects failures), `export function done()` (prints summary, exits 1 on any failure).
- Produces: `frontend/test-no-provider-names.mjs` scans `app/static/spa/**/*.{js,css,html}` and `frontend/src/**` for `/\b(nvidia|nim|nim-proxy|gpt-oss|nemotron|llama)\b/i`; exits 1 with file:line on any hit in rendered strings (src hits inside identifiers like `nim_client` paths do not occur in `frontend/src`).

- [ ] **Step 1:** Write `ui_checkpoint.ps1` (param `$Name`; robocopy `frontend/src`, `frontend/public`, `frontend/index.html`, `app/services`, `app/routes`, `app/static/spa` into `%TEMP%\chieftalent-ckpt\$Name`). Run it with name `baseline`; confirm the folder exists and contains `app\static\spa\index.html`.
- [ ] **Step 2:** Write `ui_scratch.py` and `test-helpers.mjs` as specified. Run `python scripts/ui_scratch.py --seed-only`; confirm it prints the JSON with five tokens and does not touch `data\hr_mvp.db` (compare the real DB file's modified time before and after).
- [ ] **Step 3:** Write `test-no-provider-names.mjs`. Run it; **expect FAIL** (the current bundle contains "NVIDIA NIM" in the Privacy text).
- [ ] **Step 4:** Checkpoint `baseline` done in Step 1. No commit (no git).

### Task 1: Naming rule in the backend

**Files:**
- Modify: `app/services/nim_client.py` (the two messages at the `raise NIMError("NIM server has no models...")` and `raise NIMError(f"NIM chat failed after...")` lines), `app/routes/admin.py` (`overview()` return value)
- Test: `scripts/test_ai_naming.py`

**Interfaces:**
- Produces: `GET /api/admin/overview` returns `{"ai": {"ok": bool, "error": str}, ...}`; the `nim` key and `model` field no longer exist. `NIMError` messages never contain the word "NIM" or "NVIDIA".

- [ ] **Step 1:** Write `scripts/test_ai_naming.py` using the Flask test client with `session["user_id"]=1` (pattern from `scripts/smoke_test.py`) and `ui_scratch`'s scratch env: `test_overview_has_ai_not_nim` (key `ai` present, `ok` and `error` inside; `nim` absent; no `model` inside `ai`), `test_chat_failure_message_neutral` (`NIMClient("http://127.0.0.1:9/v1","","m").chat([...], retries=1)` raises `NIMError`; `re.search(r"\b(nim|nvidia)\b", str(e), re.I)` is None), `test_no_models_message_neutral` (client with empty model and unreachable URL: `resolve_model()` raises, same assertion).
- [ ] **Step 2:** Run in the scratch env: `python scripts/test_ai_naming.py`. **Expect FAIL** on all three.
- [ ] **Step 3:** Reword the two messages to start "AI API ..." (same exception type, same retry behaviour). In `overview()` return `"ai": {"ok": health["ok"], "error": <neutralised health error>}` where the health error text is passed through a small helper that replaces `NIM`/`NVIDIA` with "AI API" if present; remove `model`.
- [ ] **Step 4:** Re-run; expect PASS. Run `python scripts/smoke_test.py` in the scratch env; expect `ALL CHECKS PASSED`.
- [ ] **Step 5:** Checkpoint `naming`.

### Task 2: Tokens, fonts, primitives

**Files:**
- Modify: `frontend/index.html`, `frontend/src/index.css`, `frontend/src/components/ui/{button,card,badge,tabs,table,input,textarea,select,alert-dialog,separator,skeleton,avatar,label}.jsx`, `frontend/src/components/StatusBadge.jsx`
- Create: `frontend/public/fonts/Archivo-variable.woff2`, `frontend/test-tokens.mjs`

**Interfaces:**
- Produces: CSS custom properties `--ink --orange --orange-deep --paper --fog --line --muted` plus the existing shadcn names (`--background` = fog, `--primary` = orange, `--foreground` = ink, `--border` = line, `--ring` = orange) so existing utility classes keep working. Utility classes retained by name where screens use them: `.num` (tabular numerals, no mono), `.stat-num`, `.link`, `.option-row`, `.seg`, `.meter`, `.video-box`, `.status-dot`, `.sidebar`, `.nav-item`, `.auth-spinner`. `.label-micro` and `.eyebrow` are removed (callers updated in later tasks). Variants of `Button`: `default` (orange, ink text), `outline`, `ghost`, `destructive`, `secondary`, `link`; sizes unchanged. `Badge` variants unchanged in name, recoloured to the status tokens.
- Consumes: nothing.

- [ ] **Step 1:** Write `test-tokens.mjs`: load `/login` on scratch; assert computed `font-family` of `body` starts with `Archivo`; `document.fonts.check('800 16px Archivo')` true after load; no element with computed `text-transform: uppercase` on the page; no `font-family` containing `mono`; `getComputedStyle(root).getPropertyValue('--orange').trim() === '#EE5A2E'`; focus ring: tab to the first control and assert a visible outline/ring. Also grep `frontend/index.html` and `src/index.css` for `Syne|DM Sans|DM Mono|Inter|fonts.googleapis` and assert none.
- [ ] **Step 2:** Run `node test-tokens.mjs` (scratch server + built SPA). **Expect FAIL.**
- [ ] **Step 3:** Download Archivo variable (Latin) from Google Fonts (OFL) into `public/fonts/`. In `index.html`: remove the Google Fonts links, add `<link rel="preload" as="font" type="font/woff2" crossorigin href="/fonts/Archivo-variable.woff2">`, `<meta name="color-scheme" content="light">`, `<meta name="theme-color" content="#13110F">`, a meta description. Rewrite `index.css`: `@font-face` with `font-weight: 100 900; font-stretch: 62% 125%`, the tokens above, base type scale, remove `.label-micro`, `.eyebrow`, `.display-xl` mono usage, the `transition: all` and `shimmer`/magic-ui keyframes no longer used by live code (keep keyframes that `components/interview/CompletionIcons.jsx` or the hero still need), `:focus-visible` ring in orange 2px with 2px offset, `@media (prefers-reduced-motion)` block kept. Restyle primitives per the Global Constraints (6px controls, 8px panels, no `shadow` utilities on cards, tabs without `transition-all`, table header sentence case not uppercase).
- [ ] **Step 4:** `npm run build`; run `node test-tokens.mjs`; expect PASS. Run `node test-auth-ui.mjs`-style smoke by loading `/admin` and `/login` and confirming no console errors.
- [ ] **Step 5:** Checkpoint `tokens`.

### Task 3: Landing page

**Files:**
- Create: `frontend/src/components/landing/{Navbar,Hero,RankedList,Idea,RoleTimeline,WhoDoesWhat,ForCandidates,Planned,DataPrivacy,Closing,Footer}.jsx`, `frontend/test-landing.mjs`
- Modify: `frontend/src/pages/Landing.jsx` (compose only), `frontend/src/components/Logo.jsx` (support the black-bar variant name)
- Retire: remove the old inline nav/footer/section code from `Landing.jsx`; `Navbar.jsx` (currently unused) is rewritten as the real top bar.

**Interfaces:**
- Consumes: `Logo` (`onDark`, `mark`), `StatusBadge`, `Badge`, `Button` from Task 2.
- Produces: section ids `how-it-works`, `for-candidates`, `data-privacy` (anchor targets, each with `scroll-margin-top`); constants file `landing/content.js` exporting `STAGES`, `AI_DOES`, `YOU_DO`, `CANDIDATE_STEPS`, `PLANNED`, `FACTS` so copy is reviewed in one place.

Sections and layout families (all different): top bar (nav strip); hero (split, orange field, text left, `RankedList` right); idea (single stacked statement, 65ch); role timeline (vertical rail with a real-component fragment beside each stage); who does what (two plain columns divided by one rule); for candidates (ordered flow set in a single wide row of short sentences, wraps on mobile); planned (definition list: name, one sentence, "Planned" tag); data and privacy (statement paragraphs plus a small facts table with a single divider style); closing band (orange, centred message, one button); footer (light).

Copy decisions: hero H1 "Fifty CVs in. A shortlist out." Subtext: "ChiefTalent reads every CV against your job description and interviews the ones who fit. You decide." Primary "Talk to DotStark" (`mailto:sales@dotstark.com`), secondary "See how a role runs" (`#how-it-works`). Nav: "How it works", "For candidates", "Data & privacy", then "Sign in" (orange button, `/login`). `RankedList` is a semantic `<ol>` data graphic labelled "Sample"; rows 91, 84, 78, 72 above a dashed line labelled "Shortlist line 70", then 63, 48, grey; bars are `scaleX` bars with no background track. Animation (one moment, `motion` or CSS, `prefers-reduced-motion` renders the final state instantly): bars draw in sequence, then the line appears, then sub-threshold rows dim. Stage fragments use real components: JD stage shows a structured-JD excerpt; CV stage a row with `StatusBadge` and the score; invite stage a short email excerpt; interview stage a question with the timer text "29:41 left"; review stage a transcript excerpt with the "Recommend: progress" `Badge`; decision stage the three real review buttons. Every sample is visibly labelled "Sample". No planned feature appears in any fragment. `PLANNED` rows (exact names): "Situation-based video question", "Stronger interview integrity checks", "Server-side speech-to-text", "Video and voice analysis". `FACTS` (verified against code): shortlist line is set by you (default 70); 30-minute interview with one video answer and 20 questions (10 from the job, 10 from the CV); three tab or full-screen violations end the interview; candidates verify with a 6-digit emailed code; deleting a candidate removes CV, answers, recordings and evaluation; CV text and answer transcripts are sent to an AI API for scoring; recruiter questions to sales@dotstark.com, interview problems to yash@dotstark.com. No certification, encryption or retention claims.

- [ ] **Step 1:** Write `test-landing.mjs` (viewports 1440x900, 768x1024, 390x844, 360x740): exactly one `h1` with the headline; links `a[href="mailto:sales@dotstark.com"]` count >= 2 and all labelled "Talk to DotStark"; `a[href="/login"]` present in the top bar; no text node contains `—` or `–`; no heading text matches `/^\s*0?\d\b/`; no `uppercase` computed styles; the four Planned names present each with a "Planned" tag and nowhere else; `yash@dotstark.com` present in the For candidates section; the string set `nvidia|nim` absent; hero CTA bounding box fully inside the first viewport at 1440x900 and 390x844; `document.documentElement.scrollWidth <= innerWidth` at every width; the top bar logo `img` has `alt="ChiefTalent"` and its `src` ends `chieftalent-logo-white.png`; with `reducedMotion: 'reduce'` the ranked bars have final transform (`scaleX(1)`) at load; skip link is the first focusable and works; screenshot each width into `frontend/shots/redesign-landing-*.png`.
- [ ] **Step 2:** Run it against the scratch server. **Expect FAIL** (old page).
- [ ] **Step 3:** Implement `content.js` then the section components then `Landing.jsx` per the decisions above. Archivo display at weight 800 width 90 for the headline; keep the headline within 2 lines at 1440 and 390.
- [ ] **Step 4:** `npm run build`; re-run `test-landing.mjs`; expect PASS. View the screenshots yourself (Read the PNGs) at 1440 and 390 and fix anything that looks wrong before moving on.
- [ ] **Step 5:** Checkpoint `landing`.

### Task 4: Login and admin shell

**Files:**
- Modify: `frontend/src/pages/Login.jsx`, `frontend/src/components/AdminShell.jsx`, `frontend/src/components/AdminShell` role/status parts, `frontend/src/auth.jsx` (only if loading-state markup uses removed classes)
- Test: `frontend/test-shell.mjs`

**Interfaces:**
- Consumes: `/api/admin/overview` field `ai` (Task 1): `ov?.ai?.ok`; the model line is removed.
- Produces: unchanged route behaviour; sidebar width token kept at 252px; `.sidebar` height uses `100dvh`.

- [ ] **Step 1:** Write `test-shell.mjs`: login as admin and as recruiter (helpers); sidebar shows logo with alt `ChiefTalent`; status reads "AI API connected" or "AI API unreachable" and never contains `nvidia`, `nim` or a `/`-separated model id; role list renders; delete-role control only for admin; sign out works; forgot-password view still reaches the OTP-sent view; with the overview request mocked to return `{}` the sidebar still renders (no crash); at 360px the mobile top bar and drawer open and close.
- [ ] **Step 2:** Run; **expect FAIL** (status text and model line differ).
- [ ] **Step 3:** Restyle Login (split layout kept, left black panel with logo and one sentence, right form with visible labels, errors in `aria-live`) and AdminShell per the spec; consume `ai`.
- [ ] **Step 4:** Build; run `test-shell.mjs` and `test-tokens.mjs`; expect PASS.
- [ ] **Step 5:** Checkpoint `shell`.

### Task 5: Dashboard

**Files:**
- Modify: `frontend/src/pages/Dashboard.jsx`
- Create: `frontend/src/components/dashboard/{StatsRow,IntakeArea,CandidatesTable}.jsx` (split the 650-line page by responsibility; props only, no new data fetching)
- Test: `frontend/test-dashboard.mjs`

**Interfaces:**
- Consumes: `api.overview()`, `api.createJdFromText`, `api.uploadJdFile`, `api.jdPdfUrl`, `api.uploadCvs`, `api.deleteCandidate` exactly as today; the 4-second polling stays in `Dashboard.jsx`.
- Produces: `StatsRow({total, shortlisted, interviewing, avg})`, `IntakeArea({jobRoles, role, setRole, jdRole, setJdRole, ...handlers})`, `CandidatesTable({rows, tab, setTab, counts, isAdmin, atsThreshold, onCopy, onDelete, copiedId})`. State and handlers remain in `Dashboard.jsx`.

Design: header; stats as one plain inline figure row (not four cards); intake as one two-column area (add a job | screen CVs) without card-in-card; the table is the visual centre with tabs and counts; ATS meter has no filled track; skeleton rows and an empty state that says what to do next.

- [ ] **Step 1:** Write `test-dashboard.mjs` on scratch data: tabs All/Shortlisted/Interviewing/Evaluated/Rejected with counts matching row counts; clicking a tab filters; role filter via `?role=`; "Copy link" present for rows with a link; delete icon only for admin and opens the confirm dialog (cancel leaves the row); upload control accepts PDFs and the role select lists `job_roles`; JD paste button disabled under 40 characters; JD PDF link points at `/api/admin/jd/<role>/pdf`; the 70-character name/email row truncates (row height <= 96px, no horizontal page scroll); empty state appears when the role filter matches nothing; 360px: table scrolls inside its own container only; ATS score colours follow the threshold; polling still updates (change a fixture row's status in the DB between polls, assert the table updates within 6 seconds).
- [ ] **Step 2:** Run; **expect FAIL** on structure assertions (cards, stats grid).
- [ ] **Step 3:** Implement the split and restyle; no handler or fetch logic changes.
- [ ] **Step 4:** Build; run `test-dashboard.mjs`; expect PASS. Run `test-shell.mjs` again.
- [ ] **Step 5:** Checkpoint `dashboard`.

### Task 6: Candidate review (plus the display fix)

**Files:**
- Modify: `frontend/src/pages/CandidateDetail.jsx`
- Create: `frontend/src/components/review/{AtsSection,DetailsSection,AnswersSection,EvaluationSection,ReviewRail}.jsx`, `frontend/src/components/review/scoreKeys.js`
- Test: `frontend/test-review.mjs`

**Interfaces:**
- Consumes: `api.candidate`, `api.review`, `api.shortlistCandidate`, `api.retakeCandidate` unchanged; 5-second polling unchanged.
- Produces (`scoreKeys.js`): `export const SCORE_KEYS = [['content_score','content'],['relevance_score','relevance'],['communication_score','communication'],['completeness_score','completeness'],['overall_score','overall']]` and `export function objectiveCounts(answers)` counting `question_type === 'mcq' || 'yes_no'` answers and their `is_correct`.

Design: header with decision area; sections separated by rules, not cards; answers as rows with video playback, transcript, per-answer score line; right rail (sticky) with Details and Manual review.

- [ ] **Step 1:** Write `test-review.mjs`: for the evaluated fixture assert all five score labels render for the first answer (fails today: only "overall" does); objective tally shows `correct/total` using MCQ answers; transcript, audio/video elements and the "Download video" link exist when paths exist; rejected-without-interview fixture shows the "Manually shortlist" action; retake button opens a confirm dialog; saving a review posts and shows the saved note; the long-name fixture does not overflow header or rail; empty states: candidate with no answers shows "No answers recorded." and no evaluation section; the verification code chip shows only when `verification_code` is present.
- [ ] **Step 2:** Run; **expect FAIL** (score labels, tally).
- [ ] **Step 3:** Implement the split and restyle using `SCORE_KEYS` and `objectiveCounts`.
- [ ] **Step 4:** Build; run `test-review.mjs`; expect PASS.
- [ ] **Step 5:** Checkpoint `review`.

### Task 7: Interview flow and legal pages

**Files:**
- Modify: `frontend/src/pages/{Interview,InterviewDone,Legal}.jsx`, `frontend/src/components/interview/{VerifyEmail,DetailsForm,GuidelinesModal,ProcessStepper,CompletionIcons}.jsx`, `frontend/src/components/interview/InterviewRunner.jsx` (markup and class names only)
- Test: `frontend/test-interview.mjs`

**Interfaces:**
- Frozen (do not edit): `useProctoring.js`, `uploadQueue.js`, `mediaStore.js`, `vendor/react-proctoring/*`, every `useEffect`/handler in `InterviewRunner.jsx`, all `api.*` calls.
- Legal wording per the spec's "Legal text changes": Terms §1 and §5 rewritten for a platform offered to companies; Terms §6 and Privacy §6 contacts (`sales@dotstark.com` commercial, `yash@dotstark.com` candidates); Privacy §3 says "an AI API"; "Last updated" set to the build date (`November 2026`).

- [ ] **Step 1:** Write `test-interview.mjs` on the scratch tokens: verify phase shows masked email and a send-code button; details phase has all 11 labelled fields and the 300-character counter; guidelines phase has two checkboxes and the proceed button disabled until both are checked and the device check passes (use Playwright's fake media flags `--use-fake-device-for-media-stream --use-fake-ui-for-media-stream`); the interview phase shows question text, the deadline timer, the navigator (>= xl), MCQ options selectable and "Save & continue"; the stepper shows its five labelled steps with numbers (the only place numbers are allowed); completed and aborted fixtures render their screens with `yash@dotstark.com`; `/terms` and `/privacy` contain the new wording, both addresses, and no `nvidia|nim`; guidelines text unchanged except styling (assert the "background voices" sentence still present). Do not drive proctoring violations here.
- [ ] **Step 2:** Run; **expect FAIL** (legal wording, unchanged markup assumptions).
- [ ] **Step 3:** Restyle per the spec and update legal text; touch markup/classes only in the interview components.
- [ ] **Step 4:** Build; run `test-interview.mjs`; expect PASS. Re-run `scripts/smoke_test.py` in scratch (interview state machine untouched).
- [ ] **Step 5:** Checkpoint `interview`.

### Task 8: Whole-site verification and handoff

**Files:** none new; fixes land in whichever file a finding names.

- [ ] **Step 1:** Fetch the Vercel Web Interface Guidelines (`web-design-guidelines` skill) and run the review over every file changed in Tasks 2-7; fix every finding except the two deliberate deviations (sentence case, no dark mode).
- [ ] **Step 2:** Run the taste-skill pre-flight mechanically over `landing/*`: zero `—`/`–`; eyebrow count 0; no split headers; layout families >= 4; hero text elements <= 4; one label per CTA intent; reduced-motion verified; no scroll listeners (`grep addEventListener('scroll'` returns nothing in `src/`).
- [ ] **Step 3:** `npm run build`; run every `test-*.mjs` from this plan plus `test-no-provider-names.mjs` (**expect PASS now**), `scripts/test_ai_naming.py`, `scripts/smoke_test.py`; screenshot every screen at 1440, 768, 390 and read them.
- [ ] **Step 4:** Confirm the real database and recordings are unmodified (compare file times with the baseline note from Task 0); remove `.superpowers/`, `.playwright-mcp/`, stray PNGs from the project root.
- [ ] **Step 5:** Write the summary for the owner: what changed, the two planned-but-flagged items (candidate guidelines promise voice detection that is not built; legal text needs review by whoever handles DotStark legal), how to restart the app/rebuild the image, and where the pre-redesign backup lives.
