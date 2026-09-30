from pathlib import Path

from flask import Blueprint, abort, redirect, render_template, send_from_directory, url_for

from config import IMAGE_EXTS, MEDIA_DIR, VIDEO_EXTS
from thumbnails import generate_thumbnail

bp = Blueprint("pages", __name__)


@bp.route("/")
def index():
    return redirect(url_for("pages.library"))


@bp.route("/import")
def import_page():
    return render_template("import.html")


@bp.route("/library")
def library():
    return render_template("library.html")


@bp.route("/tags")
def tags_page():
    return render_template("tags.html")


@bp.route("/planner")
def planner_page():
    return render_template("planner.html")


@bp.route("/planner/preview")
def planner_preview():
    return render_template("planner_preview.html")


@bp.route("/media/<path:filename>")
def serve_media(filename):
    safe_base = MEDIA_DIR.resolve()
    target = (MEDIA_DIR / filename).resolve()
    try:
        target.relative_to(safe_base)
    except ValueError:
        abort(403)

    if not target.exists():
        parts = Path(filename).parts
        if len(parts) >= 2 and parts[-2] == ".thumbs":
            stem_level = Path(parts[-1]).stem
            if "." in stem_level:
                stem, level = stem_level.rsplit(".", 1)
                if level in ("thumb", "medium"):
                    work_dir = target.parent.parent
                    for ext in list(IMAGE_EXTS) + list(VIDEO_EXTS):
                        orig_path = work_dir / f"{stem}{ext}"
                        if orig_path.exists():
                            result = generate_thumbnail(orig_path, level)
                            if result and result.exists():
                                return send_from_directory(str(result.parent), result.name)
                    abort(404)
        abort(404)

    return send_from_directory(str(MEDIA_DIR), filename)
