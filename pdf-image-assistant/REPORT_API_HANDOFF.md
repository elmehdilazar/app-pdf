# API Handoff Report — PDF Image Assistant

This document describes the API as implemented in `backend/main.py`. It is intended to let another developer continue work without changing assumptions used by the frontend.

## Architecture and runtime

- Backend: FastAPI (`backend/main.py`), expected at `http://localhost:8000`.
- Frontend: Next.js (`frontend/`), expected at `http://localhost:3000`.
- Proxy: `frontend/next.config.ts` rewrites `/api/:path*` to `http://localhost:8000/api/:path*`.
- API documentation while the backend is running: `/docs` and `/openapi.json`.
- Authentication: none.
- CORS: allows `http://localhost:3000` and `http://127.0.0.1:3000`, with credentials and all methods/headers enabled.

## Storage

All paths below are relative to the **project root**, not `backend/`:

- Uploaded PDFs: `uploads/`
- Extracted images: `exports/{pdf_id}/`
- PDF metadata: `temp/pdfs.json`
- Image metadata: `temp/images.json`
- Temporary image conversions and ZIP files: `temp/`

The indices are JSON arrays. `save_json()` currently writes them directly with `Path.write_text`; writes are **not atomic and not protected by a lock**. Concurrent mutations can lose updates or expose a partially written file. Invalid JSON is silently treated as an empty index.

## Data shapes

### PDF metadata

```json
{
  "id": "32-character UUID hex string",
  "fileName": "source.pdf",
  "size": 12345,
  "uploadDate": "UTC ISO-8601 timestamp",
  "pages": 4,
  "path": "uploads/<id>_source.pdf"
}
```

`GET /api/pdfs` adds a boolean `missing` property to each returned item. The single-item endpoint does not.

### Extracted image metadata

```json
{
  "id": "32-character UUID hex string",
  "pdfId": "parent PDF id",
  "pageNumber": 1,
  "width": 1920,
  "height": 1080,
  "format": "JPG",
  "fileSize": 12345,
  "path": "exports/<pdfId>/<filename>",
  "fileName": "source_page-1_image-1.jpg",
  "previewUrl": "/api/images/<imageId>/preview"
}
```

## Endpoints

### Health

- `GET /api/health`
- Response: `{"status":"ok"}`.

### Upload and PDF management

- `POST /api/upload`
  - Multipart field: `file`.
  - Requires a filename ending in `.pdf` and a document PyMuPDF can open.
  - Maximum size: 250 MiB (`250 * 1024 * 1024` bytes). The full upload is read into memory before the limit is checked.
  - Stores the file as `uploads/{pdf_id}_{safe_original_name}`.
  - Returns PDF metadata with status `201`.
  - Errors: `400` wrong extension, `413` over limit, `422` unreadable/damaged PDF.

- `GET /api/pdfs`
  - Returns the PDF metadata array, with `missing` calculated from the filesystem.

- `GET /api/pdfs/{pdf_id}`
  - Returns PDF metadata.
  - Returns `404` if either metadata or the uploaded file is missing.

- `DELETE /api/pdfs/{pdf_id}`
  - Deletes the uploaded PDF, `exports/{pdf_id}/`, and matching records in both indices.
  - Returns `{"status":"deleted"}`.
  - If the uploaded PDF is already missing, the initial lookup returns `404` and cleanup does not proceed.

### Page rendering and thumbnails

- `GET /api/pdfs/{pdf_id}/page/{page_number}/render`
  - Returns `image/png` bytes. Page numbers are one-based.
  - Query parameters: `zoom` (default `1.6`, clamped to `0.2`–`4`) and `rotate` (integer degrees, default `0`).
  - Out-of-range pages return `404`.

- `GET /api/pdfs/{pdf_id}/thumbnails`
  - Returns one item per page: `{"pageNumber":1,"previewUrl":"...render?zoom=0.22"}`.
  - This endpoint returns URLs; it does not render or bundle image data.

