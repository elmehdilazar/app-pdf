from __future__ import annotations

import io
import json
import shutil
import zipfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from uuid import uuid4

import fitz
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse, StreamingResponse
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
UPLOADS = ROOT / "uploads"
EXPORTS = ROOT / "exports"
TEMP = ROOT / "temp"
PDF_INDEX = TEMP / "pdfs.json"
IMAGE_INDEX = TEMP / "images.json"
MAX_UPLOAD_BYTES = 250 * 1024 * 1024

for directory in (UPLOADS, EXPORTS, TEMP):
    directory.mkdir(parents=True, exist_ok=True)

app = FastAPI(title="PDF Image Assistant API", version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def load_json(path: Path, fallback: Any) -> Any:
    if not path.exists():
        return fallback
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return fallback


def save_json(path: Path, data: Any) -> None:
    path.write_text(json.dumps(data, indent=2), encoding="utf-8")


def pdfs() -> list[dict[str, Any]]:
    return load_json(PDF_INDEX, [])


def images() -> list[dict[str, Any]]:
    return load_json(IMAGE_INDEX, [])


def save_pdfs(rows: list[dict[str, Any]]) -> None:
    save_json(PDF_INDEX, rows)


def save_images(rows: list[dict[str, Any]]) -> None:
    save_json(IMAGE_INDEX, rows)


def get_pdf(pdf_id: str) -> dict[str, Any]:
    item = next((row for row in pdfs() if row["id"] == pdf_id), None)
    if not item:
        raise HTTPException(status_code=404, detail="PDF not found.")
    pdf_path = ROOT / item["path"]
    if not pdf_path.exists():
        raise HTTPException(status_code=404, detail="The uploaded PDF file is missing.")
    return item


def open_doc(pdf_id: str) -> fitz.Document:
    item = get_pdf(pdf_id)
    try:
        return fitz.open(ROOT / item["path"])
    except Exception as exc:
        raise HTTPException(status_code=422, detail="The PDF cannot be opened.") from exc


def human_format(ext: str, fallback: str = "png") -> str:
    value = (ext or fallback).lower().replace("jpeg", "jpg")
    if value in {"png", "jpg", "jpeg", "webp", "gif", "bmp", "tiff"}:
        return "jpg" if value == "jpeg" else value
    return fallback


def page_to_png(doc: fitz.Document, page_number: int, zoom: float = 1.0, rotate: int = 0) -> bytes:
    if page_number < 1 or page_number > doc.page_count:
        raise HTTPException(status_code=404, detail="Page number is out of range.")
    page = doc.load_page(page_number - 1)
    matrix = fitz.Matrix(zoom, zoom).prerotate(rotate)
    pix = page.get_pixmap(matrix=matrix, alpha=False)
    return pix.tobytes("png")


def save_embedded_image(doc: fitz.Document, xref: int, smask: int, output_path: Path) -> tuple[Path, str]:
    base = doc.extract_image(xref)
    image_bytes = base.get("image")
    ext = human_format(base.get("ext", "png"))
    if not image_bytes:
        raise ValueError("Image stream is empty.")

    # Best quality path: copy the embedded bytes exactly, with no resampling or recompression.
    if smask == 0 and ext in {"png", "jpg", "webp", "gif", "bmp", "tiff"}:
        output_path.write_bytes(image_bytes)
        return output_path, ext

    # Some PDFs store transparency as a separate soft mask. Rebuild at the native
    # embedded pixel dimensions instead of screenshotting the PDF page.
    if smask > 0:
        output_path = output_path.with_suffix(".png")
        pix = fitz.Pixmap(doc, xref)
        mask = fitz.Pixmap(doc, smask)
        try:
            pix = fitz.Pixmap(pix, mask)
            if pix.n > 4:
                pix = fitz.Pixmap(fitz.csRGB, pix)
            pix.save(output_path)
            return output_path, "png"
        finally:
            pix = None
            mask = None

    # Last resort for formats Pillow can decode but browsers may not preview well.
    output_path = output_path.with_suffix(f".{ext}")
    with Image.open(io.BytesIO(image_bytes)) as pil_image:
        if ext == "jpg":
            pil_image = pil_image.convert("RGB")
            pil_image.save(output_path, format="JPEG", quality=100, subsampling=0)
        else:
            pil_image.save(output_path)
    return output_path, ext


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/api/upload")
async def upload_pdf(file: UploadFile = File(...)) -> JSONResponse:
    if not file.filename or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Please upload a PDF file.")

    content = await file.read()
    if len(content) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="PDF is too large. The local limit is 250 MB.")

    try:
        doc = fitz.open(stream=content, filetype="pdf")
        page_count = doc.page_count
        doc.close()
    except Exception as exc:
        raise HTTPException(status_code=422, detail="This PDF is damaged or cannot be opened.") from exc

    pdf_id = uuid4().hex
    safe_name = Path(file.filename).name
    stored_name = f"{pdf_id}_{safe_name}"
    stored_path = UPLOADS / stored_name
    stored_path.write_bytes(content)

    row = {
        "id": pdf_id,
        "fileName": safe_name,
        "size": len(content),
        "uploadDate": now_iso(),
        "pages": page_count,
        "path": str(stored_path.relative_to(ROOT)).replace("\\", "/"),
    }
    rows = pdfs()
    rows.append(row)
    save_pdfs(rows)
    return JSONResponse(row, status_code=201)


