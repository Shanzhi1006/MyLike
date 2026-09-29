import json
import logging
import shutil
import uuid
from datetime import datetime
from pathlib import Path

from flask import Blueprint, jsonify, request
from PIL import Image as PILImage

from config import IMAGE_EXTS, MEDIA_DIR, PLATFORM_DISPLAY, VIDEO_EXTS
from db import (add_material_tag, add_work_tag, assign_fixed_tags, batch_add_material_tags, batch_add_work_tags,
                delete_material, delete_personal_upload, delete_personal_uploads, delete_work,
                get_all_materials, get_all_personal_uploads, get_all_works, get_captures, get_conn,
                get_material_effective_tags, get_personal_upload, get_type_tag_ids, get_work_tags,
                insert_material, insert_personal_upload, insert_work, remove_material_tag, remove_work_tag,
                reorder_materials, sync_material_tags, sync_work_tags, upsert_author)
from helpers import media_url, parse_tag_filter, thumb_url
from thumbnails import generate_all_thumbnails, regenerate_thumbnail

logger = logging.getLogger("mylike.library_api")


bp = Blueprint("library_api", __name__, url_prefix="/api")


@bp.route("/works")
def api_works():
    tag_filter = parse_tag_filter()
    sort_order = request.args.get("sort_order", "desc")
    page = max(1, request.args.get("page", 1, type=int))
    per_page = max(1, request.args.get("per_page", 20, type=int))
    works, total = get_all_works(tag_filter, sort_order=sort_order, page=page, per_page=per_page)
    result = []
    for w in works:
        materials = []
        for m in w["materials"]:
            materials.append(
                {
                    "id": m["id"],
                    "type": m["type"],
                    "filename": m["filename"],
                    "url": media_url(w["media_dir"], m["filename"]),
                    "thumb_url": thumb_url(w["media_dir"], m["filename"]) if m["type"] in ("image", "video") else None,
                    "medium_url": (
                        thumb_url(w["media_dir"], m["filename"], "medium") if m["type"] in ("image", "video") else None
                    ),
                    "sort_order": m["sort_order"],
                }
            )
        result.append(
            {
                "id": w["id"],
                "title": w["title"],
                "platform": w["platform"],
                "platform_display": PLATFORM_DISPLAY.get(w["platform"], w["platform"]),
                "author_name": w.get("author_name", "未知"),
                "original_url": w.get("original_url", ""),
                "media_dir": w["media_dir"],
                "status": w["status"],
                "materials": materials,
                "tags": w["tags"],
                "created_at": w["created_at"],
            }
        )
    return jsonify({"works": result, "total": total, "page": page, "per_page": per_page})


@bp.route("/works/<int:work_id>", methods=["DELETE"])
def api_delete_work(work_id):
    try:
        delete_work(work_id)
        return jsonify({"success": True})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@bp.route("/works/<int:work_id>/title", methods=["PUT"])
def api_update_work_title(work_id):
    body = request.get_json(force=True)
    title = (body.get("title") or "").strip()
    if not title:
        return jsonify({"error": "标题不能为空"}), 400
    conn = get_conn()
    row = conn.execute("SELECT id FROM works WHERE id = ?", (work_id,)).fetchone()
    if not row:
        return jsonify({"error": "作品不存在"}), 404
    conn.execute("UPDATE works SET title = ? WHERE id = ?", (title, work_id))
    conn.commit()
    return jsonify({"success": True, "title": title})


@bp.route("/works/<int:work_id>/tags", methods=["GET", "POST"])
def api_work_tags(work_id):
    if request.method == "GET":
        return jsonify({"tags": get_work_tags(work_id)})
    body = request.get_json(force=True)
    tag_ids = body.get("tag_ids", [])
    if body.get("sync"):
        sync_work_tags(work_id, tag_ids)
    else:
        for tid in tag_ids:
            add_work_tag(work_id, tid)
    return jsonify({"success": True, "tags": get_work_tags(work_id)})


