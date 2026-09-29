import logging
import threading
import uuid
from datetime import datetime, timedelta

from flask import Blueprint, jsonify, request

from config import PLATFORM_DISPLAY
from db import (assign_fixed_tags, find_work_by_media_dir, find_work_by_video_id, get_work_material_filenames,
                insert_material, insert_work, upsert_author)
from media_parser import parse_and_download

logger = logging.getLogger("mylike.import_api")


bp = Blueprint("import_api", __name__, url_prefix="/api/import")


import_tasks = {}
import_tasks_lock = threading.Lock()
MAX_TASK_AGE_HOURS = 24
MAX_TASKS = 50


def _cleanup_old_tasks():
    now = datetime.now()
    to_remove = []
    for tid, task in import_tasks.items():
        try:
            created = datetime.fromisoformat(task["created_at"])
            if (now - created) > timedelta(hours=MAX_TASK_AGE_HOURS):
                to_remove.append(tid)
        except (ValueError, KeyError):
            to_remove.append(tid)
    for tid in to_remove:
        import_tasks.pop(tid, None)
    while len(import_tasks) > MAX_TASKS:
        oldest = min(import_tasks.items(), key=lambda x: x[1]["created_at"])
        import_tasks.pop(oldest[0], None)


@bp.route("", methods=["POST"])
def api_import():
    body = request.get_json(force=True)
    texts = body.get("texts", [])
    if isinstance(texts, str):
        texts = [texts]
    if not texts:
        return jsonify({"error": "请提供至少一个分享文本"}), 400

    task_id = str(uuid.uuid4())[:8]
    items = []
    for i, text in enumerate(texts):
        items.append(
            {
                "index": i,
                "text": text,
                "full_text": text,
                "status": "pending",
                "message": "",
                "work_id": None,
            }
        )

    with import_tasks_lock:
        import_tasks[task_id] = {
            "task_id": task_id,
            "status": "running",
            "total": len(items),
            "completed": 0,
            "items": items,
            "created_at": datetime.now().isoformat(),
        }

    thread = threading.Thread(target=_run_import, args=(task_id, items), daemon=True)
    thread.start()

    return jsonify({"task_id": task_id, "total": len(items)})


@bp.route("/retry", methods=["POST"])
def api_retry():
    body = request.get_json(force=True)
    task_id = body.get("task_id")
    item_index = body.get("item_index")

    if task_id is None or item_index is None:
        return jsonify({"error": "缺少 task_id 或 item_index"}), 400

    with import_tasks_lock:
        task = import_tasks.get(task_id)
        if not task:
            return jsonify({"error": "任务不存在"}), 404
        item = None
        for it in task["items"]:
            if it["index"] == item_index:
                item = it
                break
        if not item:
            return jsonify({"error": "导入项不存在"}), 404
        item["status"] = "pending"
        item["message"] = "等待重试..."
        task["status"] = "running"
        task["completed"] = sum(1 for it in task["items"] if it["status"] not in ("pending", "parsing", "downloading"))

    thread = threading.Thread(target=_run_retry, args=(task_id, item), daemon=True)
    thread.start()

    return jsonify({"task_id": task_id, "item_index": item_index})


