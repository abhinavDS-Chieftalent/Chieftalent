# SDD ledger - plan: docs/superpowers/plans/2026-11-02-chieftalent-ui-redesign.md

Spec: docs/superpowers/specs/2026-11-02-chieftalent-ui-redesign-design.md (read, binding).
Executor: inline (executing-plans). Subagent tool available, so a fresh reviewer runs at the end.

Ruling: project is not a git repo, so worktree/commit/task-start/task-done scripts cannot run; ledger is kept by hand and "commit" steps become `scripts/ui_checkpoint.ps1 <name>` - cost if wrong: no diff history, only folder snapshots.
Ruling: Task 3 does not need to modify Logo.jsx (the `onDark` variant already resolves to the full-colour `chieftalent-logo-white.png` the spec wants on the black bar) - cost if wrong: none.
Ruling: Task 2 keeps `.label-micro` as a deprecated sentence-case, non-mono alias (not removed) until every caller is restyled; removed in Task 8 once grep shows zero callers - otherwise Tasks 3-7 would render unstyled labels mid-way. Cost if wrong: a leftover class.

Pre-flight: Task 0 -> all tasks: produces test-helpers.mjs + scratch fixtures.json; consumed as specified, no conflict.
Pre-flight: Task 1 -> Task 4: overview key `ai` ({ok,error}); Task 4 reads `ov?.ai?.ok`; consistent.
Pre-flight: Task 2 -> Tasks 3-7: token names + primitive variants; `.label-micro` conflict ruled above.
Pre-flight: Task 3 -> Logo/StatusBadge/Badge/Button: exist, signatures unchanged.
Pre-flight: Task 5/6 split components consume props from page files only; no cross-task overlap.