@app.get("/api/pdfs")
def list_pdfs() -> list[dict[str, Any]]:
    rows = []
    for row in pdfs():
        pdf_path = ROOT / row["path"]
        rows.append({**row, "missing": not pdf_path.exists()})
    return rows


@app.get("/api/pdfs/{pdf_id}")
def pdf_metadata(pdf_id: str) -> dict[str, Any]:
    return get_pdf(pdf_id)


@app.delete("/api/pdfs/{pdf_id}")
def delete_pdf(pdf_id: str) -> dict[str, str]:
    item = get_pdf(pdf_id)
    pdf_path = ROOT / item["path"]
    if pdf_path.exists():
        pdf_path.unlink()
    export_dir = EXPORTS / pdf_id
    if export_dir.exists():
        shutil.rmtree(export_dir)
    save_pdfs([row for row in pdfs() if row["id"] != pdf_id])
    save_images([row for row in images() if row["pdfId"] != pdf_id])
    return {"status": "deleted"}


@app.get("/api/pdfs/{pdf_id}/page/{page_number}/render")
def render_page(pdf_id: str, page_number: int, zoom: float = 1.6, rotate: int = 0) -> StreamingResponse:
    with open_doc(pdf_id) as doc:
        png = page_to_png(doc, page_number, zoom=max(0.2, min(zoom, 4)), rotate=rotate)
    return StreamingResponse(io.BytesIO(png), media_type="image/png")


@app.get("/api/pdfs/{pdf_id}/thumbnails")
def thumbnails(pdf_id: str) -> list[dict[str, Any]]:
    with open_doc(pdf_id) as doc:
        return [
            {
                "pageNumber": page,
                "previewUrl": f"/api/pdfs/{pdf_id}/page/{page}/render?zoom=0.22",
            }
            for page in range(1, doc.page_count + 1)
        ]


@app.post("/api/pdfs/{pdf_id}/extract-images")
def extract_images(pdf_id: str) -> dict[str, Any]:
    item = get_pdf(pdf_id)
    export_dir = EXPORTS / pdf_id
    export_dir.mkdir(parents=True, exist_ok=True)
    existing = [row for row in images() if row["pdfId"] != pdf_id]
    extracted: list[dict[str, Any]] = []

    with open_doc(pdf_id) as doc:
        for page_index in range(doc.page_count):
            page = doc.load_page(page_index)
            for image_index, image_info in enumerate(page.get_images(full=True), start=1):
                xref = image_info[0]
                smask = int(image_info[1] or 0)
                try:
                    base = doc.extract_image(xref)
                except Exception:
                    continue
                image_bytes = base.get("image")
                if not image_bytes:
                    continue
                ext = human_format(base.get("ext", "png"))
                image_id = uuid4().hex
                output_name = f"{Path(item['fileName']).stem}_page-{page_index + 1}_image-{image_index}.{ext}"
                output_path = export_dir / output_name

                try:
                    output_path, ext = save_embedded_image(doc, xref, smask, output_path)
                except Exception:
                    continue

                try:
                    with Image.open(output_path) as pil_image:
                        width, height = pil_image.size
                except Exception:
                    width = int(base.get("width", 0))
                    height = int(base.get("height", 0))

                extracted.append(
                    {
                        "id": image_id,
                        "pdfId": pdf_id,
                        "pageNumber": page_index + 1,
                        "width": width,
                        "height": height,
                        "format": ext.upper(),
                        "fileSize": output_path.stat().st_size,
                        "path": str(output_path.relative_to(ROOT)).replace("\\", "/"),
                        "fileName": output_path.name,
                        "previewUrl": f"/api/images/{image_id}/preview",
                    }
                )

    save_images(existing + extracted)
    return {"count": len(extracted), "images": extracted}


