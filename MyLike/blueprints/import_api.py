import logging
import threading
import uuid

from flask import Blueprint, jsonify, request

from config import PLATFORM_DISPLAY
from db import (
    assign_fixed_tags,
    cleanup_old_import_tasks,
    create_import_task,
    find_work_by_media_dir,
    find_work_by_video_id,
    get_import_task,
    get_all_import_tasks,
    get_work_material_filenames,
    insert_material,
    insert_work,
    touch_work,
    update_import_task_item,
    update_import_task_status,
    upsert_author,
)
from media_parser import parse_and_download

logger = logging.getLogger("mylike.import_api")

bp = Blueprint("import_api", __name__, url_prefix="/api/import")


@bp.route("", methods=["POST"])
def api_import():
    body = request.get_json(force=True)
    texts = body.get("texts", [])
    if isinstance(texts, str):
        texts = [texts]
    if not texts:
        return jsonify({"error": "请提供至少一个分享文本"}), 400
    if len(texts) > 100:
        return jsonify({"error": "单次最多导入100条链接"}), 400

    task_id = str(uuid.uuid4())[:8]
    items = []
    for i, text in enumerate(texts):
        items.append(
            {
                "index": i,
                "text": text,
                "full_text": text,
            }
        )

    create_import_task(task_id, items)

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

    task = get_import_task(task_id)
    if not task:
        return jsonify({"error": "任务不存在"}), 404

    item = None
    for it in task["items"]:
        if it["index"] == item_index:
            item = it
            break
    if not item:
        return jsonify({"error": "导入项不存在"}), 404

    update_import_task_item(task_id, item_index, "pending", message="等待重试...")

    thread = threading.Thread(
        target=_run_retry,
        args=(task_id, item_index, item["full_text"]),
        daemon=True,
    )
    thread.start()

    return jsonify({"task_id": task_id, "item_index": item_index})


def _import_single_item(task_id, item_index, full_text):
    try:
        update_import_task_item(task_id, item_index, "parsing")
        result = parse_and_download(full_text)

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

                touch_work(existing_id)

                errors = result["errors"]
                if errors:
                    update_import_task_item(
                        task_id, item_index, "partial_success",
                        message=(
                            f"增量导入: 新增{len(new_materials)}个素材, "
                            f"已存在{skipped_count}个素材; " + "; ".join(errors)
                        ),
                        work_id=existing_id,
                    )
                else:
                    update_import_task_item(
                        task_id, item_index, "incremental",
                        message=f"增量导入: 新增{len(new_materials)}个素材, 已存在{skipped_count}个素材",
                        work_id=existing_id,
                    )
            else:
                errors = result["errors"]
                if errors:
                    update_import_task_item(
                        task_id, item_index, "partial_success",
                        message=f"作品已存在，素材已全部导入; " + "; ".join(errors),
                        work_id=existing_id,
                    )
                else:
                    update_import_task_item(
                        task_id, item_index, "exists",
                        message="作品已存在，素材已全部导入",
                        work_id=existing_id,
                    )

            logger.info(
                "Incremental import for work %s: %d new, %d existing",
                existing_id,
                len(new_materials),
                skipped_count,
            )
            return

        update_import_task_item(task_id, item_index, "downloading")

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

        message = "; ".join(result["errors"]) if result["errors"] else "导入成功"
        update_import_task_item(task_id, item_index, result["status"], message=message, work_id=work_id)
        logger.info("Imported work %s: %s", work_id, result["title"])

    except Exception as e:
        update_import_task_item(task_id, item_index, "failed", message=str(e))
        logger.error("Import failed for item %s: %s", item_index, e, exc_info=True)


def _run_import(task_id, items):
    for item in items:
        _import_single_item(task_id, item["index"], item["full_text"])
        update_import_task_status(task_id)
    cleanup_old_import_tasks()


def _run_retry(task_id, item_index, full_text):
    _import_single_item(task_id, item_index, full_text)
    update_import_task_status(task_id)
    cleanup_old_import_tasks()


NO_CACHE_HEADERS = {"Cache-Control": "no-cache, no-store, must-revalidate"}


@bp.route("/status")
def api_import_status_all():
    cleanup_old_import_tasks()
    tasks = get_all_import_tasks()
    resp = jsonify({"tasks": tasks})
    resp.headers.update(NO_CACHE_HEADERS)
    return resp


@bp.route("/status/<task_id>")
def api_import_status(task_id):
    task = get_import_task(task_id)
    if not task:
        resp = jsonify({"error": "任务不存在"})
        resp.headers.update(NO_CACHE_HEADERS)
        return resp, 404
    resp = jsonify(task)
    resp.headers.update(NO_CACHE_HEADERS)
    return resp