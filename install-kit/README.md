# Install kit — local tender response tool (free)

You own the tool. It runs on **your** machines. By default, documents never leave your network.

## What you get
- Local web UI + workers for parsing tenders and drafting review-ready packs
- **Local AI by default** via [Ollama](https://ollama.com) (Mistral / Qwen recommended)
- Optional EU-hosted API using **your** provider key (zero retention where the provider supports it)
- Connectors: Google Drive, SharePoint / OneDrive (phase 1)
- Tender alerts from public procurement portals (phase 2)

## Pricing model
- **Install kit: free**
- **One-time setup fee** (onboarding, templates, connectors) — price on request
- **Optional low-cost monthly maintenance** — price on request
- **No subscription lock-in** for the core local tool

## Quick start (outline)
```bash
# 1) Install Ollama and pull a model
ollama pull mistral
# or: ollama pull qwen2.5

# 2) Run the local stack (Docker Compose shipped with your setup package)
docker compose up

# 3) Open http://localhost:8787
```

Full production install guides are delivered with the paid setup. This folder is the public outline.

## Data stays yours
- Local mode: inference on your hardware
- Optional cloud: your API key, your retention settings
- Delete / export anytime
