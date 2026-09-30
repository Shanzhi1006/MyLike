from flask import Blueprint, jsonify

from rebuilder import rebuild_database, sync_database

bp = Blueprint("system_api", __name__, url_prefix="/api")


@bp.route("/sync", methods=["POST"])
def api_sync():
    result = sync_database()
    return jsonify(result)


@bp.route("/rebuild", methods=["POST"])
def api_rebuild():
    result = rebuild_database()
    return jsonify(result)
