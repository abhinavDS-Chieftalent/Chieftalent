# ChiefTalent - all-in-one image (Flask API + pre-built React SPA in app/static/spa)
FROM python:3.11-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1

WORKDIR /app

# Remux browser-recorded WebM files after upload so their duration/cue index
# supports seeking in browsers and downloaded media players.
RUN apt-get update \
    && apt-get install -y --no-install-recommends ffmpeg \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt gunicorn

# Changing CACHEBUST (compose build --build-arg CACHEBUST=<new>) invalidates
# only the COPY layers below — pip stays cached. Needed because BuildKit's
# context checksums can go stale with OneDrive-synced files.
# The ARG must be CONSUMED by a layer for it to invalidate anything — an
# unused ARG is a no-op and the COPYs below stay falsely cached.
ARG CACHEBUST=1
RUN echo "cachebust: $CACHEBUST" > /dev/null

COPY run.py .
COPY app ./app
COPY scripts ./scripts
COPY jobs ./jobs
COPY frontend/public ./frontend/public
COPY app/static/spa ./app/static/spa

# data/ (SQLite, CVs, recordings, outbox) is a mounted volume, never baked in.
RUN mkdir -p /app/data

ENV HOST=0.0.0.0 \
    PORT=5000

EXPOSE 5000

# Long timeout: NIM screening calls take ~25s per CV.
CMD ["gunicorn", "--bind", "0.0.0.0:5000", "--workers", "2", "--threads", "4", "--timeout", "300", "run:app"]
