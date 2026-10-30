# Backend Dockerfile for Fly.io deployment
FROM python:3.12-slim

WORKDIR /app

# Install dependencies first for layer caching
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy backend source code
COPY backend/ .

# Data volume mount point for SQLite database
RUN mkdir -p /data

EXPOSE 8000

ENV PYTHONUNBUFFERED=1

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
