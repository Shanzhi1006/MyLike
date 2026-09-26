import json

import requests

from config import (
    API_KEY,
    BROWSER_UA,
    DOWNLOAD_TIMEOUT,
    MEDIA_DIR,
    MEDIA_PARSER_URL,
    PLATFORM_NORMALIZE,
    PLATFORM_REFERER,
)
from thumbnails import generate_all_thumbnails
from utils import detect_platform, extract_url, get_file_ext, sanitize_filename


def call_media_parser(share_url):
    api_url = f"{MEDIA_PARSER_URL}/api/v1/parse"
    headers = {}
    if API_KEY and API_KEY.strip():
        headers["Authorization"] = f"Bearer {API_KEY}"
    params = {"url": share_url}
    resp = requests.get(api_url, headers=headers, params=params, timeout=DOWNLOAD_TIMEOUT)
    resp.raise_for_status()
    data = resp.json()
    if data.get("retcode") != 200:
        raise RuntimeError(f"解析失败: {data.get('retdesc', '未知错误')}")
    return data["data"]


def download_file(url, save_path, referer):
    save_path.parent.mkdir(parents=True, exist_ok=True)
    headers = {
        "User-Agent": BROWSER_UA,
        "Referer": referer,
        "Accept": "*/*",
        "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
    }
    resp = requests.get(url, headers=headers, stream=True, timeout=DOWNLOAD_TIMEOUT)
    resp.raise_for_status()
    with open(save_path, "wb") as f:
        for chunk in resp.iter_content(chunk_size=8192):
            f.write(chunk)
    return True


def parse_and_download(share_text):
    share_url = extract_url(share_text)
    platform = detect_platform(share_url)

    if platform == "unknown":
        raise ValueError(f"不支持的平台，链接: {share_url}")

    data = call_media_parser(share_url)

    raw_platform = data.get("platform", "")
    normalized_platform = PLATFORM_NORMALIZE.get(raw_platform, platform)

    title = data.get("title") or data.get("desc") or "untitled"
    safe_title = sanitize_filename(title)

    work_dir = MEDIA_DIR / safe_title
    work_dir.mkdir(parents=True, exist_ok=True)

    referer = PLATFORM_REFERER.get(normalized_platform, "https://www.douyin.com/")

    materials = []
    errors = []

    video_url = (
        data.get("video_url")
        or data.get("video")
        or (data.get("video_list", [{}])[0].get("url") if data.get("video_list") else None)
    )
    if video_url and isinstance(video_url, str):
        video_path = work_dir / f"{safe_title}.mp4"
        try:
            download_file(video_url, video_path, referer)
            materials.append(
                {
                    "type": "video",
                    "filename": video_path.name,
                    "original_url": video_url,
                    "sort_order": 0,
                }
            )
        except Exception as e:
            errors.append(f"视频下载失败: {e}")

    images = data.get("image_list") or data.get("images") or data.get("image_urls") or []
    if not images and data.get("image_url"):
        images = [data["image_url"]]

    for idx, img in enumerate(images, start=1):
        sort_offset = len([m for m in materials if m["type"] == "image"]) + 1
        if isinstance(img, str):
            img_url = img
            live_url = None
        elif isinstance(img, dict):
            img_url = img.get("url") or img.get("image_url") or ""
            live_url = img.get("live_photo_url")
        else:
            continue

        if not img_url:
            continue

        if "sns-img-qc.xhscdn.com" in img_url:
            img_url = img_url.replace("sns-img-qc.xhscdn.com", "sns-img-bd.xhscdn.com")

        ext = get_file_ext(img_url) or ".jpg"
        img_path = work_dir / f"{safe_title}_{idx:02d}{ext}"
        try:
            download_file(img_url, img_path, referer)
            materials.append(
                {
                    "type": "image",
                    "filename": img_path.name,
                    "original_url": img_url,
                    "sort_order": sort_offset,
                }
            )
        except Exception as e:
            errors.append(f"图片{idx}下载失败: {e}")

        if live_url:
            live_path = work_dir / f"{safe_title}_{idx:02d}_live.mp4"
            try:
                download_file(live_url, live_path, referer)
                materials.append(
                    {
                        "type": "video",
                        "filename": live_path.name,
                        "original_url": live_url,
                        "sort_order": sort_offset + 100,
                    }
                )
            except Exception as e:
                errors.append(f"实况图{idx}下载失败: {e}")

    data["original_url"] = share_url

    meta_path = work_dir / "metadata.json"
    with open(meta_path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

    for m in materials:
        if m["type"] in ("image", "video"):
            generate_all_thumbnails(work_dir / m["filename"])

    author = data.get("author") or {}
    author_info = {
        "platform_author_id": str(author.get("author_id", "unknown")),
        "name": author.get("nickname") or author.get("name") or "未知",
        "platform": normalized_platform,
        "avatar_url": author.get("avatar"),
    }

    video_id = data.get("video_id")

    if not materials:
        status = "failed"
    elif errors:
        status = "partial_success"
    else:
        status = "success"

    return {
        "title": title,
        "safe_title": safe_title,
        "platform": normalized_platform,
        "author_info": author_info,
        "original_url": share_url,
        "media_dir": safe_title,
        "video_id": str(video_id) if video_id else None,
        "materials": materials,
        "errors": errors,
        "status": status,
        "raw_data": data,
    }
