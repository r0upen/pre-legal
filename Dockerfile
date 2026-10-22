# Stage 1: build the Next.js frontend into static files (frontend/out).
FROM node:24-slim AS frontend
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# Stage 2: the Python backend, which serves the API and the static frontend.
# Paths mirror the repo layout so the backend finds templates/ and frontend/out.
FROM python:3.12-slim
COPY --from=ghcr.io/astral-sh/uv:0.13.3 /uv /bin/uv
WORKDIR /app/backend
COPY backend/pyproject.toml backend/uv.lock ./
RUN uv sync --frozen --no-dev
COPY backend/app ./app
COPY templates /app/templates
COPY --from=frontend /app/frontend/out /app/frontend/out

ENV PATH="/app/backend/.venv/bin:$PATH"
EXPOSE 8000
# Exec form makes uvicorn PID 1, so `docker stop` shuts it down cleanly.
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
