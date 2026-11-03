# ChiefTalent UI redesign: design

Date: 2026-11-02. Status: draft, awaiting approval.

## Intent and why

The current interface looks like every other generated SaaS site: system/AI-default fonts (Syne, DM Sans, Inter), a centered dark hero with a stat strip, four identical feature cards, tracked all-caps eyebrow labels over every section, mock screenshots that do not match the current UI, and no real explanation of what the product does. The owner rejected this directly ("the AI font, the same landing page like other vibecoded websites, those cards, those numbers 01 02 03, those misplaced demo screenshots, no proper explanation of the product").

The redesign gives ChiefTalent one distinct, brand-owned look across the whole web app and a landing page that explains the product plainly, **without changing any behaviour**. Same routes, same API calls, same state machines. Only presentation, layout and copy change.

## Who it is for

- **Companies** evaluating ChiefTalent (the landing page must sell and explain).
- **DotStark recruiters / admins** who sign in daily (landing page must get them to the sign-in in one click; the dashboard and candidate review are their workspace).
- **Candidates** who receive a personal interview link (the `/interview/:token` flow).

## Goals

1. A landing page that explains the product in plain words to a company reading it cold: what it does, how one role runs, what the AI does vs what a person does, what candidates go through, how data is handled.
2. One cohesive visual system (type, colour, spacing, components) applied to landing, login, dashboard, candidate review, interview flow, and legal pages.
3. Real product pieces built in HTML/CSS as illustrations, not screenshots.
4. Zero regression in behaviour. Every existing function still works.
5. Meets the quality floor: responsive down to 360px wide (also checked at 390px), visible keyboard focus, `prefers-reduced-motion` honoured, AA contrast, passes the Vercel Web Interface Guidelines review (`vercel-guidelines.md` in the project root, also the `web-design-guidelines` skill).

## Non-goals

- No backend, database, API, auth, routing or proctoring logic changes. (Exceptions: two error-message strings and one response field under "Naming rule"; the display fix below is front-end only.)
- No new product features or pages beyond the landing page sections.
- No dark mode. No i18n. No pricing page.
- No email template redesign (the logo swap already done stays).

## Anti-goals (would make this a failure even if it works)

- Any of: numbered markers (01/02/03) outside the interview stepper (which is a real sequence); a grid of identical feature cards; tracked ALL-CAPS eyebrow labels; monospace "label" text; an Inter/Syne/DM Sans/Space Grotesk/Manrope font; gradient washes; centered hero over a dark mesh; a stat strip; stock or old screenshots; fake or unverifiable claims ("700+ hours saved").
- Any copy, graphic or fragment that presents a planned feature as available today (for example a sample review showing gaze tracking or a "flagged: second person" event). Only built behaviour appears outside the Planned section.
- A landing page that blends into itself (the logo sitting on the same colour as the hero).
- Visual changes that move or hide controls so recruiters or candidates cannot find them.

## Decisions made with the owner

| Decision | Choice |
|---|---|
| Landing direction | "Orange field": full-width orange hero. |
| Hero headline | "Fifty CVs in. A shortlist out." |
| Hero graphic | A ranked list of CV match scores with a dashed "shortlist line" at 70 (the real `ATS_THRESHOLD`, set by the user). Above the line: black bars. Below: grey. |
| Top bar | **Black bar** across the top with the **full-colour logo**: the existing `chieftalent-logo-white.png` (white head + "Chief", orange check, nodes and "Talent"). Not recoloured, no plate behind it. |
| Typeface | **Archivo** (variable, width + weight axes), used for everything. One family. |
| Audience | Companies plus DotStark recruiters. |

Mockups the owner reviewed live in `.superpowers/brainstorm/1192-1793621748/content/` (`landing-directions.html` option B, `landing-nav-options.html` option 2). They are the visual reference for the hero and top bar.

## Design system (my calls, to be confirmed by approval)

**Colour** (named tokens; replace the current `--background` cream `#faf9f7`, which is the generic warm-cream default):

| Token | Hex | Use |
|---|---|---|
| ink | `#13110F` | Top bar, sidebar, headline text on orange, primary text on light |
| orange | `#EE5A2E` | Brand, hero field, primary buttons |
| orange-deep | `#C4421B` | Orange text/links on white (AA) |
| paper | `#FFFFFF` | Panels, tables, forms |
| fog | `#F2F3F5` | App background (cool neutral, not cream) |
| line | `#DDE0E5` | 1px dividers/borders |
| muted | `#5B6270` | Secondary text |
| pass / warn / fail | `#14532D` on `#E6EFE9` / `#7A4A00` on `#FFF1D6` / `#C1362C` on `#FBE6E3` | Status |

