# Multi-stage build to reduce final image size
FROM python:3.11-slim as builder

WORKDIR /app

# Install build dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Copy and install requirements
COPY requirements.railway.txt .
RUN pip install --no-cache-dir --user -r requirements.railway.txt

# Final stage - minimal image
FROM python:3.11-slim

WORKDIR /app

# Copy only installed packages from builder
COPY --from=builder /root/.local /root/.local

# Copy application code
COPY . .

# Make sure scripts are executable
ENV PATH=/root/.local/bin:$PATH
RUN chmod +x start.sh

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD python -c "import requests; requests.get('http://localhost:${PORT:-8000}/docs', timeout=5)"

# Start command - run migrations then start server
CMD ["./start.sh"]
