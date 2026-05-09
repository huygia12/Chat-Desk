# ChatDesk Backend Setup Script
# Run this after installing PostgreSQL and creating database

Write-Host "=== ChatDesk Backend Setup ===" -ForegroundColor Cyan

# Check if database exists
Write-Host "`n1. Checking PostgreSQL connection..." -ForegroundColor Yellow
$PGPASSWORD = "210506"
$env:PGPASSWORD = $PGPASSWORD

try {
    $result = psql -U postgres -c "\l" 2>&1
    if ($LASTEXITCODE -eq 0) {
        Write-Host "✓ PostgreSQL connected" -ForegroundColor Green
    } else {
        Write-Host "✗ Cannot connect to PostgreSQL. Make sure it's installed and running." -ForegroundColor Red
        exit 1
    }
} catch {
    Write-Host "✗ PostgreSQL not found. Please install PostgreSQL first." -ForegroundColor Red
    exit 1
}

# Create database if not exists
Write-Host "`n2. Setting up database..." -ForegroundColor Yellow
$dbExists = psql -U postgres -tAc "SELECT 1 FROM pg_database WHERE datname='chatdesk'"
if ($dbExists -eq "1") {
    Write-Host "✓ Database 'chatdesk' already exists" -ForegroundColor Green
} else {
    psql -U postgres -c "CREATE DATABASE chatdesk;"
    Write-Host "✓ Database 'chatdesk' created" -ForegroundColor Green
}

# Check Milvus Cloud
Write-Host "`n3. Checking Milvus Cloud connection..." -ForegroundColor Yellow
try {
    $milvusCheck = C:/An/Omni_channel_chatbot/.venv/Scripts/python.exe -c "from pymilvus import MilvusClient; c = MilvusClient(uri='$env:MILVUS_URI', token='$env:MILVUS_TOKEN'); print('OK')" 2>&1
    if ($milvusCheck -match "OK") {
        Write-Host "✓ Milvus Cloud connected" -ForegroundColor Green
    } else {
        Write-Host "✗ Cannot connect to Milvus Cloud. Check MILVUS_URI and MILVUS_TOKEN in .env" -ForegroundColor Red
    }
} catch {
    Write-Host "✗ Milvus Cloud check failed. Verify credentials in .env" -ForegroundColor Red
}

# Run migrations
Write-Host "`n4. Running database migrations..." -ForegroundColor Yellow
if (Test-Path "alembic/versions") {
    $versionFiles = Get-ChildItem -Path "alembic/versions" -Filter "*.py" -Exclude "__pycache__"
    if ($versionFiles.Count -gt 0) {
        Write-Host "Migration files found. Running upgrade..." -ForegroundColor Yellow
        C:/An/Omni_channel_chatbot/.venv/Scripts/python.exe -m alembic upgrade head
    } else {
        Write-Host "No migration files. Creating initial migration..." -ForegroundColor Yellow
        C:/An/Omni_channel_chatbot/.venv/Scripts/python.exe -m alembic revision --autogenerate -m "Initial migration"
        C:/An/Omni_channel_chatbot/.venv/Scripts/python.exe -m alembic upgrade head
    }
} else {
    Write-Host "Creating initial migration..." -ForegroundColor Yellow
    C:/An/Omni_channel_chatbot/.venv/Scripts/python.exe -m alembic revision --autogenerate -m "Initial migration"
    C:/An/Omni_channel_chatbot/.venv/Scripts/python.exe -m alembic upgrade head
}

Write-Host "`n✓ Database setup complete!" -ForegroundColor Green
Write-Host "`nNext steps:" -ForegroundColor Cyan
Write-Host "1. Update .env with your Facebook App credentials"
Write-Host "2. Run: C:/An/Omni_channel_chatbot/.venv/Scripts/python.exe -m uvicorn main:app --reload"
Write-Host ""
