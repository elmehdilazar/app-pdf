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


def has_black_edge_background(image_bytes: bytes) -> bool:
    """Detect logos whose PDF-level transparency is lost by raw JPEG extraction."""
    try:
        with Image.open(io.BytesIO(image_bytes)) as image:
            rgb = image.convert("RGB")
            width, height = rgb.size
            if width < 8 or height < 8:
                return False
            step = max(1, min(width, height) // 80)
            edge_pixels = []
            for x in range(0, width, step):
                edge_pixels.extend((rgb.getpixel((x, 0)), rgb.getpixel((x, height - 1))))
            for y in range(step, height - 1, step):
                edge_pixels.extend((rgb.getpixel((0, y)), rgb.getpixel((width - 1, y))))
            dark = sum(1 for red, green, blue in edge_pixels if max(red, green, blue) <= 18)
            return bool(edge_pixels) and dark / len(edge_pixels) >= 0.8
    except Exception:
        return False


def save_displayed_image(page: fitz.Page, xref: int, width: int, height: int, output_path: Path) -> Path | None:
    """Render an image placement as the PDF displays it, including PDF-level masks."""
    rects = page.get_image_rects(xref)
    if not rects:
        return None
    rect = max(rects, key=lambda item: item.width * item.height) & page.rect
    if rect.is_empty or rect.width <= 0 or rect.height <= 0:
        return None
    zoom = max(width / rect.width, height / rect.height, 1.0)
    zoom = min(zoom, 6.0)
    pix = page.get_pixmap(matrix=fitz.Matrix(zoom, zoom), clip=rect, alpha=False, annots=False)
    rendered_path = output_path.with_suffix(".png")
    pix.save(rendered_path)
    trim_to_light_panel(rendered_path)
    return rendered_path


def trim_to_light_panel(path: Path) -> None:
    """Trim page scenery outside a light logo card while retaining its border."""
    with Image.open(path) as source:
        image = source.convert("RGB")
        width, height = image.size
        if width < 40 or height < 40:
            return

        pixels = image.load()
        sample_step = max(1, min(width, height) // 180)

        def light(red: int, green: int, blue: int) -> bool:
            return min(red, green, blue) >= 225 and max(red, green, blue) - min(red, green, blue) <= 24

        def border_gold(red: int, green: int, blue: int) -> bool:
            return 115 <= red <= 230 and red >= green + 22 and green >= blue + 18 and blue <= 135

        sampled_rows = range(0, height, sample_step)
        sampled_columns = range(0, width, sample_step)
        row_count = len(sampled_rows)
        column_count = len(sampled_columns)

        gold_columns = [
            x for x in range(width)
            if sum(1 for y in sampled_rows if border_gold(*pixels[x, y])) / row_count >= 0.55
        ]
        gold_rows = [
            y for y in range(height)
            if sum(1 for x in sampled_columns if border_gold(*pixels[x, y])) / column_count >= 0.55
        ]
        if gold_columns and gold_rows:
            left, right = min(gold_columns), max(gold_columns)
            top, bottom = min(gold_rows), max(gold_rows)
            if right - left >= width * 0.55 and bottom - top >= height * 0.55:
                crop = (left, top, right + 1, bottom + 1)
                if crop != (0, 0, width, height):
                    image.crop(crop).save(path, format="PNG")
                return

        column_scores = []
        for x in range(width):
            column_scores.append(sum(1 for y in sampled_rows if light(*pixels[x, y])) / row_count)

        row_scores = []
        for y in range(height):
            row_scores.append(sum(1 for x in sampled_columns if light(*pixels[x, y])) / column_count)

        def longest_run(scores: list[float], threshold: float) -> tuple[int, int] | None:
            best: tuple[int, int] | None = None
            start: int | None = None
            for index, score in enumerate([*scores, 0.0]):
                if score >= threshold and start is None:
                    start = index
                elif score < threshold and start is not None:
                    end = index - 1
                    if best is None or end - start > best[1] - best[0]:
                        best = (start, end)
                    start = None
            return best

        column_run = longest_run(column_scores, 0.62)
        row_run = longest_run(row_scores, 0.62)
        if column_run is None or row_run is None:
            return

        left, right = column_run
        top, bottom = row_run
        if right - left < width * 0.55 or bottom - top < height * 0.55:
            return

        border_padding = max(2, round(min(width, height) * 0.012))
        crop = (
            max(0, left - border_padding),
            max(0, top - border_padding),
            min(width, right + border_padding + 1),
            min(height, bottom + border_padding + 1),
        )
        if crop != (0, 0, width, height):
            image.crop(crop).save(path, format="PNG")


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
def extract_images(pdf_id: str, precision: str = "high") -> dict[str, Any]:
    precision = precision.lower()
    if precision not in {"low", "balanced", "high"}:
        raise HTTPException(status_code=400, detail="Precision must be low, balanced, or high.")
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
                source_width = int(base.get("width", 0))
                source_height = int(base.get("height", 0))
                image_id = uuid4().hex
                output_name = f"{Path(item['fileName']).stem}_page-{page_index + 1}_image-{image_index}.{ext}"
                output_path = export_dir / output_name

                try:
                    output_path, ext = save_embedded_image(doc, xref, smask, output_path)
                    needs_display_render = precision == "high" or (
                        precision == "balanced" and smask == 0 and ext == "jpg" and has_black_edge_background(image_bytes)
                    )
                    if needs_display_render:
                        displayed_path = save_displayed_image(page, xref, source_width, source_height, output_path)
                        if displayed_path is not None:
                            if displayed_path != output_path and output_path.exists():
                                output_path.unlink()
                            output_path = displayed_path
                            ext = "png"
                except Exception:
                    continue

                try:
                    with Image.open(output_path) as pil_image:
                        width, height = pil_image.size
                except Exception:
                    width = source_width
                    height = source_height

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
    return {"count": len(extracted), "precision": precision, "images": extracted}


@app.get("/api/pdfs/{pdf_id}/images")
def list_images(pdf_id: str) -> list[dict[str, Any]]:
    get_pdf(pdf_id)
    return [row for row in images() if row["pdfId"] == pdf_id]


@app.post("/api/pdfs/{pdf_id}/page/{page_number}/extract-selection")
async def extract_selection(pdf_id: str, page_number: int, payload: dict[str, Any]) -> dict[str, Any]:
    coordinates = [float(payload.get(key, 0)) for key in ("x", "y", "width", "height")]
    x, y, width, height = coordinates
    if x < 0 or y < 0 or width <= 0 or height <= 0 or x + width > 1.001 or y + height > 1.001:
        raise HTTPException(status_code=400, detail="Selection coordinates must be normalized values inside the page.")
    if width < 0.005 or height < 0.005:
        raise HTTPException(status_code=400, detail="The selected area is too small.")

    item = get_pdf(pdf_id)
    export_dir = EXPORTS / pdf_id
    export_dir.mkdir(parents=True, exist_ok=True)
    image_id = uuid4().hex
    output_name = f"{Path(item['fileName']).stem}_page-{page_number}_manual-{image_id[:8]}.png"
    output_path = export_dir / output_name

    with open_doc(pdf_id) as doc:
        if page_number < 1 or page_number > doc.page_count:
            raise HTTPException(status_code=404, detail="Page number is out of range.")
        page = doc.load_page(page_number - 1)
        page_rect = page.rect
        clip = fitz.Rect(
            page_rect.x0 + x * page_rect.width,
            page_rect.y0 + y * page_rect.height,
            page_rect.x0 + (x + width) * page_rect.width,
            page_rect.y0 + (y + height) * page_rect.height,
        )
        pix = page.get_pixmap(matrix=fitz.Matrix(3, 3), clip=clip, alpha=False, annots=False)
        pix.save(output_path)

    row = {
        "id": image_id,
        "pdfId": pdf_id,
        "pageNumber": page_number,
        "width": pix.width,
        "height": pix.height,
        "format": "PNG",
        "fileSize": output_path.stat().st_size,
        "path": str(output_path.relative_to(ROOT)).replace("\\", "/"),
        "fileName": output_name,
        "previewUrl": f"/api/images/{image_id}/preview",
        "manual": True,
    }
    rows = images()
    rows.append(row)
    save_images(rows)
    return row


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
