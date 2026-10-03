import json
import logging
from pathlib import Path

from config import IMAGE_EXTS, MEDIA_DIR, PLATFORM_DISPLAY, PLATFORM_NORMALIZE, VIDEO_EXTS
from db import (
    add_material_tag,
    assign_fixed_tags,
    delete_personal_upload,
    get_conn,
    get_type_tag_ids,
    insert_material,
    insert_personal_upload,
    insert_work,
    reset_db,
    upsert_author,
)

logger = logging.getLogger("mylike.rebuilder")

PERSONAL_UPLOADS_DIR = "personal_uploads"


def _scan_media_files(work_dir):
    files = []
    for entry in sorted(work_dir.iterdir()):
        if entry.name == "metadata.json":
            continue
        if entry.name == ".thumbs":
            continue
        if not entry.is_file():
            continue
        ext = entry.suffix.lower()
        if ext in IMAGE_EXTS:
            files.append((entry.name, "image"))
        elif ext in VIDEO_EXTS:
            files.append((entry.name, "video"))
    return files


def _get_original_url(data):
    return data.get("original_url", "")


def _create_work_from_dir(work_dir, data):
    raw_platform = data.get("platform", "")
    platform = PLATFORM_NORMALIZE.get(raw_platform, "unknown")

    title = data.get("title") or data.get("desc") or work_dir.name

    author = data.get("author") or {}
    author_id_str = str(author.get("author_id", "unknown"))
    author_name = author.get("nickname") or author.get("name") or "未知"
    avatar_url = author.get("avatar")

    author_db_id = upsert_author(author_id_str, author_name, platform, avatar_url)

    original_url = _get_original_url(data)
    video_id = str(data.get("video_id")) if data.get("video_id") else None

    work_id = insert_work(
        title=title,
        platform=platform,
        author_id=author_db_id,
        original_url=original_url,
        media_dir=work_dir.name,
        video_id=video_id,
        status="success",
    )

    material_type_pairs = []
    for sort_order, (filename, mtype) in enumerate(_scan_media_files(work_dir)):
        mat_id = insert_material(
            work_id=work_id,
            mtype=mtype,
            filename=filename,
            original_url="",
            sort_order=sort_order,
        )
        material_type_pairs.append((mat_id, mtype))

    assign_fixed_tags(
        work_id,
        PLATFORM_DISPLAY.get(platform, platform),
        author_name,
        material_type_pairs,
    )
    logger.debug("Created work %s from %s", work_id, work_dir.name)
    return work_id


def _sync_work_materials(work_id, work_dir):
    conn = get_conn()
    db_mats = {}
    for row in conn.execute("SELECT id, filename FROM materials WHERE work_id=?", (work_id,)).fetchall():
        db_mats[row["filename"]] = row["id"]

    type_tag_image_id, type_tag_video_id = get_type_tag_ids()

    actual_files = set()
    for filename, mtype in _scan_media_files(work_dir):
        actual_files.add(filename)
        if filename not in db_mats:
            sort_order = len(db_mats)
            mat_id = insert_material(
                work_id=work_id,
                mtype=mtype,
                filename=filename,
                original_url="",
                sort_order=sort_order,
            )
            add_material_tag(mat_id, type_tag_image_id if mtype == "image" else type_tag_video_id)
            db_mats[filename] = mat_id

    for filename, mat_id in db_mats.items():
        if filename not in actual_files:
            conn.execute("DELETE FROM materials WHERE id=?", (mat_id,))
    conn.commit()


def _sync_personal_uploads():
    """同步 personal_uploads 目录：文件新增则入库，文件缺失则清记录。"""
    upload_dir = MEDIA_DIR / PERSONAL_UPLOADS_DIR
    if not upload_dir.exists():
        return {"added": 0, "removed": 0}

    conn = get_conn()
    db_uploads = {}
    for row in conn.execute("SELECT id, filename FROM personal_uploads").fetchall():
        db_uploads[row["filename"]] = row["id"]

    actual_files = set()
    added = 0
    for entry in sorted(upload_dir.iterdir()):
        if not entry.is_file():
            continue
        if entry.name.startswith("."):
            continue
        ext = entry.suffix.lower()
        if ext not in IMAGE_EXTS and ext not in VIDEO_EXTS:
            continue
        actual_files.add(entry.name)
        if entry.name not in db_uploads:
            mtype = "image" if ext in IMAGE_EXTS else "video"
            file_size = entry.stat().st_size
            insert_personal_upload(entry.name, entry.name, mtype, file_size)
            added += 1

    removed = 0
    for filename, upload_id in db_uploads.items():
        if filename not in actual_files:
            delete_personal_upload(upload_id)
            removed += 1

    logger.info("Personal uploads sync: %d added, %d removed", added, removed)
    return {"added": added, "removed": removed}


def sync_database():
    if not MEDIA_DIR.exists():
        return {"added": 0, "removed": 0, "updated": 0, "errors": []}

    conn = get_conn()
    db_works = {}
    for row in conn.execute("SELECT id, media_dir FROM works").fetchall():
        db_works[row["media_dir"]] = row["id"]

    media_dirs = set()
    added = 0
    updated = 0
    errors = []

    for entry in sorted(MEDIA_DIR.iterdir()):
        if not entry.is_dir():
            continue
        if entry.name == PERSONAL_UPLOADS_DIR:
            continue
        meta_path = entry / "metadata.json"
        if not meta_path.exists():
            continue

        media_dirs.add(entry.name)

        try:
            with open(meta_path, "r", encoding="utf-8") as f:
                data = json.load(f)

            if entry.name in db_works:
                work_id = db_works[entry.name]
                _sync_work_materials(work_id, entry)
                updated += 1
            else:
                _create_work_from_dir(entry, data)
                added += 1
        except Exception as e:
            errors.append(f"{entry.name}: {str(e)}")
            logger.error("Sync error for %s: %s", entry.name, e, exc_info=True)

    removed = 0
    for media_dir, work_id in db_works.items():
        if media_dir not in media_dirs:
            conn.execute("DELETE FROM works WHERE id=?", (work_id,))
            removed += 1
    conn.commit()

    upload_result = _sync_personal_uploads()

    logger.info(
        "Sync complete: %d added, %d updated, %d removed, %d errors, uploads: %d added, %d removed",
        added, updated, removed, len(errors), upload_result["added"], upload_result["removed"],
    )
    return {
        "added": added,
        "removed": removed,
        "updated": updated,
        "errors": errors,
        "personal_uploads": upload_result,
    }


def rebuild_database():
    reset_db()

    if not MEDIA_DIR.exists():
        return {"rebuilt": 0, "errors": [], "personal_uploads": {"rebuilt": 0}}

    count = 0
    errors = []

    for entry in sorted(MEDIA_DIR.iterdir()):
        if not entry.is_dir():
            continue
        if entry.name == PERSONAL_UPLOADS_DIR:
            continue
        meta_path = entry / "metadata.json"
        if not meta_path.exists():
            continue

        try:
            with open(meta_path, "r", encoding="utf-8") as f:
                data = json.load(f)
            _create_work_from_dir(entry, data)
            count += 1
        except Exception as e:
            errors.append(f"{entry.name}: {str(e)}")
            logger.error("Rebuild error for %s: %s", entry.name, e, exc_info=True)

    upload_result = _sync_personal_uploads()

    logger.info(
        "Rebuild complete: %d works, %d errors, uploads: %d added",
        count, len(errors), upload_result["added"],
    )
    return {
        "rebuilt": count,
        "errors": errors,
        "personal_uploads": {"rebuilt": upload_result["added"]},
    }