@app.get("/api/pdfs/{pdf_id}/images")
def list_images(pdf_id: str) -> list[dict[str, Any]]:
    get_pdf(pdf_id)
    return [row for row in images() if row["pdfId"] == pdf_id]


@app.get("/api/images/{image_id}/preview")
def preview_image(image_id: str) -> FileResponse:
    item = next((row for row in images() if row["id"] == image_id), None)
    if not item:
        raise HTTPException(status_code=404, detail="Image not found.")
    path = ROOT / item["path"]
    if not path.exists():
        raise HTTPException(status_code=404, detail="Image file is missing.")
    return FileResponse(path)


@app.get("/api/images/{image_id}/download")
def download_image(image_id: str, format: str = "original", jpg_quality: int = 100) -> FileResponse:
    item = next((row for row in images() if row["id"] == image_id), None)
    if not item:
        raise HTTPException(status_code=404, detail="Image not found.")
    source = ROOT / item["path"]
    if format == "original":
        return FileResponse(source, filename=item["fileName"])
    converted = convert_image(source, human_format(format), jpg_quality)
    return FileResponse(converted, filename=converted.name)


def convert_image(source: Path, target_format: str, jpg_quality: int = 100) -> Path:
    target_format = human_format(target_format)
    target = TEMP / f"{source.stem}_{uuid4().hex[:8]}.{target_format}"
    with Image.open(source) as image:
        if target_format == "jpg":
            image = image.convert("RGB")
            image.save(target, format="JPEG", quality=max(60, min(jpg_quality, 100)), optimize=True, subsampling=0)
        else:
            image.save(target, format=target_format.upper())
    return target


@app.post("/api/export/zip")
async def export_zip(payload: dict[str, Any]) -> FileResponse:
    image_ids: list[str] = payload.get("imageIds", [])
    export_format = payload.get("format", "original")
    jpg_quality = int(payload.get("jpgQuality", 100))
    auto_rename = bool(payload.get("autoRename", True))
    if not image_ids:
        raise HTTPException(status_code=400, detail="Select at least one image to export.")

    by_id = {row["id"]: row for row in images()}
    selected = [by_id[image_id] for image_id in image_ids if image_id in by_id]
    if not selected:
        raise HTTPException(status_code=404, detail="No selected images were found.")

    zip_path = TEMP / f"pdf-image-export-{uuid4().hex[:10]}.zip"
    with zipfile.ZipFile(zip_path, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        for index, row in enumerate(selected, start=1):
            source = ROOT / row["path"]
            if not source.exists():
                continue
            file_to_add = source if export_format == "original" else convert_image(source, export_format, jpg_quality)
            pdf = next((pdf for pdf in pdfs() if pdf["id"] == row["pdfId"]), None)
            stem = Path(pdf["fileName"]).stem if pdf else "pdf"
            suffix = file_to_add.suffix
            arcname = f"{stem}_page-{row['pageNumber']}_image-{index}{suffix}" if auto_rename else file_to_add.name
            archive.write(file_to_add, arcname)

    if zip_path.stat().st_size == 0:
        raise HTTPException(status_code=500, detail="ZIP export failed because no files could be added.")
    return FileResponse(zip_path, filename="pdf-image-assistant-export.zip", media_type="application/zip")


@app.get("/api/pdfs/{pdf_id}/text")
def extract_text(pdf_id: str) -> dict[str, Any]:
    with open_doc(pdf_id) as doc:
        pages = [{"pageNumber": index + 1, "text": doc.load_page(index).get_text("text")} for index in range(doc.page_count)]
    return {"pdfId": pdf_id, "pages": pages, "text": "\n\n".join(page["text"] for page in pages)}