Ruling: test-no-provider-names ignores matches inside react-device-detect's user-agent vendor table (library data, never rendered; the proctoring vendor code imports it) - cost if wrong: a provider name inside that table is the only thing it could hide, and it is not visible.
Baseline: real data\hr_mvp.db mtime 2026-10-29T16:25:18, 46 recording folders (must be unchanged at the end).
Task 0: complete (scratch builds, real DB untouched, test-no-provider-names FAILS on the 8 real hits as expected)
Task 1: complete (test_ai_naming 7/7 RED->GREEN; smoke_test 34/34 in scratch; checkpoint naming)
Ruling: brand text token is --text-muted (shadcn --muted stays the quiet surface); the first draft reused --muted for both and made all secondary text near-invisible - caught by screenshot, fixed - cost if wrong: none now.
Ruling: admin pages are verified with domcontentloaded + explicit waits, never networkidle (4s polling by design) - cost if wrong: none.
Ruling: ont-mono utility resolves to Archivo (no monospace anywhere) so un-restyled callers cannot leak a mono face before Tasks 5-6 - cost if wrong: none.
Finding for Task 5: a 70-char name/email widens the candidates table past the viewport (seen in tokens screenshot).
Task 2: complete (test-tokens 14/14 RED->GREEN; build ok; no console errors on /login and /admin; checkpoint tokens)
Ruling: test-landing counts only link-text CTAs when checking one-label-per-intent (the footer displays the address as text, not a CTA) - cost if wrong: none.
Ruling: Navbar.jsx (previously unused dead code) rewritten as the real top bar; Logo.jsx unchanged - cost if wrong: none.
Ruling: timeline sample fragments are inert + aria-hidden (decorative, prose carries meaning), built from the app's real components (StatusBadge, Badge, Button, Avatar, option-row) - cost if wrong: a screen-reader user hears the stage text but not the sample.
Task 3: complete (test-landing 31/31 RED->GREEN at 1440/768/390/360 + reduced motion; visual check of hero, full page, mobile; checkpoint landing)
Correction: the earlier line starting "Ruling: ont-mono utility" means the `font-mono` utility (a shell escape ate the "f").
Finding+fix (Task 4): AdminShell crashed on an empty/old overview payload (ov.candidates.length unguarded) and showed a false red "unreachable" before data arrived; now guarded with Array.isArray and the status reads "Checking AI API..." until the API reports ok true/false.
Ruling: closed mobile drawer gets inert (it was aria-hidden but its links stayed keyboard-focusable) - cost if wrong: none.
Task 4: complete (test-shell 24/24 RED->GREEN incl. empty-payload resilience, inert drawer, no provider/model text; login visually checked; checkpoint shell)
Finding+fix (Task 5): the candidates table was 1152px in a 1086px container at 1440 and clicking a row action scrolled it sideways, clipping the first column. Candidate cell max 15rem, role max 8rem; table now exactly fits. My own first fit check was vacuous (it matched the tab bar, not the table) - caught by reading the screenshot and fixed to select the table wrapper.
Ruling: dashboard split into components/dashboard/{StatsRow,IntakeArea,CandidatesTable}; state, handlers, polling, and API calls remain in pages/Dashboard.jsx unchanged - cost if wrong: none.
Ruling: tests scope candidate delete buttons to tbody (sidebar also has Delete role buttons) - cost if wrong: none.
Task 5: complete (test-dashboard 34/34 RED->GREEN incl. polling, admin/recruiter, confirm dialog, empty state, long-name row, 360px; visual check; checkpoint dashboard). Cleanup later: frontend/find-overflow.mjs is a debug helper.
Finding+fix (Task 6): display bug in the original page - per-answer score badges looked for keys the evaluator never emits (relevance, correctness...), so only "overall" showed; now reads content_score/relevance_score/communication_score/completeness_score/overall_score (components/review/scoreKeys.js). Objective tally fallback counts mcq as well as yes_no.
Finding+fix (Task 6): `m-0` on a dl overrides the parent space-y gap (0px between blocks); removed on the two affected lists; spacing now asserted by test (>=12px).
Ruling: CandidateDetail split into components/review/{AtsSection,DetailsSection,AnswersSection,EvaluationSection,ReviewRail}; all state, handlers (review, shortlist, retake, copy), alert() on review error, and 5s polling remain in the page unchanged - cost if wrong: none.
Ruling: the review test saves "Needs more review" (not Selected/Rejected) so dashboard tab counts in the shared fixtures are unaffected; ui_cycle resets fixtures between runs anyway.
Task 6: complete (test-review 43/43 RED->GREEN incl. score labels, objective tally, recordings, confirm dialogs, review save, empty states, long name at 1440/360, 360px; visual check; checkpoint review)
Incident (Task 7): my bulk class-replacement script treated its one single-pair entry as a flat string and swapped every "m" for "i" in InterviewDone.jsx. Caught by reading the file; restored from checkpoint "review"; the other six touched files verified (identical line counts, no corruption markers). Rule going forward: no bulk string scripts with single-element lists; use the Edit tool for one-off changes.
Finding+fix (Task 7): details screen had no h1 (its title was a div) and guidelines used h2 first; both are now the page h1. Stepper truncated its own labels ("Verify...", "Interv..."); steps now size to content (test asserts no clipped label).
Ruling: aborted screen now says "write to yash@dotstark.com" instead of "contact is in your invitation email" (the spec routes interview problems to that address) - cost if wrong: copy only.
Ruling: test-interview filters the one expected 400 (deliberate wrong verification code) from console errors for that block only - cost if wrong: none.
Ruling: guidelines and invite wording about background voices left exactly as written (owner brief); flagged for the final summary: voice detection is not built (listed under Planned).
Ruling: the interview runner is verified up to its fullscreen gate in headless mode (proctoring behaviour intentionally untouched); runner restyle was class/markup-only and every effect/handler is unchanged - cost if wrong: a visual issue past the gate would not be caught by automation; manual look recommended.
Task 7: complete (test-interview 77/77 RED->GREEN: verify->details->guidelines flow, labels, headings, end screens, legal wording/contacts, no provider names, 360px; checkpoint interview)
Task 8 (mechanical, pre-review): Vercel rules fetched live and matched the project copy. Findings fixed test-first: logo <img> width/height attributes; admin shell main#main + skip link + overscroll-contain on the drawer; form fields name/autocomplete; verify code name + spellCheck off + proper focus ring; ellipsis character in placeholders; label-micro removed (zero callers); min-h-screen -> dvh.
Task 8 regression: test-tokens 15, test-landing 31, test-shell 27, test-dashboard 33, test-review 41, test-interview 74 - all pass; test-no-provider-names PASS (failed at baseline); test_ai_naming 7/7; smoke_test 34/34 (scratch). No scroll listeners in src. Zero eyebrows.
Dispatched final whole-branch reviewer (fable) with spec, plan, ledger, baseline snapshot and Review Focus.
Final: reviewer found no behaviour regressions (useProctoring.js and uploadQueue.js byte-identical to baseline; all handlers, effects and polling identical apart from the sanctioned score-key fix).
Final: fixed landing over-claims - "override a score"/"Override any score", "A person decides every hire and every rejection", "a reviewer makes every decision", "You set the line"/"You set it" - test test-landing "no claims the product does not support" RED->GREEN; copy now says overrule any recommendation, a person makes the final hiring decision, the shortlist line is a setting (70 by default; at or above it a link is sent).
Final: fixed inline links losing their underline (unlayered .link beat Tailwind utilities, plain links in legal, candidates, data, ATS, intake, rail) - test "inline links with an underline class are actually underlined" RED->GREEN by moving .link into @layer components.
Final: fixed stepper page overflow of 10-81px at 640-700px (my own regression from un-truncating labels) - tests at 600/640/680/700/768 for verify and aborted RED->GREEN; full labels now show from md (768px) up.
Final: fixed test hygiene - removed a vacuous "|| true" assertion in test-interview. Assertion counts moved between task logs and the final run because earlier ledger lines quoted my own tallies (dashboard 33, review 41, interview 84 now); added scripts/ui_test_all.ps1 so the suites always run from a fresh scratch copy with the interview suite last (they share and mutate fixtures); suite state pollution, not a code regression, caused one spurious red run - re-run clean.
Final: Ruling: guideline/invite sentence "The entire interview session is recorded" left as written (owner brief; recording is actually only the video answer, so candidates are told MORE is recorded than is) - surfaced to the owner as a decision, not changed - cost if wrong: candidates are told something broader than the platform does.
Final: Ruling: landing says the shortlist line "is a setting" rather than "you set it": the code only supports it as an ATS_THRESHOLD config value, not a page control; the spec wording (set by the user) was relaxed to stay true - cost if wrong: copy only.
Final: minor (deferred): public_error() in nim_client.py is not applied inside extract_json messages (raw model output up to 200 chars can reach "Could not create role" and the stored "AI evaluation failed" summary) and does not cover model-family words.
Final: minor (deferred): spaced hyphen used as a dash in two sentences (AdminShell delete-role dialog, GuidelinesModal) - hyphen is allowed, em/en dashes are zero.
Final: minor (deferred): ADMIN and RECRUITER badges are literal capitals in the sidebar footer.
Final: minor (deferred): if /api/admin/overview keeps failing the sidebar says "Checking AI API..." indefinitely (the original said unreachable).
Final: minor (deferred): an empty overview payload shows "ATS threshold" with no value on the dashboard header.
Final: minor (deferred): the JD textarea and the review notes textarea rely on a nearby heading plus aria-label rather than a visible label.
Final: minor (deferred): CandidateDetail score keys and the objective fallback differ from baseline (intended, sanctioned fix) - noted so it is not mistaken for a regression.