**Type.** Archivo variable. Display: weight 800, width ~90 (condensed-leaning), tight leading (~0.93), tight tracking. Section heads: weight 740, width ~105. Body: weight 420, width 100, line-height 1.55, max line length under 70 characters. Numbers use tabular figures. No monospace face anywhere. Use `text-wrap: balance` on headings. Self-host the font (`woff2` in `frontend/public/fonts`, `font-display: swap`, preload the primary file) and remove the Google Fonts links for Syne, DM Sans, DM Mono and Inter.

**Shape.** Controls 6px radius, panels 8px, hero artifact 10px. Hierarchy comes from spacing, weight and 1px lines, not from boxing everything in a rounded card with a drop shadow. Lists of records (candidates, answers) are rows with dividers, not stacks of cards.

**Motion.** One orchestrated moment: on landing load, the ranked list in the hero draws itself (bars grow left to right in sequence with `transform: scaleX`, then the dashed shortlist line appears and the rows below it dim). Everything else is responsive feedback only (hover, focus, open/close). Animate `transform`/`opacity` only, never `transition: all`, disable under `prefers-reduced-motion`.

**Copy.** Sentence case, active voice, plain words, specific button labels ("Sign in", "Talk to DotStark", "Save review"), no spaced em dashes, no middle-dot meta strings, `&` only where space is tight.

## Landing page structure

Single page at `/`, no new routes. Section anchors for the top-bar links.