### Extraction and image access

- `POST /api/pdfs/{pdf_id}/extract-images`
  - Uses `page.get_images(full=True)` and `doc.extract_image(xref)`.
  - Preserves supported embedded bytes when no soft mask exists. Soft-mask images are rebuilt as native-resolution PNGs. Pillow is the fallback writer.
  - Returns `{"count": <number>, "images": [...]}`.
  - Re-extraction replaces image metadata for the PDF, but it does not first clear old files from its export directory. Old unreferenced files may remain.
  - Filenames are based on PDF stem, page number, and page-local image index. Re-extraction can overwrite files with the same names.
  - The metadata does not currently include the original xref or MIME type.

- `GET /api/pdfs/{pdf_id}/images`
  - Verifies that the parent PDF and its uploaded file exist, then returns its image metadata array.

- `GET /api/images/{image_id}/preview`
  - Serves the extracted file with `FileResponse`.
  - Returns `404` for missing metadata or a missing file.

- `GET /api/images/{image_id}/download`
  - Query parameters: `format` (default `original`) and `jpg_quality` (default `100`).
  - `original` serves the stored file with its filename.
  - Other formats create a temporary conversion. Supported normalized formats are PNG, JPG, WEBP, GIF, BMP, and TIFF; an unknown format falls back to PNG.
  - JPG quality is clamped to `60`–`100`.

### ZIP export

- `POST /api/export/zip`
  - JSON body:

    ```json
    {
      "imageIds": ["image id"],
      "format": "original",
      "jpgQuality": 100,
      "autoRename": true
    }
    ```

  - `format` may be `original` or a conversion format supported above.
  - With `autoRename: true`, archive entries use `{pdf_stem}_page-{page}_image-{selection_index}.{ext}`.
  - Unknown image IDs are ignored if at least one valid ID remains. Missing source files are skipped.
  - Returns a ZIP `FileResponse` named `pdf-image-assistant-export.zip`.
  - Errors: `400` empty selection, `404` no selected IDs found, `500` no files added.

### Text extraction

- `GET /api/pdfs/{pdf_id}/text`
  - Uses PyMuPDF text extraction; OCR is not implemented.
  - Returns `pdfId`, a `pages` array of `{pageNumber, text}`, and all page text joined with blank lines in `text`.

## Development commands

Backend:

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
python -m uvicorn main:app --reload --port 8000
```

Frontend (second terminal):

```powershell
cd frontend
npm install
npm run dev
```

The project-root scripts `start-backend.ps1` and `start-frontend.ps1` provide shortcuts.

## Compatibility rules

- Keep routes and camelCase response fields stable unless `frontend/lib/api.ts`, `frontend/lib/types.ts`, and consumers are updated together.
- Keep the backend on port 8000 unless the Next.js rewrite is updated at the same time.
- Preserve root-relative stored paths or provide a migration for existing JSON records and files.
- Keep extracted filenames collision-safe within each PDF. If extraction behavior changes, account for existing export files.
- Do not commit uploaded documents, exports, temporary files, secrets, or machine-specific paths.
- After backend changes, smoke-test upload → render/thumbnails → extract → preview/download → ZIP export → delete.

## Known risks and suggested next work

1. Make JSON writes atomic and add process-safe locking around read-modify-write operations.
2. Add an integration test covering upload, extraction, conversion/ZIP export, and deletion.
3. Stream uploads or enforce the size limit while reading to avoid holding up to 250 MiB per request in memory.
4. Clean stale extraction files and temporary conversions/ZIPs.
5. Validate export payloads with Pydantic models and constrain formats explicitly.
6. Add authentication and stricter production CORS/file-handling policies before exposing the service beyond local development.
7. Consider OCR separately for scanned PDFs; embedded-image extraction and text extraction do not cover vector-only or image-only content.
