# HR Screening & Interview MVP (Phase 0)

End-to-end proof-of-concept of the HR screening workflow:

```
CV folder -> AI ATS review (NIM) -> threshold -> reject | shortlist
  -> SMTP email -> unique interview link -> timed online interview
  -> answers + recordings + transcripts stored -> AI evaluation (NIM)
  -> HR dashboard -> mandatory human review
```

There is **no AI interviewer and no telephony**: the website presents
HR-configured questions, enforces per-question time limits, records
microphone/camera answers, transcribes speech (browser SpeechRecognition,
with typed fallback), and stores everything. AI is used in exactly two
places — ATS CV review and post-interview answer evaluation — both via the
configured NVIDIA NIM endpoint (OpenAI-compatible). No other AI provider.

## Stack

- **Backend:** Flask + SQLite (WAL), standard `smtplib` for email
- **Frontend:** React 18 + Vite + Tailwind CSS v4 SPA (`frontend/`), built to
  `app/static/spa/` and served by Flask — admin dashboard, candidate detail
  with recording playback, and the candidate-facing interview page
- **AI:** NVIDIA NIM only (OpenAI-compatible), via the dedicated proxy on
  port 8100; model pinned to `openai/gpt-oss-20b` (benchmarked fastest of the
  available models on the real ATS prompt: ~23s per full CV review)

## HR workflow

1. Open http://localhost:5000/admin/
2. Pick the role, choose one or more CV PDFs, press **Upload & screen**.
   CVs are screened one by one; the table refreshes live as each finishes.
3. Rejected candidates show their score and stop there — nothing else happens.
4. Shortlisted candidates get a **Copy link** button in the table — that's the
   unique interview link (also emailed when SMTP is configured). Open it
   yourself to test the interview exactly as a candidate would.
5. After the interview completes, AI evaluation runs automatically; open the
   candidate to see answers, transcripts, play recordings, and make the final
   manual decision.

## Layout

```
app/
  config.py                 env-driven configuration
  db.py                     SQLite schema + helpers
  pipeline.py               CV folder -> ATS -> shortlist/reject -> email
  services/
    cv_parser.py            PDF text/email extraction (pypdf, no AI)
    nim_client.py           OpenAI-compatible NIM client (health, retries)
    ats_reviewer.py         CV vs job posting -> structured ATS score
    email_service.py        SMTP via smtplib; dev outbox fallback
    interview_service.py    question sets, sessions, server-side timers
    evaluation_service.py   objective scoring + NIM spoken evaluation
  routes/
    admin.py                /admin dashboard, detail, review, pipeline
    interview.py            /interview/<token> candidate-facing pages
data/
  job_postings/<role>.json  job posting per role
  interviews/<role>.json    question set per role (types, limits, answers)
  recordings/<token>/       original audio/video per interview
  outbox/                   emails when SMTP is not configured
  hr_mvp.db                 SQLite database
jobs/<role>/*.pdf           CV intake folders
scripts/
  generate_dummy_cvs.py     creates 3 dummy BA CVs
  e2e_demo.py               walks a full interview over HTTP
```

## Setup

```bash
uv venv .venv
uv pip install -r requirements.txt
cp .env.example .env        # adjust NIM_BASE_URL / SMTP_* as needed
```

## Run the demo

Easiest: double-click **`start.bat`** (creates the venv, installs deps,
generates dummy CVs if missing, starts the server). The app listens on
**http://localhost:5000** — port 8000 stays reserved for the NIM proxy.
Set `PORT` in `.env` to use a different port (and update `BASE_URL` to match).

Manual equivalent:

```bash
# 1. generate dummy Business Analyst CVs into jobs/business_analyst/
.venv/Scripts/python scripts/generate_dummy_cvs.py

# 2. run the screening pipeline (ATS review + shortlist/reject + email)
.venv/Scripts/python -m app.pipeline --role business_analyst

# 3. start the web app (dashboard + interview pages)
.venv/Scripts/python run.py

# 4a. HR dashboard:  http://localhost:5000/admin/
# 4b. or drive a full interview end-to-end from the CLI:
.venv/Scripts/python scripts/e2e_demo.py
```

Interview links for shortlisted candidates are printed by the pipeline and
stored in `data/outbox/*.html` when SMTP is not configured.

## Dedicated NIM proxy (port 8100)

This app runs against its **own** nim-proxy container, separate from any
other nim-proxy you use (e.g. the one on port 8000):

```bash
docker run -d --name hr-nim-proxy -p 127.0.0.1:8100:8000 \
  -v hr-nim-proxy-data:/data --restart unless-stopped \
  ghcr.io/miztertea/nim-proxy:latest
```

Then open **http://localhost:8100/setup** once and complete the wizard with
your NVIDIA account key(s) from build.nvidia.com (keys are pasted into the
wizard, never into files). Verify with:

```bash
.venv/Scripts/python scripts/check_nim.py
```

Default model: `openai/gpt-oss-20b` (efficient MoE, ~3.6B active params,
reliable structured JSON — verified live). Change `NIM_MODEL` in `.env` to
switch; `scripts/check_nim.py` confirms whatever you pick actually works.

## Configuration (.env)

| Variable | Purpose |
|---|---|
| `NIM_BASE_URL` / `NIM_API_KEY` / `NIM_MODEL` | NIM endpoint; empty model = auto-discover from `/v1/models` |
| `ATS_THRESHOLD` | minimum ATS score to shortlist (default 70) |
| `SMTP_HOST/PORT/USERNAME/PASSWORD/FROM/USE_TLS` | SMTP; empty host = dev outbox |
| `BASE_URL` | public base URL used in interview links |
| `ADMIN_KEY` | if set, /admin requires `?key=` or `X-Admin-Key` |
| `HR_TIME_GRACE_SECONDS` | upload grace added to each question's time limit |
| `OBJECTIVE_WEIGHT` / `SPOKEN_WEIGHT` | final score blend (default 0.4 / 0.6) |
| `PASS_THRESHOLD` / `BORDERLINE_THRESHOLD` | recommendation bands |

## Notes & limitations (Phase 0)

- Speech-to-text uses the browser's SpeechRecognition API (Chrome/Edge). The
  original recording is always stored, so a server-side STT (e.g. a NIM
  Whisper-style model) can replace it later without changing the workflow.
- Timer enforcement: the server stamps when a question is served and flags
  answers submitted after `time_limit + grace`; the client auto-submits at
  expiry. Refreshing the page does not reset the clock.
- Rejected candidates get **no** email, token, interview or evaluation.
- AI recommends; HR decides. Final status is set by the manual review form.