@bp.route("/works/<int:work_id>/tags/<int:tag_id>", methods=["DELETE"])
def api_remove_work_tag(work_id, tag_id):
    remove_work_tag(work_id, tag_id)
    return jsonify({"success": True, "tags": get_work_tags(work_id)})


@bp.route("/materials")
def api_materials():
    tag_filter = parse_tag_filter()
    sort_order = request.args.get("sort_order", "desc")
    page = max(1, request.args.get("page", 1, type=int))
    per_page = request.args.get("per_page", 10, type=int)
    if per_page is None:
        per_page = 10
    materials, total = get_all_materials(tag_filter, sort_order=sort_order, page=page, per_page=per_page)
    result = []
    for m in materials:
        result.append(
            {
                "id": m["id"],
                "work_id": m["work_id"],
                "work_title": m["work_title"],
                "type": m["type"],
                "filename": m["filename"],
                "url": media_url(m["media_dir"], m["filename"]),
                "thumb_url": thumb_url(m["media_dir"], m["filename"]) if m["type"] in ("image", "video") else None,
                "medium_url": (
                    thumb_url(m["media_dir"], m["filename"], "medium") if m["type"] in ("image", "video") else None
                ),
                "platform": m["platform"],
                "platform_display": PLATFORM_DISPLAY.get(m["platform"], m["platform"]),
                "author_name": m.get("author_name", "未知"),
                "tags": m["tags"],
                "sort_order": m["sort_order"],
            }
        )
    return jsonify({"materials": result, "total": total, "page": page, "per_page": per_page})


@bp.route("/materials/<int:material_id>", methods=["DELETE"])
def api_delete_material(material_id):
    try:
        delete_material(material_id)
        return jsonify({"success": True})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@bp.route("/materials/<int:material_id>/rotate", methods=["POST"])
def api_rotate_material(material_id):
    body = request.get_json(force=True)
    direction = body.get("direction", "cw")
    if direction not in ("cw", "ccw"):
        return jsonify({"error": "direction 必须是 cw 或 ccw"}), 400

    conn = get_conn()
    mat = conn.execute(
        "SELECT m.filename, m.type, w.media_dir FROM materials m JOIN works w ON m.work_id = w.id WHERE m.id = ?",
        (material_id,),
    ).fetchone()
    if not mat:
        return jsonify({"error": "素材不存在"}), 404
    if mat["type"] != "image":
        return jsonify({"error": "仅支持图片旋转"}), 400

    file_path = MEDIA_DIR / mat["media_dir"] / mat["filename"]
    safe_base = MEDIA_DIR.resolve()
    try:
        file_path.resolve().relative_to(safe_base)
    except ValueError:
        return jsonify({"error": "路径非法"}), 403

    if not file_path.exists():
        return jsonify({"error": "文件不存在"}), 404

    try:
        img = PILImage.open(file_path)
        angle = -90 if direction == "cw" else 90
        rotated = img.rotate(angle, expand=True)

        ext = file_path.suffix.lower()
        if ext in (".jpg", ".jpeg"):
            if rotated.mode in ("RGBA", "P"):
                rotated = rotated.convert("RGB")
            rotated.save(file_path, "JPEG", quality=95)
        elif ext == ".png":
            rotated.save(file_path, "PNG")
        elif ext == ".webp":
            rotated.save(file_path, "WEBP", quality=95)
        elif ext == ".bmp":
            if rotated.mode in ("RGBA", "P"):
                rotated = rotated.convert("RGB")
            rotated.save(file_path, "BMP")
        elif ext == ".gif":
            rotated.save(file_path, "GIF")
        else:
            rotated.save(file_path)

        new_url = media_url(mat["media_dir"], mat["filename"]) + "?t=" + str(int(datetime.now().timestamp()))
        new_thumb_url = thumb_url(mat["media_dir"], mat["filename"]) + "?t=" + str(int(datetime.now().timestamp()))

        for level in ("thumb", "medium"):
            regenerate_thumbnail(file_path, level)

        return jsonify({"success": True, "url": new_url, "thumb_url": new_thumb_url})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@bp.route("/materials/<int:material_id>/capture-frame", methods=["POST"])
