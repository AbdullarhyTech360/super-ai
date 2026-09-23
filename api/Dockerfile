FROM python:3.13-slim

WORKDIR /app

# Install system deps needed by psycopg2-binary and general runtime
# Retry/timeout settings harden the build against flaky networks (e.g. mobile hotspots)
RUN apt-get update -o Acquire::Retries=5 -o Acquire::http::Timeout=60 \
    && apt-get install -y --no-install-recommends -o Acquire::Retries=5 -o Acquire::http::Timeout=60 gcc libpq-dev curl \
    && rm -rf /var/lib/apt/lists/*

# Install pdm
RUN pip install --no-cache-dir --retries 10 --timeout 120 pdm

# Copy dependency manifests first for better layer caching
COPY pyproject.toml pdm.lock ./

# Install project dependencies into the system python (no venv)
# Retry loop: pdm has no built-in network retry, and each attempt reuses cached wheels
RUN pdm config python.use_venv false \
    && for i in 1 2 3 4 5; do \
         pdm install --prod --frozen-lockfile --no-self && break; \
         [ "$i" -eq 5 ] && exit 1; \
         echo "pdm install failed (attempt $i/5), retrying..."; sleep 10; \
       done

# Copy application code
COPY app ./app

EXPOSE 8000

CMD ["pdm", "run", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