1. **Top bar** (black): full-colour logo left; links "How it works", "For candidates", "Data & privacy"; right: "Sign in" (orange button). Sticky is optional. On narrow screens the links collapse to a menu button.
2. **Hero** (orange field, ink type, left-aligned): H1 "Fifty CVs in. A shortlist out."; one plain sentence; primary button "Talk to DotStark" (`mailto:sales@dotstark.com`); secondary link "See how a role runs" (anchor). Right: the ranked-list graphic (white panel sitting on the bottom edge of the hero) with the one load animation.
3. **The idea** (white): "The first round runs itself. You keep the final word." plus a short paragraph: reads each CV against your job description, invites the people who fit to a 30-minute video interview in their browser, gives you recordings, transcripts and scores on one page; the AI recommends, a person decides.
4. **How one role runs** (white): a vertical timeline with named stages (no numbers): *Add the job*, *CVs come in*, *Good fits get a link*, *They interview in their browser*, *You review the evidence*, *You decide*. Each stage has two or three sentences and a small piece of real UI built in HTML (structured JD; a CV with its score and reasons; the invite email; the interview screen with timer and question; the review page with transcript and recording; the decision buttons). The timeline is a real sequence, so a connecting line and stage markers are legitimate; they just are not numbers.
5. **Who does what** (white, two plain columns separated by one rule, not cards): "What the AI does" and "What you do". Content as in the owner-reviewed mockup C.
6. **For candidates**: what a candidate goes through, in order of the real flow (email check; short details form; camera and microphone check; 30 minutes: one video answer and 20 questions; tab-switch and full-screen rules with the 3-warning limit stated plainly).
7. **Planned** (owner-required): a short, quiet list of features that are specified but not built yet, so companies see where the product is going. Each row has a plain name, one sentence on what it will do, and a small "Planned" tag. No dates, no promises of timing, no "coming soon" countdowns, no cards, no numbers. The list (from the owner's original brief and the proctoring port notes):
   - **Situation-based video question.** A final camera question, answerable in about five minutes, that shows how a candidate handles a real work situation: interpersonal skills, technical thinking, problem-solving, decision-making, communication.
   - **Stronger interview integrity checks.** Detecting a second person or a phone in frame, where the candidate is looking, head position, background voices, and a photo-or-screen spoof check.
   - **Server-side speech-to-text.** Transcripts produced by the platform instead of the candidate's browser, so accuracy no longer depends on which browser they use.
   - **Video and voice analysis.** The AI reviewing how an answer was delivered, not only the transcript.
   The owner can add or remove rows; the section must make it unmistakable that none of these are live today. (Account recovery for recruiters, i.e. password reset, is also unbuilt but is not a selling point; it is left off the landing page.)
8. **Data & privacy**: plain statements, each verified against the code before it is written (see "Facts to verify").
9. **Closing band** (ink): one headline, "Talk to DotStark" and "Sign in" buttons; footer with the mark-only logo, Terms, Privacy, dotstark.com.

## Application screens

All behaviour unchanged. The shared look comes mostly from restyling the primitives in `frontend/src/components/ui/*` and the tokens in `index.css`, so every screen inherits it.

- **Login:** keep the split layout. Left black panel: full-colour logo, one sentence about the product. Right: form. Keep sign-in, forgot-password and OTP-sent views exactly as they behave.
- **Admin shell (sidebar):** black, as now, new type, logo already in. Role list, role filter, delete-role, AI-status dot, user footer unchanged.
- **Dashboard (`/admin`):** rework the hierarchy. Page header with the role filter state; the four stat "cards" become one plain inline figure row; "Add a job description" and "Screen new CVs" become one intake area (two columns, no card-in-card); the candidates table is the visual centre (tabs with counts, ATS meter, status, actions). Keep: JD from text, JD from file, JD PDF download, CV upload with duplicate reporting, polling every 4s, tab filters, copy link, delete (admin only) with confirm dialog.
- **Candidate review (`/admin/candidate/:id`):** replace the stack of cards with sections divided by rules: ATS (matched/missing/reasoning), details form data, interview answers with playback and download, AI evaluation. Right rail (sticky) keeps Details and Manual review. Keep shortlist override, retake with confirm, verification code display, review save.
- **Interview (`/interview/:token`):** black header with full-colour logo; keep the five-step stepper (it is a real sequence; numbers stay here); keep verify, details form, guidelines + device check, runner, completion and terminated screens. Restyle only. **Do not touch** proctoring, timers, recording, the upload queue, or fullscreen gate behaviour.
- **Legal pages:** same tokens, plus the wording changes in "Legal text changes".

## Constraints

- Stack stays: React 18, Vite 6, Tailwind v4, Radix primitives, react-router 6, `motion` (already a dependency, use it for the hero sequence or use CSS; builder's choice). No new runtime dependencies except self-hosted font files.
- Vite `base` is `/static/spa/`; assets referenced via `import.meta.env.BASE_URL`. Build output goes to `app/static/spa/` (wiped on build). There is no git repo: back up the built folder before each build.
- Tailwind v4 specificity pitfall: unlayered CSS beats utilities (a prior note in `index.css` says so). Keep custom CSS in layers or avoid `display` on classes that also take utilities.
- The built `index.html` is served at `/` and for unknown routes; keep a real `<title>`, meta description, one `<h1>`, semantic headings, and real text (not images of text) so the landing page stays crawlable. `frontend/prerender.mjs` exists but is not currently applied to the build; leave that as is.
- Do not use the real database or recordings for testing: test against a scratch copy of the project.

## Facts to verify before writing copy (do not invent claims)

- The shortlist threshold is configurable (`ATS_THRESHOLD`, default 70).
- Interview length is 30 minutes; one spoken video answer plus 20 multiple-choice questions (10 from the JD, 10 from the CV).
- Tab/full-screen violations: 3 warnings abort the interview.
- Candidates verify by a 6-digit code emailed to the CV address.
- Deleting a candidate removes CV, answers, recordings and evaluation.
- What leaves the server: CV text, and spoken-answer transcripts, are sent to the configured AI API for scoring and question writing. Say this plainly, as "an AI API", without naming the provider (see the naming rule). Do not claim certifications, encryption, retention periods or compliance that the code does not implement.
- `Terms` currently calls ChiefTalent "an internal hiring tool operated by DotStark". The owner has decided this must change; see "Legal text changes". The landing page copy must agree with the updated Terms.

## Naming rule: no provider names in anything user-visible (owner-required)

The AI provider and gateway stay in the code and config (`NIMClient`, `NIM_*` env vars, `.env`, README, docs, comments are internal and untouched). But **nothing a visitor, recruiter or candidate can see may name NVIDIA, NIM, nim-proxy, or a model family** (e.g. gpt-oss, nemotron, llama). Where the product needs to refer to it, it says **"AI API"** (or just "AI").

Places that currently leak, to fix as part of this work:

1. `Legal.jsx` Privacy §3: "AI models hosted on NVIDIA NIM infrastructure" becomes "an AI API" (still true: CV text and transcripts are sent to it to produce scores and evaluations).
2. `AdminShell.jsx` sidebar footer shows the configured model name (e.g. an `nvidia/...` id) under the status dot. Remove the model line. The status label becomes "AI API connected" / "AI API unreachable".
3. Error text that reaches screens: `nim_client.py` raises messages beginning "NIM chat failed after…" and "NIM server has no models…". These surface in the JD-creation error message, in a candidate's stored AI-evaluation summary ("AI evaluation failed: …") and in stored ATS error results. Reword the two messages to say "AI API" (string change only, same exceptions, same behaviour).
4. `GET /api/admin/overview` returns a `nim` object including `model`. Rename the object to `ai` and drop `model` from the response; update `AdminShell.jsx` (the only consumer) in the same change. This is the one deliberate API shape change; it exists only so the provider name is not visible in the browser's network tab to a signed-in user.
5. New landing copy, the "Data & privacy" section and any alt text follow the same rule. The rebuilt bundle must be searched for `nvidia` and `nim` (case-insensitive, as whole words/identifiers) before the work is called done; the only acceptable hits are in code identifiers that are not rendered.

This is the only backend-touching exception to "no backend changes" (items 3 and 4), and it is limited to message strings and the one response field.

## Existing inconsistency to flag (not changed by this work)

The candidate guidelines (`GuidelinesModal.jsx` and the invite email) say background voices "may be detected and flagged". Voice detection is not built (it is in the Planned list). The wording comes straight from the owner's original brief, so this work leaves it exactly as written and restyles it only. The final summary reminds the owner that candidates are currently told something the platform does not yet do.

## Small display fix (in scope, optional)

`CandidateDetail.jsx` looks for per-answer score keys `relevance`, `correctness`, `communication`, `completeness` but the evaluator emits `relevance_score`, `content_score`, `communication_score`, `completeness_score`, `overall_score`, so only "overall" shows. And the objective tally filters `question_type === 'yes_no'` while questions are `mcq`. Fix both in the display layer while restructuring the page; no backend change.

## Left to the builder

Exact copy for each timeline stage fragment; fragment layouts; animation timing and easing; breakpoints; icon use (Phosphor is available; use sparingly); the precise component restyles; file structure for new landing sections (split `Landing.jsx` into section components).

## Verification

Build, then check in a real browser at 1440, 768 and 390 widths: landing, login, dashboard, candidate review, a full interview run-through (verify, details, guidelines, runner) on a scratch copy; keyboard-only pass; reduced-motion pass; run the Vercel Web Interface Guidelines review over every changed file and fix findings; run `scripts/smoke_test.py` to confirm the backend is untouched. Confirm no console errors beyond expected network ones.

## Calls made while writing this (mine, not the owner's; change on request)

- Text on the orange field is ink (`#13110F`), never white: white on `#EE5A2E` fails AA contrast.
- The scores in the hero ranked list are illustrative; the panel carries a small "Sample" label so it is not read as real data. The same applies to any candidate name or score in the timeline fragments.
- The old demo screenshots (`public/demo/*.png`) are no longer referenced by the landing page. The files stay in place (not deleted); remove only if the owner asks. The unused `components/magicui/*` and `components/landing/Navbar.jsx` are left untouched.
- Archivo is open-licensed (SIL OFL); the builder downloads the variable `woff2` (Latin subset) and self-hosts it.
- The display fix in `CandidateDetail.jsx` reads the evaluator's actual keys (`relevance_score`, `content_score`, `communication_score`, `completeness_score`, `overall_score`) and the `mcq` question type, confirmed against `evaluation_service.py` and `question_generator.py`.

## Open items for the owner

1. ~~Which email should "Talk to DotStark" point to?~~ **Decided by the owner:** companies contact **sales@dotstark.com**; anything about interviews (candidate problems, disputes, "my link does not work") goes to **yash@dotstark.com**. So every "Talk to DotStark" button and the closing band use `mailto:sales@dotstark.com`; the "For candidates" section, the interview screens (completion screen already uses it) and the invite emails keep `yash@dotstark.com`. Never mix the two.
2. ~~Is the Terms wording ("internal hiring tool") still right for a public pitch?~~ **Decided by the owner: it must be changed.** See "Legal text changes" below.

## Legal text changes (owner-required)

`frontend/src/pages/Legal.jsx` still describes ChiefTalent as an internal tool. Change only what makes it wrong for a product offered to companies, and keep every statement true to the code:

- **Terms §1:** replace "an internal hiring tool operated by DotStark" with a description of a hiring platform provided by DotStark to the companies that use it (still: screens CVs with AI, runs timed browser-based interviews, presents scores and recordings to authorised hiring staff, AI output advisory, a human makes every decision).
- **Terms §5:** replace "provided as an internal tool without a service-level commitment" with wording for a provided service that does not make an uptime commitment unless one is agreed in writing with DotStark; keep "DotStark may modify or discontinue features with notice".
- **Terms §6 and Privacy §6 (contact):** add the two addresses. Commercial and account questions: `sales@dotstark.com`. Questions from candidates about an interview, their data, or a correction/deletion request: `yash@dotstark.com`. (Privacy §6 currently tells candidates to contact a "workspace administrator", which candidates do not have.)
- **Terms §2 (accounts by invitation)** stays but must read naturally for a company customer (accounts are created by the customer's workspace administrator).
- Everything else (data handling, AI processing on NVIDIA NIM, retention/deletion, security) is already accurate to the code. Leave it. Bump "Last updated" to the date of the change.

These edits are plain-language product terms, not legal advice. The builder implements them as written and the final summary tells the owner to have the text reviewed by whoever handles DotStark's legal matters before launch.