def api_capture_frame(material_id):
    import uuid

    conn = get_conn()
    mat = conn.execute(
        "SELECT m.work_id, w.media_dir FROM materials m JOIN works w ON m.work_id = w.id WHERE m.id = ?",
        (material_id,),
    ).fetchone()
    if not mat:
        return jsonify({"error": "素材不存在"}), 404

    if "frame" not in request.files:
        return jsonify({"error": "未收到图片数据"}), 400

    file = request.files["frame"]
    ext = ".jpg"
    short_ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    short_rand = uuid.uuid4().hex[:8]
    filename = f"capture_{short_ts}_{short_rand}{ext}"

    work_media_dir = MEDIA_DIR / mat["media_dir"]
    safe_base = MEDIA_DIR.resolve()
    try:
        work_media_dir.resolve().relative_to(safe_base)
    except ValueError:
        return jsonify({"error": "路径非法"}), 403

    work_media_dir.mkdir(parents=True, exist_ok=True)
    file_path = work_media_dir / filename
    file.save(str(file_path))

    max_order_row = conn.execute(
        "SELECT MAX(sort_order) as max_order FROM materials WHERE work_id = ?",
        (mat["work_id"],),
    ).fetchone()
    sort_order = (max_order_row["max_order"] or 0) + 1

    video_offset = request.form.get("video_offset")
    try:
        video_offset = float(video_offset) if video_offset is not None else None
    except (ValueError, TypeError):
        video_offset = None

    new_id = insert_material(
        mat["work_id"],
        "image",
        filename,
        sort_order=sort_order,
        source_material_id=material_id,
        video_offset=video_offset,
    )

    type_tag_image_id, _ = get_type_tag_ids()
    add_material_tag(new_id, type_tag_image_id)

    new_row = conn.execute("SELECT created_at, video_offset FROM materials WHERE id=?", (new_id,)).fetchone()

    return jsonify(
        {
            "success": True,
            "material": {
                "id": new_id,
                "type": "image",
                "filename": filename,
                "url": media_url(mat["media_dir"], filename) + "?t=" + str(int(datetime.now().timestamp())),
                "thumb_url": thumb_url(mat["media_dir"], filename),
                "source_material_id": material_id,
                "created_at": new_row["created_at"] if new_row else datetime.now().isoformat(),
                "video_offset": new_row["video_offset"] if new_row else video_offset,
            },
        }
    )


@bp.route("/materials/<int:material_id>/captures", methods=["GET"])
def api_get_captures(material_id):
    captures = get_captures(material_id)
    result = []
    for c in captures:
        result.append(
            {
                "id": c["id"],
                "type": c["type"],
                "filename": c["filename"],
                "url": media_url(c["media_dir"], c["filename"]),
                "thumb_url": thumb_url(c["media_dir"], c["filename"]) if c["type"] == "image" else None,
                "created_at": c["created_at"],
                "video_offset": c.get("video_offset"),
            }
        )
    return jsonify({"captures": result})


@bp.route("/materials/<int:material_id>/tags", methods=["GET", "POST"])
def api_material_tags(material_id):
    if request.method == "GET":
        return jsonify({"tags": get_material_effective_tags(material_id)})
    body = request.get_json(force=True)
    tag_ids = body.get("tag_ids", [])
    if body.get("sync"):
        sync_material_tags(material_id, tag_ids)
    else:
        for tid in tag_ids:
            add_material_tag(material_id, tid)
    return jsonify({"success": True, "tags": get_material_effective_tags(material_id)})


@bp.route("/materials/<int:material_id>/tags/<int:tag_id>", methods=["DELETE"])
def api_remove_material_tag(material_id, tag_id):
    remove_material_tag(material_id, tag_id)
    return jsonify({"success": True, "tags": get_material_effective_tags(material_id)})


@bp.route("/works/batch/tags", methods=["POST"])
def api_batch_add_work_tags():
    body = request.get_json(force=True)
    work_ids = body.get("work_ids", [])
    tag_ids = body.get("tag_ids", [])
    batch_add_work_tags(work_ids, tag_ids)
    return jsonify({"success": True})


