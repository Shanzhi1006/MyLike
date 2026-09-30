import logging
import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent


MEDIA_DIR = Path(os.environ.get("MEDIA_DIR", str(BASE_DIR / "media")))
DB_PATH = Path(os.environ.get("DB_PATH", str(BASE_DIR / "mylike.db")))


MEDIA_PARSER_URL = os.environ.get("MEDIA_PARSER_URL", "http://127.0.0.1:8051")
API_KEY = os.environ.get("MEDIA_PARSER_API_KEY", "mp-VQcBogiubPO8EtWf3rb1hErR")


FLASK_HOST = os.environ.get("FLASK_HOST", "127.0.0.1")
FLASK_PORT = int(os.environ.get("FLASK_PORT", 5000))
FLASK_DEBUG = os.environ.get("FLASK_DEBUG", "1") == "1"


LOG_LEVEL = os.environ.get("LOG_LEVEL", "DEBUG" if FLASK_DEBUG else "INFO")


logging.basicConfig(
    level=getattr(logging, LOG_LEVEL, logging.INFO),
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger("mylike")


DOWNLOAD_TIMEOUT = 30
MAX_FILENAME_LEN = 80


IMAGE_EXTS = {".jpg", ".jpeg", ".png", ".webp", ".gif", ".heic", ".bmp"}
VIDEO_EXTS = {".mp4", ".mov", ".avi", ".mkv", ".webm"}


PLATFORM_REFERER = {
    "douyin": "https://www.douyin.com/",
    "xiaohongshu": "https://www.xiaohongshu.com/",
}


BROWSER_UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/120.0.0.0 Safari/537.36"
)


PLATFORM_NORMALIZE = {
    "抖音": "douyin",
    "小红书": "xiaohongshu",
    "douyin": "douyin",
    "xiaohongshu": "xiaohongshu",
}


PLATFORM_DISPLAY = {
    "douyin": "抖音",
    "xiaohongshu": "小红书",
    "manual": "个人上传",
}


FIXED_DIMENSIONS = [
    {"name": "平台", "type": "fixed"},
    {"name": "类型", "type": "fixed"},
    {"name": "作者", "type": "fixed"},
]
