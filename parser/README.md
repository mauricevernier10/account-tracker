# Parser Microservice

FastAPI service that parses Trade Republic PDFs into structured JSON.

## Run locally

```bash
cd parser
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload
```

Endpoints:
- `POST /parse/portfolio` — monthly portfolio snapshot PDF → holdings rows
- `POST /parse/transactions` — account statement PDF → transaction rows
- `GET  /health`

## Deploy

Can be deployed as a standalone service (Railway, Fly.io, etc.) or as a Docker container.
Set `PARSER_URL` in your Next.js environment to point to the deployed URL.
