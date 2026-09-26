import json

from flask import Blueprint, jsonify, request

from db import create_planner_layout, delete_planner_layout, get_all_planner_layouts, update_planner_layout

bp = Blueprint("planner_api", __name__, url_prefix="/api/planner")


@bp.route("/layouts")
def api_planner_layouts():
    layouts = get_all_planner_layouts()
    result = []
    for l in layouts:
        result.append(
            {
                "id": l["id"],
                "name": l["name"],
                "config": json.loads(l["config"]),
                "created_at": l["created_at"],
                "updated_at": l["updated_at"],
            }
        )
    return jsonify({"layouts": result})


@bp.route("/layouts", methods=["POST"])
def api_create_planner_layout():
    body = request.get_json(force=True)
    name = body.get("name", "").strip()
    if not name:
        return jsonify({"error": "名称不能为空"}), 400
    config = body.get("config", {})
    layout_id = create_planner_layout(name, config)
    return jsonify({"success": True, "id": layout_id})


@bp.route("/layouts/<int:layout_id>", methods=["PUT"])
def api_update_planner_layout(layout_id):
    body = request.get_json(force=True)
    name = body.get("name")
    config = body.get("config")
    update_planner_layout(layout_id, name=name, config=config)
    return jsonify({"success": True})


@bp.route("/layouts/<int:layout_id>", methods=["DELETE"])
def api_delete_planner_layout(layout_id):
    delete_planner_layout(layout_id)
    return jsonify({"success": True})