@bp.route("/materials/batch/tags", methods=["POST"])
def api_batch_add_material_tags():
    body = request.get_json(force=True)
    material_ids = body.get("material_ids", [])
    tag_ids = body.get("tag_ids", [])
    batch_add_material_tags(material_ids, tag_ids)
    return jsonify({"success": True})


@bp.route("/works/batch/delete", methods=["POST"])
def api_batch_delete_works():
    body = request.get_json(force=True)
    work_ids = body.get("work_ids", [])
    for wid in work_ids:
        try:
            delete_work(wid)
        except Exception as e:
            logger.warning("批量删除作品 %s 失败: %s", wid, e)
    return jsonify({"success": True})


@bp.route("/materials/batch/delete", methods=["POST"])
def api_batch_delete_materials():
    body = request.get_json(force=True)
    material_ids = body.get("material_ids", [])
    for mid in material_ids:
        try:
            delete_material(mid)
        except Exception as e:
            logger.warning("批量删除素材 %s 失败: %s", mid, e)
    return jsonify({"success": True})


@bp.route("/works/<int:work_id>/materials/reorder", methods=["POST"])
def api_reorder_materials(work_id):
    body = request.get_json(force=True)
    material_ids = body.get("material_ids", [])
    if not material_ids:
        return jsonify({"error": "material_ids 不能为空"}), 400
    reorder_materials(work_id, material_ids)
    return jsonify({"success": True})


@bp.route("/personal-uploads/upload", methods=["POST"])
def api_upload_personal():
    files = request.files.getlist("files")
    if not files:
        return jsonify({"error": "未收到文件"}), 400

    upload_dir = MEDIA_DIR / "personal_uploads"
    upload_dir.mkdir(parents=True, exist_ok=True)

    batch_id = datetime.now().isoformat()

    results = []
    for file in files:
        if not file or not file.filename:
            continue
        original_filename = Path(file.filename).name
        ext = Path(original_filename).suffix.lower()
        if ext not in IMAGE_EXTS and ext not in VIDEO_EXTS:
            continue
        mtype = "image" if ext in IMAGE_EXTS else "video"

        ts = datetime.now().strftime("%Y%m%d_%H%M%S")
        uid = uuid.uuid4().hex[:8]
        filename = f"upload_{ts}_{uid}{ext}"

        file_path = upload_dir / filename
        file.save(str(file_path))
        file_size = file_path.stat().st_size

        generate_all_thumbnails(file_path)

        upload_id = insert_personal_upload(filename, original_filename, mtype, file_size, batch_id)

        results.append({
            "id": upload_id,
            "filename": filename,
            "original_filename": original_filename,
            "type": mtype,
            "url": media_url("personal_uploads", filename),
            "thumb_url": thumb_url("personal_uploads", filename) if mtype in ("image", "video") else None,
        })

    return jsonify({"uploads": results})


@bp.route("/personal-uploads")
def api_personal_uploads():
    uploads = get_all_personal_uploads()
    result = []
    for u in uploads:
        result.append({
            "id": u["id"],
            "filename": u["filename"],
            "original_filename": u["original_filename"],
            "type": u["type"],
            "file_size": u["file_size"],
            "url": media_url("personal_uploads", u["filename"]),
            "thumb_url": thumb_url("personal_uploads", u["filename"]) if u["type"] in ("image", "video") else None,
            "created_at": u["created_at"],
        })
    return jsonify({"uploads": result})


@bp.route("/personal-uploads/<int:upload_id>", methods=["DELETE"])
def api_delete_personal_upload(upload_id):
    try:
        upload = get_personal_upload(upload_id)
        if not upload:
            return jsonify({"error": "上传文件不存在"}), 404

        file_path = MEDIA_DIR / "personal_uploads" / upload["filename"]
        safe_base = MEDIA_DIR.resolve()
        if file_path.resolve().is_relative_to(safe_base) and file_path.exists():
            file_path.unlink()

        thumb_dir = MEDIA_DIR / "personal_uploads" / ".thumbs"
        stem = Path(upload["filename"]).stem
        for level in ("thumb", "medium"):
            tp = thumb_dir / f"{stem}.{level}.jpg"
            if tp.exists():
                tp.unlink()

        delete_personal_upload(upload_id)
        return jsonify({"success": True})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@bp.route("/personal-uploads/batch/delete", methods=["POST"])