def _import_single_item(item):
    try:
        item["status"] = "parsing"
        result = parse_and_download(item["full_text"])

        existing_id = None
        if result["video_id"]:
            existing_id = find_work_by_video_id(result["video_id"], result["platform"])
        if not existing_id:
            existing_id = find_work_by_media_dir(result["media_dir"])

        if existing_id:
            existing_filenames = get_work_material_filenames(existing_id)
            new_materials = [m for m in result["materials"] if m["filename"] not in existing_filenames]
            skipped_count = len(result["materials"]) - len(new_materials)

            if new_materials:
                material_type_pairs = []
                for mat in new_materials:
                    mat_id = insert_material(
                        work_id=existing_id,
                        mtype=mat["type"],
                        filename=mat["filename"],
                        original_url=mat["original_url"],
                        sort_order=mat["sort_order"],
                    )
                    material_type_pairs.append((mat_id, mat["type"]))

                assign_fixed_tags(
                    existing_id,
                    PLATFORM_DISPLAY.get(result["platform"], result["platform"]),
                    result["author_info"]["name"],
                    material_type_pairs,
                )

                errors = result["errors"]
                if errors:
                    item["status"] = "partial_success"
                    item["message"] = (
                        f"增量导入: 新增{len(new_materials)}个素材, "
                        f"已存在{skipped_count}个素材; " + "; ".join(errors)
                    )
                else:
                    item["status"] = "incremental"
                    item["message"] = f"增量导入: 新增{len(new_materials)}个素材, 已存在{skipped_count}个素材"
            else:
                errors = result["errors"]
                if errors:
                    item["status"] = "partial_success"
                    item["message"] = f"作品已存在，素材已全部导入; " + "; ".join(errors)
                else:
                    item["status"] = "exists"
                    item["message"] = "作品已存在，素材已全部导入"

            item["work_id"] = existing_id
            logger.info(
                "Incremental import for work %s: %d new, %d existing",
                existing_id,
                len(new_materials),
                skipped_count,
            )
            return

        item["status"] = "downloading"

        author_info = result["author_info"]
        author_db_id = upsert_author(
            author_info["platform_author_id"],
            author_info["name"],
            author_info["platform"],
            author_info["avatar_url"],
        )

        work_id = insert_work(
            title=result["title"],
            platform=result["platform"],
            author_id=author_db_id,
            original_url=result["original_url"],
            media_dir=result["media_dir"],
            video_id=result["video_id"],
            status=result["status"],
            error_message="; ".join(result["errors"]) if result["errors"] else None,
        )

        material_type_pairs = []
        for mat in result["materials"]:
            mat_id = insert_material(
                work_id=work_id,
                mtype=mat["type"],
                filename=mat["filename"],
                original_url=mat["original_url"],
                sort_order=mat["sort_order"],
            )
            material_type_pairs.append((mat_id, mat["type"]))

        assign_fixed_tags(
            work_id,
            PLATFORM_DISPLAY.get(result["platform"], result["platform"]),
            author_info["name"],
            material_type_pairs,
        )

        item["status"] = result["status"]
        item["message"] = "; ".join(result["errors"]) if result["errors"] else "导入成功"
        item["work_id"] = work_id
        logger.info("Imported work %s: %s", work_id, result["title"])

    except Exception as e:
        item["status"] = "failed"
        item["message"] = str(e)
        logger.error("Import failed for item %s: %s", item.get("index"), e, exc_info=True)


def _run_import(task_id, items):
    for item in items:
        _import_single_item(item)
        with import_tasks_lock:
            task = import_tasks.get(task_id)
            if task:
                task["completed"] += 1

    with import_tasks_lock:
        task = import_tasks.get(task_id)
        if task:
            all_done = all(it["status"] not in ("pending", "parsing", "downloading") for it in task["items"])
            if all_done:
                task["status"] = "completed"
        _cleanup_old_tasks()


def _run_retry(task_id, item):
    _import_single_item(item)
    with import_tasks_lock:
        task = import_tasks.get(task_id)
        if task:
            task["completed"] = sum(
                1 for it in task["items"] if it["status"] not in ("pending", "parsing", "downloading")
            )
            all_done = all(it["status"] not in ("pending", "parsing", "downloading") for it in task["items"])
            if all_done:
                task["status"] = "completed"
        _cleanup_old_tasks()


@bp.route("/status")
def api_import_status_all():
    with import_tasks_lock:
        _cleanup_old_tasks()
        tasks = list(import_tasks.values())
    tasks.sort(key=lambda t: t["created_at"], reverse=True)
    return jsonify({"tasks": tasks})


@bp.route("/status/<task_id>")
def api_import_status(task_id):
    with import_tasks_lock:
        task = import_tasks.get(task_id)
    if not task:
        return jsonify({"error": "任务不存在"}), 404
    return jsonify(task)
