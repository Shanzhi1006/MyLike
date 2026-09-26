import re
import unicodedata
from pathlib import Path
from urllib.parse import urlparse

from config import IMAGE_EXTS, MAX_FILENAME_LEN, VIDEO_EXTS

_WIN_RESERVED = {
    "CON",
    "PRN",
    "AUX",
    "NUL",
    *(f"COM{i}" for i in range(1, 10)),
    *(f"LPT{i}" for i in range(1, 10)),
}


def sanitize_filename(name, max_len=None):
    if max_len is None:
        max_len = MAX_FILENAME_LEN
    if name is None:
        name = ""
    if not isinstance(name, str):
        name = str(name)
    name = re.sub(r"[\x00-\x1f\x7f]", " ", name)
    name = re.sub(r"[\u200b-\u200f\u202a-\u202e\u2028-\u202f\u2060\ufeff]", "", name)
    name = re.sub(r'[<>:"/\\|?*]', "_", name)
    name = unicodedata.normalize("NFC", name)
    name = re.sub(r"\s+", " ", name)
    name = name.strip().strip(".").strip()
    if name.upper() in _WIN_RESERVED:
        name = f"_{name}"
    if len(name) > max_len:
        name = name[:max_len].rstrip().rstrip(".")
    return name or "untitled"


def extract_url(text):
    pattern = r"https?://[^\s]+"
    match = re.search(pattern, text)
    if match:
        return match.group(0)
    pattern2 = r"(?:v\.douyin\.com|xhslink\.com|xhslink\.cn|www\.xiaohongshu\.com)[^\s]*"
    match2 = re.search(pattern2, text)
    if match2:
        return "https://" + match2.group(0)
    raise ValueError(f"无法从文本中提取链接: {text}")


def detect_platform(share_url):
    if "douyin" in share_url:
        return "douyin"
    if "xiaohongshu" in share_url or "xhslink" in share_url:
        return "xiaohongshu"
    return "unknown"


def get_file_ext(url):
    parsed = urlparse(url)
    if parsed.path:
        lower = parsed.path.lower()
        for ext in [".png", ".webp", ".jpeg", ".jpg", ".gif", ".heic", ".bmp", ".mp4", ".mov", ".avi", ".mkv", ".webm"]:
            if lower.endswith(ext):
                return ext
    return ""
