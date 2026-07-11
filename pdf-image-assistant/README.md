# PDF Image Assistant

A complete local web app for uploading PDFs, browsing pages visually, extracting real embedded images, selecting assets, and exporting images or ZIP files.

## Stack

- Frontend: Next.js, React, TypeScript, Tailwind CSS
- Backend: Python FastAPI, PyMuPDF, Pillow, Zipfile
- Storage: local `uploads/`, `exports/`, and `temp/` folders

## Requirements

- Python 3.10 or newer
- Node.js 20 or newer
- npm

## Backend Setup

```powershell
cd pdf-image-assistant\backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

The backend runs at `http://localhost:8000`.

## Frontend Setup

Open a second terminal:

```powershell
cd pdf-image-assistant\frontend
npm install
npm run dev
```

The frontend runs at `http://localhost:3000`.

## Quick Start

1. Open `http://localhost:3000`.
2. Click **Upload PDF** or drag a `.pdf` onto the upload area.
3. Open the uploaded PDF from the dashboard.
4. Browse pages with thumbnails, page controls, zoom, rotate, fit width, full-screen, and text search.
5. Click **Extract** in the right sidebar to extract embedded images with PyMuPDF.
6. Select one or more images.
7. Open **Export**, choose original, PNG, or JPG, adjust JPG quality, and download a ZIP.

For maximum quality, choose **Original format** in the export panel. The backend copies the PDF's embedded image bytes directly whenever possible, without screenshotting, resizing, or recompressing. If a PDF stores transparency as a separate mask, the app rebuilds the image as a native-resolution PNG.

## API Endpoints

- `POST /api/upload`
- `GET /api/pdfs`
- `GET /api/pdfs/{pdf_id}`
- `DELETE /api/pdfs/{pdf_id}`
- `GET /api/pdfs/{pdf_id}/page/{page_number}/render`
- `GET /api/pdfs/{pdf_id}/thumbnails`
- `POST /api/pdfs/{pdf_id}/extract-images`
- `GET /api/pdfs/{pdf_id}/images`
- `GET /api/images/{image_id}/preview`
- `GET /api/images/{image_id}/download`
- `POST /api/export/zip`
- `GET /api/pdfs/{pdf_id}/text`

## Local Files

- Uploaded PDFs are saved in `uploads/`.
- Extracted images are saved in `exports/{pdf_id}/`.
- Metadata and temporary converted files are saved in `temp/`.

## Optional Assistant

The assistant panel works offline. It summarizes the first extractable text sentences, searches PDF text, and lists pages containing images. Paid AI keys are not required. A future AI integration can call an external model from a separate backend function after `GET /api/pdfs/{pdf_id}/text` extracts the text.

## Troubleshooting

- Backend offline: confirm `uvicorn main:app --reload --port 8000` is running.
- Frontend API errors: confirm the frontend is running on `http://localhost:3000`; requests are proxied to `http://localhost:8000`.
- Damaged PDF: PyMuPDF rejects files it cannot open.
- No images found: some PDFs contain page drawings or screenshots rather than embedded image objects.
- ZIP export failed: re-run extraction and confirm files exist under `exports/{pdf_id}/`.
- PowerShell script blocked: run `Set-ExecutionPolicy -Scope Process Bypass` for the current terminal, or use the manual commands above.

## Development Scripts

From the project root:

```powershell
.\start-backend.ps1
.\start-frontend.ps1
```

## Future Improvements

- Persist image selections per PDF.
- Add OCR for scanned documents.
- Add batch upload.
- Add optional AI summarization with a local or hosted model.
- Add image crop/resize tools before export.
