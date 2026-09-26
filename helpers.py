import json
from pathlib import Path
from urllib.parse import quote

from flask import request


def media_url(media_dir, filename):
    encoded = quote(str(media_dir)) + "/" + quote(str(filename))
    return f"/media/{encoded}"


def thumb_url(media_dir, filename, level="thumb"):
    stem = Path(filename).stem
    thumb_name = f"{stem}.{level}.jpg"
    encoded = quote(str(media_dir)) + "/" + quote(".thumbs") + "/" + quote(thumb_name)
    return f"/media/{encoded}"


def parse_tag_filter():
    tag_filter = {}
    filter_str = request.args.get("tag_filter", "")
    if filter_str:
        try:
            filter_data = json.loads(filter_str)
            for dim_id_str, tag_ids in filter_data.items():
                dim_id = int(dim_id_str)
                if tag_ids:
                    tag_filter[dim_id] = [int(t) for t in tag_ids]
        except (json.JSONDecodeError, ValueError):
            pass
    return tag_filter
