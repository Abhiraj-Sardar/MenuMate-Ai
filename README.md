# MenuMate AI — Local-First Menu Translator

A local-first restaurant menu translation MVP built with React, Tailwind CSS, FastAPI, SQLite, OCR/PDF text extraction, and Ollama.

## Features
- Add menu items manually.
- Upload images (PNG/JPG/JPEG) and PDFs to extract text locally.
- Translate menu items with a local Ollama model.
- Store menus and translations in SQLite.
- Edit source text and translations before use.
- No cloud AI API calls. The app binds to localhost.

## Requirements
- Python 3.10+
- Node.js 20+
- Tesseract OCR installed and available on PATH for image OCR.
- Ollama installed and running locally.
- A compatible model downloaded in Ollama.

Example model setup:
```bash
ollama pull qwen2.5:3b
```
You can use another Ollama model by setting `OLLAMA_MODEL` in `backend/.env`.

## Start the backend

```bash
cd backend
python -m venv .venv
```

Windows PowerShell:
```powershell
.venv\Scripts\Activate.ps1
```

macOS/Linux:
```bash
source .venv/bin/activate
```

Install and run:
```bash
pip install -r requirements.txt
copy .env.example .env
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```
On macOS/Linux, use `cp .env.example .env` instead of `copy`.

API docs: http://127.0.0.1:8000/docs

## Start the frontend

Open a second terminal:
```bash
cd frontend
npm install
npm run dev
```

Open http://127.0.0.1:5173

## Local privacy notes
- Ollama requests go to `http://127.0.0.1:11434` by default.
- The API server binds to `127.0.0.1`; do not expose it publicly.
- SQLite database and uploaded files are stored in `backend/data/`.
- Local processing does not automatically mean encrypted storage. Use a device account/password and disk encryption for sensitive business data.
- OCR and AI extraction can be inaccurate. Review every item before publishing, especially ingredients and allergen information.
- The app never makes medical/allergen safety claims. Allergen details should be supplied and verified by the restaurant.

## Troubleshooting
- `TesseractNotFoundError`: install Tesseract and ensure `tesseract` is on PATH.
- PDF has no extracted text: this starter handles text-based PDFs; scanned PDFs should be converted to images and OCR'd in a future enhancement.
- Ollama unavailable: start the Ollama application/service and verify `ollama list`.
- Model not found: run `ollama pull qwen2.5:3b` or update `OLLAMA_MODEL`.

## Current MVP limitations
- Upload extraction returns editable draft text, not guaranteed structured menu items.
- Image OCR and PDF extraction are local.
- Translation quality depends on the chosen model and prompt; restaurant review is required.