def api_batch_delete_personal_uploads():
    body = request.get_json(force=True)
    upload_ids = body.get("upload_ids", [])
    if not upload_ids:
        return jsonify({"error": "upload_ids 不能为空"}), 400

    safe_base = MEDIA_DIR.resolve()
    for uid in upload_ids:
        upload = get_personal_upload(uid)
        if not upload:
            continue
        file_path = MEDIA_DIR / "personal_uploads" / upload["filename"]
        if file_path.resolve().is_relative_to(safe_base) and file_path.exists():
            file_path.unlink()
        thumb_dir = MEDIA_DIR / "personal_uploads" / ".thumbs"
        stem = Path(upload["filename"]).stem
        for level in ("thumb", "medium"):
            tp = thumb_dir / f"{stem}.{level}.jpg"
            if tp.exists():
                tp.unlink()

    delete_personal_uploads(upload_ids)
    return jsonify({"success": True})


@bp.route("/personal-uploads/create-work", methods=["POST"])
def api_create_work_from_uploads():
    body = request.get_json(force=True)
    title = body.get("title", "").strip()
    upload_ids = body.get("upload_ids", [])

    if not title:
        return jsonify({"error": "标题不能为空"}), 400
    if not upload_ids:
        return jsonify({"error": "请选择至少一个素材"}), 400

    uploads = []
    for uid in upload_ids:
        upload = get_personal_upload(uid)
        if upload:
            uploads.append(upload)

    if not uploads:
        return jsonify({"error": "未找到有效的上传文件"}), 400

    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    uid = uuid.uuid4().hex[:8]
    work_dir_name = f"manual_{ts}_{uid}"
    work_dir = MEDIA_DIR / work_dir_name
    work_dir.mkdir(parents=True, exist_ok=True)

    author_db_id = upsert_author("manual", "个人上传", "manual", None)

    work_id = insert_work(
        title=title,
        platform="manual",
        author_id=author_db_id,
        original_url="",
        media_dir=work_dir_name,
        video_id=None,
        status="success",
        error_message=None,
    )

    material_type_pairs = []
    src_thumb_dir = MEDIA_DIR / "personal_uploads" / ".thumbs"
    for sort_order, upload in enumerate(uploads):
        src_path = MEDIA_DIR / "personal_uploads" / upload["filename"]
        dst_path = work_dir / upload["filename"]

        if src_path.exists():
            shutil.move(str(src_path), str(dst_path))
            dst_thumb_dir = work_dir / ".thumbs"
            dst_thumb_dir.mkdir(exist_ok=True)
            stem = Path(upload["filename"]).stem
            for level in ("thumb", "medium"):
                src_thumb = src_thumb_dir / f"{stem}.{level}.jpg"
                if src_thumb.exists():
                    dst_thumb = dst_thumb_dir / f"{stem}.{level}.jpg"
                    shutil.move(str(src_thumb), str(dst_thumb))

        mat_id = insert_material(
            work_id=work_id,
            mtype=upload["type"],
            filename=upload["filename"],
            original_url="",
            sort_order=sort_order,
        )
        material_type_pairs.append((mat_id, upload["type"]))

    assign_fixed_tags(work_id, "个人上传", "个人上传", material_type_pairs)

    metadata = {
        "title": title,
        "platform": "manual",
        "author": {
            "author_id": "manual",
            "name": "个人上传",
        },
    }
    with open(work_dir / "metadata.json", "w", encoding="utf-8") as f:
        json.dump(metadata, f, ensure_ascii=False)

    delete_personal_uploads([u["id"] for u in uploads])

    return jsonify({"success": True, "work_id": work_id})
