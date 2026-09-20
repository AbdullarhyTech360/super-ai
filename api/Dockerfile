FROM python:3.13-slim

WORKDIR /app

# Install system deps needed by psycopg2-binary and general runtime
RUN apt-get update \
    && apt-get install -y --no-install-recommends gcc libpq-dev curl \
    && rm -rf /var/lib/apt/lists/*

# Install pdm
RUN pip install --no-cache-dir pdm

# Copy dependency manifests first for better layer caching
COPY pyproject.toml pdm.lock ./

# Install project dependencies into the system python (no venv)
RUN pdm config python.use_venv false \
    && pdm install --prod --frozen-lockfile --no-self

# Copy application code
COPY app ./app

EXPOSE 8000

CMD ["pdm", "run", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
