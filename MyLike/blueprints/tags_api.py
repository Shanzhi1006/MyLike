from flask import Blueprint, jsonify, request

from db import (create_dimension, create_tag, delete_dimension, delete_tag, get_all_dimensions, get_all_tags,
                get_conn, rename_dimension, rename_tag, reorder_dimensions, reorder_tags, toggle_tag_star)

bp = Blueprint("tags_api", __name__, url_prefix="/api")


@bp.route("/tag-dimensions")
def api_dimensions():
    dims = get_all_dimensions()
    result = []
    for d in dims:
        tags = get_all_tags(d["id"])
        tag_ids = [t["id"] for t in tags]
        work_counts = {}
        if tag_ids:
            placeholders = ",".join("?" * len(tag_ids))
            rows = get_conn().execute(
                "SELECT tag_id, COUNT(*) AS cnt FROM work_tags WHERE tag_id IN (" + placeholders + ") GROUP BY tag_id",
                tag_ids,
            ).fetchall()
            work_counts = {row["tag_id"]: row["cnt"] for row in rows}
        result.append(
            {
                "id": d["id"],
                "name": d["name"],
                "type": d["type"],
                "tags": [
                    {"id": t["id"], "name": t["name"], "dimension_id": t["dimension_id"], "starred": t.get("starred", 0), "work_count": work_counts.get(t["id"], 0)}
                    for t in tags
                ],
            }
        )
    return jsonify({"dimensions": result})


@bp.route("/tag-dimensions", methods=["POST"])
def api_create_dimension():
    body = request.get_json(force=True)
    name = body.get("name", "").strip()
    if not name:
        return jsonify({"error": "维度名称不能为空"}), 400
    try:
        dim_id = create_dimension(name)
        return jsonify({"success": True, "id": dim_id})
    except Exception as e:
        return jsonify({"error": str(e)}), 400


@bp.route("/tag-dimensions/<int:dim_id>", methods=["PUT"])
def api_rename_dimension(dim_id):
    body = request.get_json(force=True)
    name = body.get("name", "").strip()
    if not name:
        return jsonify({"error": "维度名称不能为空"}), 400
    try:
        rename_dimension(dim_id, name)
        return jsonify({"success": True})
    except Exception as e:
        return jsonify({"error": str(e)}), 400


@bp.route("/tag-dimensions/<int:dim_id>", methods=["DELETE"])
def api_delete_dimension(dim_id):
    try:
        delete_dimension(dim_id)
        return jsonify({"success": True})
    except Exception as e:
        return jsonify({"error": str(e)}), 400


@bp.route("/tag-dimensions/reorder", methods=["POST"])
def api_reorder_dimensions():
    body = request.get_json(force=True)
    dim_ids = body.get("dim_ids", [])
    if not isinstance(dim_ids, list):
        return jsonify({"error": "dim_ids 必须是数组"}), 400
    try:
        reorder_dimensions(dim_ids)
        return jsonify({"success": True})
    except Exception as e:
        return jsonify({"error": str(e)}), 400


@bp.route("/tags", methods=["POST"])
def api_create_tag():
    body = request.get_json(force=True)
    dimension_id = body.get("dimension_id")
    name = body.get("name", "").strip()
    if not name or not dimension_id:
        return jsonify({"error": "维度和标签名称不能为空"}), 400
    try:
        tag_id = create_tag(dimension_id, name)
        return jsonify({"success": True, "id": tag_id})
    except Exception as e:
        return jsonify({"error": str(e)}), 400


@bp.route("/tags/<int:tag_id>", methods=["PUT"])
def api_rename_tag(tag_id):
    body = request.get_json(force=True)
    name = body.get("name", "").strip()
    if not name:
        return jsonify({"error": "标签名称不能为空"}), 400
    try:
        rename_tag(tag_id, name)
        return jsonify({"success": True})
    except Exception as e:
        return jsonify({"error": str(e)}), 400


@bp.route("/tags/<int:tag_id>", methods=["DELETE"])
def api_delete_tag(tag_id):
    try:
        delete_tag(tag_id)
        return jsonify({"success": True})
    except Exception as e:
        return jsonify({"error": str(e)}), 400


@bp.route("/tags/reorder", methods=["POST"])
def api_reorder_tags():
    body = request.get_json(force=True)
    tag_ids = body.get("tag_ids", [])
    if not isinstance(tag_ids, list):
        return jsonify({"error": "tag_ids 必须是数组"}), 400
    try:
        reorder_tags(tag_ids)
        return jsonify({"success": True})
    except Exception as e:
        return jsonify({"error": str(e)}), 400


@bp.route("/tags/<int:tag_id>/star", methods=["POST"])
def api_toggle_tag_star(tag_id):
    try:
        starred = toggle_tag_star(tag_id)
        return jsonify({"success": True, "starred": starred})
    except Exception as e:
        return jsonify({"error": str(e)}), 400
