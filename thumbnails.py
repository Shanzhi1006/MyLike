import logging
import subprocess
from pathlib import Path

from PIL import Image

import config

logger = logging.getLogger("mylike.thumbnails")


THUMB_SIZES = {
    "thumb": 300,
    "medium": 800,
}


THUMB_QUALITY = {
    "thumb": 80,
    "medium": 85,
}


THUMB_DIR_NAME = ".thumbs"


def get_thumb_path(original_path, level="thumb"):
    p = Path(original_path)
    thumb_dir = p.parent / THUMB_DIR_NAME
    return thumb_dir / f"{p.stem}.{level}.jpg"


def generate_thumbnail(original_path, level="thumb"):
    original_path = Path(original_path)
    if not original_path.exists():
        return None
    if level not in THUMB_SIZES:
        return None

    thumb_path = get_thumb_path(original_path, level)
    if thumb_path.exists():
        return thumb_path

    ext = original_path.suffix.lower()
    if ext in config.VIDEO_EXTS:
        return _generate_video_thumbnail(original_path, level)
    return _generate_image_thumbnail(original_path, level)


def _generate_image_thumbnail(original_path, level="thumb"):
    thumb_path = get_thumb_path(original_path, level)
    thumb_dir = thumb_path.parent
    thumb_dir.mkdir(parents=True, exist_ok=True)
    try:
        img = Image.open(original_path)
        img = img.convert("RGB")
        max_size = THUMB_SIZES[level]
        img.thumbnail((max_size, max_size), Image.Resampling.LANCZOS)
        img.save(thumb_path, "JPEG", quality=THUMB_QUALITY[level], optimize=True)
        return thumb_path
    except Exception as e:
        logger.warning("Failed to generate %s thumbnail for %s: %s", level, original_path.name, e)
        return None


def _generate_video_thumbnail(video_path, level="thumb"):
    thumb_path = get_thumb_path(video_path, level)
    thumb_dir = thumb_path.parent
    thumb_dir.mkdir(parents=True, exist_ok=True)

    max_size = THUMB_SIZES[level]
    try:
        cmd = [
            "ffmpeg",
            "-y",
            "-i",
            str(video_path),
            "-frames:v",
            "1",
            "-vf",
            f"scale='min({max_size},iw)':'min({max_size},ih)':force_original_aspect_ratio=decrease",
            "-q:v",
            str(max(1, 10 - THUMB_QUALITY[level] // 10)),
            str(thumb_path),
        ]
        result = subprocess.run(cmd, capture_output=True, timeout=30)
        if thumb_path.exists():
            return thumb_path
        logger.warning("Failed to generate %s thumbnail for video %s", level, video_path.name)
        return None
    except Exception as e:
        logger.warning("Failed to generate %s thumbnail for video %s: %s", level, video_path.name, e)
        return None


def regenerate_thumbnail(original_path, level="thumb"):
    original_path = Path(original_path)
    thumb_path = get_thumb_path(original_path, level)
    if thumb_path.exists():
        thumb_path.unlink()
    return generate_thumbnail(original_path, level)


def generate_all_thumbnails(original_path):
    for level in THUMB_SIZES:
        generate_thumbnail(original_path, level)
