import functools
import json
import logging
import shutil
import sqlite3
import threading
from datetime import datetime

from config import DB_PATH, FIXED_DIMENSIONS, MEDIA_DIR

logger = logging.getLogger("mylike.db")


_local = threading.local()


def get_conn():
    if not hasattr(_local, "conn"):
        _local.conn = sqlite3.connect(str(DB_PATH), check_same_thread=False, timeout=30)
        _local.conn.row_factory = sqlite3.Row
        _local.conn.execute("PRAGMA journal_mode=WAL")
        _local.conn.execute("PRAGMA busy_timeout=5000")
        _local.conn.execute("PRAGMA foreign_keys=ON")
    return _local.conn


def auto_rollback(func):
    @functools.wraps(func)
    def wrapper(*args, **kwargs):
        try:
            return func(*args, **kwargs)
        except Exception:
            get_conn().rollback()
            raise

    return wrapper


def init_db():
    conn = get_conn()
    cur = conn.cursor()

    cur.executescript("""
    CREATE TABLE IF NOT EXISTS authors (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        platform_author_id TEXT NOT NULL,
        name TEXT NOT NULL,
        platform TEXT NOT NULL,
        avatar_url TEXT,
        UNIQUE(platform_author_id, platform)
    );


    CREATE TABLE IF NOT EXISTS works (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        platform TEXT NOT NULL,
        author_id INTEGER REFERENCES authors(id),
        original_url TEXT,
        media_dir TEXT NOT NULL,
        video_id TEXT,
        status TEXT NOT NULL DEFAULT 'success',
        error_message TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
    );


    CREATE TABLE IF NOT EXISTS materials (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        work_id INTEGER NOT NULL REFERENCES works(id) ON DELETE CASCADE,
        type TEXT NOT NULL,
        filename TEXT NOT NULL,
        original_url TEXT,
        sort_order INTEGER NOT NULL DEFAULT 0,
        source_material_id INTEGER REFERENCES materials(id) ON DELETE SET NULL,
        created_at TEXT NOT NULL
    );


    CREATE TABLE IF NOT EXISTS tag_dimensions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        type TEXT NOT NULL DEFAULT 'custom',
        sort_order INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL
    );


    CREATE TABLE IF NOT EXISTS tags (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        dimension_id INTEGER NOT NULL REFERENCES tag_dimensions(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        sort_order INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        UNIQUE(dimension_id, name)
    );


    CREATE TABLE IF NOT EXISTS work_tags (
        work_id INTEGER NOT NULL REFERENCES works(id) ON DELETE CASCADE,
        tag_id INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
        PRIMARY KEY(work_id, tag_id)
    );


    CREATE TABLE IF NOT EXISTS material_tags (
        material_id INTEGER NOT NULL REFERENCES materials(id) ON DELETE CASCADE,
        tag_id INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
        PRIMARY KEY(material_id, tag_id)
    );


    CREATE TABLE IF NOT EXISTS planner_layouts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        config TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS personal_uploads (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        filename TEXT NOT NULL UNIQUE,
        original_filename TEXT NOT NULL,
        type TEXT NOT NULL,
        file_size INTEGER,
        batch_id TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL
    );
    """)

    for dim in FIXED_DIMENSIONS:
        existing = cur.execute("SELECT id FROM tag_dimensions WHERE name = ?", (dim["name"],)).fetchone()
        if not existing:
            max_order = cur.execute("SELECT COALESCE(MAX(sort_order), -1) AS max_order FROM tag_dimensions").fetchone()[
                "max_order"
            ]
            cur.execute(
                "INSERT INTO tag_dimensions (name, type, sort_order, created_at) VALUES (?, ?, ?, ?)",
                (dim["name"], dim["type"], max_order + 1, datetime.now().isoformat()),
            )

    _migrate_sort_order(conn)
    _migrate_source_material_id(conn)
    _migrate_video_offset(conn)
    _migrate_starred(conn)
    _migrate_personal_uploads_batch_id(conn)

    conn.commit()


def _migrate_sort_order(conn):
    for table in ("tag_dimensions", "tags"):
        cols = [r["name"] for r in conn.execute(f"PRAGMA table_info({table})").fetchall()]
        if "sort_order" not in cols:
            conn.execute(f"ALTER TABLE {table} ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0")


def _migrate_source_material_id(conn):
    cols = [r["name"] for r in conn.execute("PRAGMA table_info(materials)").fetchall()]
    if "source_material_id" not in cols:
        conn.execute(
            "ALTER TABLE materials ADD COLUMN source_material_id INTEGER REFERENCES materials(id) ON DELETE SET NULL"
        )


def _migrate_video_offset(conn):
    cols = [r["name"] for r in conn.execute("PRAGMA table_info(materials)").fetchall()]
    if "video_offset" not in cols:
        conn.execute("ALTER TABLE materials ADD COLUMN video_offset REAL")


def _migrate_starred(conn):
    cols = [r["name"] for r in conn.execute("PRAGMA table_info(tags)").fetchall()]
    if "starred" not in cols:
        conn.execute("ALTER TABLE tags ADD COLUMN starred INTEGER NOT NULL DEFAULT 0")


def _migrate_personal_uploads_batch_id(conn):
    cols = [r["name"] for r in conn.execute("PRAGMA table_info(personal_uploads)").fetchall()]
    if "batch_id" not in cols:
        conn.execute("ALTER TABLE personal_uploads ADD COLUMN batch_id TEXT NOT NULL DEFAULT ''")
        conn.execute("UPDATE personal_uploads SET batch_id = created_at WHERE batch_id = ''")


@auto_rollback
def reorder_dimensions(dim_ids):
    conn = get_conn()
    for order, dim_id in enumerate(dim_ids):
        conn.execute(
            "UPDATE tag_dimensions SET sort_order=? WHERE id=?",
            (order, dim_id),
        )
    conn.commit()


@auto_rollback
def reorder_tags(tag_ids):
    conn = get_conn()
    for order, tag_id in enumerate(tag_ids):
        conn.execute(
            "UPDATE tags SET sort_order=? WHERE id=?",
            (order, tag_id),
        )
    conn.commit()


@auto_rollback
def toggle_tag_star(tag_id):
    conn = get_conn()
    conn.execute(
        "UPDATE tags SET starred = CASE WHEN starred = 1 THEN 0 ELSE 1 END WHERE id=?",
        (tag_id,),
    )
    conn.commit()
    row = conn.execute("SELECT starred FROM tags WHERE id=?", (tag_id,)).fetchone()
    return row["starred"] if row else 0


@auto_rollback
def reset_db():
    conn = get_conn()
    cur = conn.cursor()
    cur.executescript("""
        DROP TABLE IF EXISTS material_tags;
        DROP TABLE IF EXISTS work_tags;
        DROP TABLE IF EXISTS tags;
        DROP TABLE IF EXISTS tag_dimensions;
        DROP TABLE IF EXISTS materials;
        DROP TABLE IF EXISTS works;
        DROP TABLE IF EXISTS authors;
    """)
    conn.commit()
    init_db()


@auto_rollback
def upsert_author(platform_author_id, name, platform, avatar_url=None):
    conn = get_conn()
    cur = conn.cursor()
    cur.execute(
        """INSERT INTO authors (platform_author_id, name, platform, avatar_url)
           VALUES (?, ?, ?, ?)
           ON CONFLICT(platform_author_id, platform) DO UPDATE SET
             name=excluded.name,
             avatar_url=COALESCE(excluded.avatar_url, authors.avatar_url)
        """,
        (platform_author_id, name, platform, avatar_url),
    )
    conn.commit()
    row = cur.execute(
        "SELECT id FROM authors WHERE platform_author_id=? AND platform=?",
        (platform_author_id, platform),
    ).fetchone()
    return row["id"]


@auto_rollback
def insert_work(
    title, platform, author_id, original_url, media_dir, video_id=None, status="success", error_message=None
):
    conn = get_conn()
    now = datetime.now().isoformat()
    cur = conn.cursor()
    cur.execute(
        """INSERT INTO works
           (title, platform, author_id, original_url, media_dir, video_id,
            status, error_message, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (title, platform, author_id, original_url, media_dir, video_id, status, error_message, now, now),
    )
    conn.commit()
    return cur.lastrowid


@auto_rollback
def insert_material(
    work_id, mtype, filename, original_url=None, sort_order=0, source_material_id=None, video_offset=None
):
    conn = get_conn()
    cur = conn.cursor()
    cur.execute(
        """INSERT INTO materials
           (work_id, type, filename, original_url, sort_order, source_material_id, created_at, video_offset)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
        (
            work_id,
            mtype,
            filename,
            original_url,
            sort_order,
            source_material_id,
            datetime.now().isoformat(),
            video_offset,
        ),
    )
    conn.commit()
    return cur.lastrowid


def get_captures(source_material_id):
    conn = get_conn()
    rows = conn.execute(
        """SELECT m.*, w.media_dir FROM materials m
           JOIN works w ON m.work_id = w.id
           WHERE m.source_material_id = ?
           ORDER BY m.video_offset ASC""",
        (source_material_id,),
    ).fetchall()
    return [dict(r) for r in rows]


@auto_rollback
def get_or_create_dimension(name, dim_type="custom"):
    conn = get_conn()
    cur = conn.cursor()
    row = cur.execute("SELECT id FROM tag_dimensions WHERE name=?", (name,)).fetchone()
    if row:
        return row["id"]
    max_order = cur.execute("SELECT COALESCE(MAX(sort_order), -1) AS max_order FROM tag_dimensions").fetchone()[
        "max_order"
    ]
    cur.execute(
        "INSERT INTO tag_dimensions (name, type, sort_order, created_at) VALUES (?, ?, ?, ?)",
        (name, dim_type, max_order + 1, datetime.now().isoformat()),
    )
    conn.commit()
    return cur.lastrowid


@auto_rollback
def get_or_create_tag(dimension_id, name):
    conn = get_conn()
    cur = conn.cursor()
    row = cur.execute(
        "SELECT id FROM tags WHERE dimension_id=? AND name=?",
        (dimension_id, name),
    ).fetchone()
    if row:
        return row["id"]
    max_order = cur.execute(
        "SELECT COALESCE(MAX(sort_order), -1) AS max_order FROM tags WHERE dimension_id=?",
        (dimension_id,),
    ).fetchone()["max_order"]
    cur.execute(
        "INSERT INTO tags (dimension_id, name, sort_order, created_at) VALUES (?, ?, ?, ?)",
        (dimension_id, name, max_order + 1, datetime.now().isoformat()),
    )
    conn.commit()
    return cur.lastrowid


def get_type_tag_ids():
    type_dim_id = get_or_create_dimension("类型", "fixed")
    type_tag_image_id = get_or_create_tag(type_dim_id, "图片")
    type_tag_video_id = get_or_create_tag(type_dim_id, "视频")
    return type_tag_image_id, type_tag_video_id


@auto_rollback
def assign_fixed_tags(work_id, platform_display, author_name, material_type_pairs):
    conn = get_conn()
    platform_dim_id = get_or_create_dimension("平台", "fixed")
    platform_tag_id = get_or_create_tag(platform_dim_id, platform_display)
    add_work_tag(work_id, platform_tag_id)

    author_dim_id = get_or_create_dimension("作者", "fixed")
    author_tag_id = get_or_create_tag(author_dim_id, author_name)
    add_work_tag(work_id, author_tag_id)

    type_tag_image_id, type_tag_video_id = get_type_tag_ids()

    for mat_id, mat_type in material_type_pairs:
        if mat_type == "image":
            add_material_tag(mat_id, type_tag_image_id)
        else:
            add_material_tag(mat_id, type_tag_video_id)
    logger.debug("Assigned fixed tags to work %s (%d materials)", work_id, len(material_type_pairs))


@auto_rollback
def add_work_tag(work_id, tag_id):
    conn = get_conn()
    conn.execute(
        "INSERT OR IGNORE INTO work_tags (work_id, tag_id) VALUES (?, ?)",
        (work_id, tag_id),
    )
    conn.commit()


@auto_rollback
def add_material_tag(material_id, tag_id):
    conn = get_conn()
    inherited = conn.execute(
        """SELECT 1 FROM materials m
           JOIN work_tags wt ON wt.work_id = m.work_id
           WHERE m.id = ? AND wt.tag_id = ?""",
        (material_id, tag_id),
    ).fetchone()
    if inherited:
        return
    conn.execute(
        "INSERT OR IGNORE INTO material_tags (material_id, tag_id) VALUES (?, ?)",
        (material_id, tag_id),
    )
    conn.commit()


def get_work_tags(work_id):
    conn = get_conn()
    rows = conn.execute(
        """SELECT t.id, t.name, d.id as dimension_id, d.name as dimension_name, d.type as dimension_type
           FROM work_tags wt
           JOIN tags t ON wt.tag_id = t.id
           JOIN tag_dimensions d ON t.dimension_id = d.id
           WHERE wt.work_id = ?
           ORDER BY d.id, t.name""",
        (work_id,),
    ).fetchall()
    return [dict(r) for r in rows]


def get_material_effective_tags(material_id):
    conn = get_conn()
    own_tag_ids = set(
        r["tag_id"]
        for r in conn.execute("SELECT tag_id FROM material_tags WHERE material_id=?", (material_id,)).fetchall()
    )
    rows = conn.execute(
        """SELECT DISTINCT t.id, t.name, d.id as dimension_id, d.name as dimension_name, d.type as dimension_type
           FROM (
               SELECT tag_id FROM material_tags WHERE material_id = ?
               UNION
               SELECT wt.tag_id FROM material_tags mt
               JOIN materials m ON mt.material_id = m.id
               JOIN work_tags wt ON wt.work_id = m.work_id
               WHERE mt.material_id = ?
           ) all_tags
           JOIN tags t ON all_tags.tag_id = t.id
           JOIN tag_dimensions d ON t.dimension_id = d.id
           ORDER BY d.id, t.name""",
        (material_id, material_id),
    ).fetchall()
    result = []
    for r in rows:
        d = dict(r)
        d["source"] = "own" if r["id"] in own_tag_ids else "inherited"
        result.append(d)
    return result


def get_all_works(tag_filter=None, sort_order="desc", page=1, per_page=20):
    conn = get_conn()
    base_sql = """
        SELECT w.*, a.name as author_name, a.platform_author_id,
               a.avatar_url, a.id as author_db_id
        FROM works w
        LEFT JOIN authors a ON w.author_id = a.id
    """
    params = []
    if tag_filter:
        conditions = []
        for dim_id, tag_ids in tag_filter.items():
            if tag_ids:
                placeholders = ",".join("?" * len(tag_ids))
                conditions.append(f"""
                    w.id IN (
                        SELECT work_id FROM work_tags wt
                        JOIN tags t ON wt.tag_id = t.id
                        WHERE t.dimension_id = {dim_id}
                        AND wt.tag_id IN ({placeholders})
                    )
                """)
                params.extend(tag_ids)
        if conditions:
            base_sql += " WHERE " + " AND ".join(conditions)

    count_sql = f"SELECT COUNT(*) as total FROM ({base_sql})"
    total = conn.execute(count_sql, params).fetchone()["total"]

    sql = base_sql + " ORDER BY w.created_at " + ("DESC" if sort_order != "asc" else "ASC")
    if per_page > 0:
        offset = (page - 1) * per_page
        sql += f" LIMIT {per_page} OFFSET {offset}"
    rows = conn.execute(sql, params).fetchall()
    if not rows:
        return [], total

    work_ids = [r["id"] for r in rows]
    ph = ",".join("?" * len(work_ids))

    mat_rows = conn.execute(
        f"SELECT * FROM materials WHERE work_id IN ({ph}) ORDER BY sort_order, id",
        work_ids,
    ).fetchall()
    materials_by_work = {}
    for mr in mat_rows:
        materials_by_work.setdefault(mr["work_id"], []).append(dict(mr))

    tag_rows = conn.execute(
        f"""SELECT t.id, t.name, d.id as dimension_id, d.name as dimension_name,
                  d.type as dimension_type, wt.work_id
           FROM work_tags wt
           JOIN tags t ON wt.tag_id = t.id
           JOIN tag_dimensions d ON t.dimension_id = d.id
           WHERE wt.work_id IN ({ph})
           ORDER BY d.id, t.name""",
        work_ids,
    ).fetchall()
    tags_by_work = {}
    for tr in tag_rows:
        d = dict(tr)
        wid = d.pop("work_id")
        tags_by_work.setdefault(wid, []).append(d)

    works = []
    for r in rows:
        w = dict(r)
        w["materials"] = materials_by_work.get(w["id"], [])
        w["tags"] = tags_by_work.get(w["id"], [])
        works.append(w)
    return works, total


def get_all_materials(tag_filter=None, sort_order="desc", page=1, per_page=20):
    conn = get_conn()
    base_sql = """
        SELECT m.*, w.title as work_title, w.platform, w.id as work_id,
               w.media_dir, a.name as author_name
        FROM materials m
        JOIN works w ON m.work_id = w.id
        LEFT JOIN authors a ON w.author_id = a.id
    """
    params = []
    if tag_filter:
        conditions = []
        for dim_id, tag_ids in tag_filter.items():
            if tag_ids:
                placeholders = ",".join("?" * len(tag_ids))
                conditions.append(f"""
                    m.id IN (
                        SELECT material_id FROM (
                            SELECT material_id FROM material_tags mt
                            JOIN tags t ON mt.tag_id = t.id
                            WHERE t.dimension_id = {dim_id}
                            AND mt.tag_id IN ({placeholders})
                            UNION
                            SELECT m2.id FROM materials m2
                            JOIN work_tags wt ON wt.work_id = m2.work_id
                            JOIN tags t2 ON wt.tag_id = t2.id
                            WHERE t2.dimension_id = {dim_id}
                            AND wt.tag_id IN ({placeholders})
                        )
                    )
                """)
                params.extend(tag_ids)
                params.extend(tag_ids)
        if conditions:
            base_sql += " WHERE " + " AND ".join(conditions)

    count_sql = f"SELECT COUNT(*) as total FROM ({base_sql})"
    total = conn.execute(count_sql, params).fetchone()["total"]

    sql = base_sql + " ORDER BY w.created_at " + ("DESC" if sort_order != "asc" else "ASC") + ", m.sort_order"
    if per_page > 0:
        offset = (page - 1) * per_page
        sql += f" LIMIT {per_page} OFFSET {offset}"
    rows = conn.execute(sql, params).fetchall()
    if not rows:
        return [], total

    material_ids = [r["id"] for r in rows]
    ph = ",".join("?" * len(material_ids))

    own_rows = conn.execute(
        f"SELECT material_id, tag_id FROM material_tags WHERE material_id IN ({ph})",
        material_ids,
    ).fetchall()
    own_by_mat = {}
    for orow in own_rows:
        own_by_mat.setdefault(orow["material_id"], set()).add(orow["tag_id"])

    inherited_rows = conn.execute(
        f"""SELECT m.id as material_id, wt.tag_id
            FROM materials m
            JOIN work_tags wt ON wt.work_id = m.work_id
            WHERE m.id IN ({ph})""",
        material_ids,
    ).fetchall()
    all_tags_by_mat = {mid: set() for mid in material_ids}
    for orow in own_rows:
        all_tags_by_mat[orow["material_id"]].add(orow["tag_id"])
    for irow in inherited_rows:
        all_tags_by_mat[irow["material_id"]].add(irow["tag_id"])

    all_tag_ids = set()
    for tids in all_tags_by_mat.values():
        all_tag_ids.update(tids)

    tag_details = {}
    if all_tag_ids:
        tph = ",".join("?" * len(all_tag_ids))
        tag_rows = conn.execute(
            f"""SELECT t.id, t.name, d.id as dimension_id, d.name as dimension_name,
                      d.type as dimension_type
                FROM tags t
                JOIN tag_dimensions d ON t.dimension_id = d.id
                WHERE t.id IN ({tph})
                ORDER BY d.id, t.name""",
            list(all_tag_ids),
        ).fetchall()
        for tr in tag_rows:
            tag_details[tr["id"]] = dict(tr)

    materials = []
    for r in rows:
        m = dict(r)
        mid = m["id"]
        own_set = own_by_mat.get(mid, set())
        tag_ids = all_tags_by_mat.get(mid, set())
        sorted_tag_ids = sorted(
            tag_ids,
            key=lambda tid: (tag_details[tid]["dimension_id"], tag_details[tid]["name"]),
        )
        m["tags"] = []
        for tid in sorted_tag_ids:
            if tid in tag_details:
                d = dict(tag_details[tid])
                d["source"] = "own" if tid in own_set else "inherited"
                m["tags"].append(d)
        materials.append(m)
    return materials, total


def get_work_materials(work_id):
    conn = get_conn()
    rows = conn.execute(
        """SELECT * FROM materials WHERE work_id = ? ORDER BY sort_order, id""",
        (work_id,),
    ).fetchall()
    return [dict(r) for r in rows]


@auto_rollback
def delete_work(work_id):
    conn = get_conn()
    work = conn.execute("SELECT media_dir FROM works WHERE id=?", (work_id,)).fetchone()
    if work:
        full_path = MEDIA_DIR / work["media_dir"]
        if full_path.exists() and full_path.is_dir():
            safe_base = MEDIA_DIR.resolve()
            if full_path.resolve().is_relative_to(safe_base):
                shutil.rmtree(str(full_path))
    conn.execute("DELETE FROM works WHERE id=?", (work_id,))
    conn.commit()


@auto_rollback
def delete_material(material_id):
    conn = get_conn()
    mat = conn.execute("SELECT filename, work_id FROM materials WHERE id=?", (material_id,)).fetchone()
    if mat:
        work = conn.execute("SELECT media_dir FROM works WHERE id=?", (mat["work_id"],)).fetchone()
        if work:
            file_path = MEDIA_DIR / work["media_dir"] / mat["filename"]
            safe_base = MEDIA_DIR.resolve()
            if file_path.resolve().is_relative_to(safe_base) and file_path.exists():
                file_path.unlink()
    conn.execute("DELETE FROM materials WHERE id=?", (material_id,))
    conn.commit()


@auto_rollback
def reorder_materials(work_id, material_ids):
    conn = get_conn()
    for idx, mid in enumerate(material_ids):
        conn.execute(
            "UPDATE materials SET sort_order=? WHERE id=? AND work_id=?",
            (idx, mid, work_id),
        )
    conn.commit()


def get_all_dimensions():
    conn = get_conn()
    rows = conn.execute("SELECT * FROM tag_dimensions ORDER BY sort_order, id").fetchall()
    return [dict(r) for r in rows]


def get_all_tags(dimension_id=None):
    conn = get_conn()
    if dimension_id:
        rows = conn.execute(
            "SELECT * FROM tags WHERE dimension_id=? ORDER BY starred DESC, sort_order, id",
            (dimension_id,),
        ).fetchall()
    else:
        rows = conn.execute(
            "SELECT * FROM tags ORDER BY dimension_id, starred DESC, sort_order, id"
        ).fetchall()
    return [dict(r) for r in rows]


@auto_rollback
def create_dimension(name):
    conn = get_conn()
    cur = conn.cursor()
    max_order = cur.execute("SELECT COALESCE(MAX(sort_order), -1) AS max_order FROM tag_dimensions").fetchone()[
        "max_order"
    ]
    cur.execute(
        "INSERT INTO tag_dimensions (name, type, sort_order, created_at) VALUES (?, 'custom', ?, ?)",
        (name, max_order + 1, datetime.now().isoformat()),
    )
    conn.commit()
    return cur.lastrowid


@auto_rollback
def rename_dimension(dim_id, name):
    conn = get_conn()
    row = conn.execute("SELECT type FROM tag_dimensions WHERE id=?", (dim_id,)).fetchone()
    if row and row["type"] == "fixed":
        raise ValueError("固定维度不可修改")
    conn.execute("UPDATE tag_dimensions SET name=? WHERE id=?", (name, dim_id))
    conn.commit()


@auto_rollback
def delete_dimension(dim_id):
    conn = get_conn()
    row = conn.execute("SELECT type FROM tag_dimensions WHERE id=?", (dim_id,)).fetchone()
    if row and row["type"] == "fixed":
        raise ValueError("固定维度不可删除")
    conn.execute("DELETE FROM tag_dimensions WHERE id=?", (dim_id,))
    conn.commit()


@auto_rollback
def create_tag(dimension_id, name):
    conn = get_conn()
    cur = conn.cursor()
    max_order = cur.execute(
        "SELECT COALESCE(MAX(sort_order), -1) AS max_order FROM tags WHERE dimension_id=?",
        (dimension_id,),
    ).fetchone()["max_order"]
    cur.execute(
        "INSERT INTO tags (dimension_id, name, sort_order, created_at) VALUES (?, ?, ?, ?)",
        (dimension_id, name, max_order + 1, datetime.now().isoformat()),
    )
    conn.commit()
    return cur.lastrowid


@auto_rollback
def rename_tag(tag_id, name):
    conn = get_conn()
    cur = conn.cursor()
    row = cur.execute(
        """SELECT t.id, d.type FROM tags t
           JOIN tag_dimensions d ON t.dimension_id = d.id
           WHERE t.id=?""",
        (tag_id,),
    ).fetchone()
    if row and row["type"] == "fixed":
        raise ValueError("固定维度下的标签不可修改")
    cur.execute("UPDATE tags SET name=? WHERE id=?", (name, tag_id))
    conn.commit()


@auto_rollback
def delete_tag(tag_id):
    conn = get_conn()
    cur = conn.cursor()
    row = cur.execute(
        """SELECT d.type FROM tags t
           JOIN tag_dimensions d ON t.dimension_id = d.id
           WHERE t.id=?""",
        (tag_id,),
    ).fetchone()
    if row and row["type"] == "fixed":
        raise ValueError("固定维度下的标签不可删除")
    cur.execute("DELETE FROM tags WHERE id=?", (tag_id,))
    conn.commit()


@auto_rollback
def remove_work_tag(work_id, tag_id):
    conn = get_conn()
    conn.execute(
        "DELETE FROM work_tags WHERE work_id=? AND tag_id=?",
        (work_id, tag_id),
    )
    conn.commit()


@auto_rollback
def remove_material_tag(material_id, tag_id):
    conn = get_conn()
    conn.execute(
        "DELETE FROM material_tags WHERE material_id=? AND tag_id=?",
        (material_id, tag_id),
    )
    conn.commit()


@auto_rollback
def sync_work_tags(work_id, tag_ids):
    conn = get_conn()
    current = set(
        r["tag_id"] for r in conn.execute("SELECT tag_id FROM work_tags WHERE work_id=?", (work_id,)).fetchall()
    )
    new_set = set(tag_ids)
    to_delete = current - new_set
    to_insert = new_set - current
    if to_delete:
        conn.executemany(
            "DELETE FROM work_tags WHERE work_id=? AND tag_id=?",
            [(work_id, tid) for tid in to_delete],
        )
    if to_insert:
        conn.executemany(
            "INSERT OR IGNORE INTO work_tags (work_id, tag_id) VALUES (?, ?)",
            [(work_id, tid) for tid in to_insert],
        )
    conn.commit()


@auto_rollback
def sync_material_tags(material_id, tag_ids):
    conn = get_conn()
    current = set(
        r["tag_id"]
        for r in conn.execute("SELECT tag_id FROM material_tags WHERE material_id=?", (material_id,)).fetchall()
    )
    new_set = set(tag_ids)
    to_delete = current - new_set
    to_insert = new_set - current
    if to_delete:
        conn.executemany(
            "DELETE FROM material_tags WHERE material_id=? AND tag_id=?",
            [(material_id, tid) for tid in to_delete],
        )
    if to_insert:
        conn.executemany(
            "INSERT OR IGNORE INTO material_tags (material_id, tag_id) VALUES (?, ?)",
            [(material_id, tid) for tid in to_insert],
        )
    conn.commit()


@auto_rollback
def batch_add_work_tags(work_ids, tag_ids):
    conn = get_conn()
    pairs = [(wid, tid) for wid in work_ids for tid in tag_ids]
    if pairs:
        conn.executemany(
            "INSERT OR IGNORE INTO work_tags (work_id, tag_id) VALUES (?, ?)",
            pairs,
        )
        conn.commit()


@auto_rollback
def batch_add_material_tags(material_ids, tag_ids):
    conn = get_conn()
    pairs = [(mid, tid) for mid in material_ids for tid in tag_ids]
    if pairs:
        conn.executemany(
            "INSERT OR IGNORE INTO material_tags (material_id, tag_id) VALUES (?, ?)",
            pairs,
        )
        conn.commit()


def find_work_by_media_dir(media_dir):
    conn = get_conn()
    row = conn.execute("SELECT id FROM works WHERE media_dir=?", (media_dir,)).fetchone()
    return row["id"] if row else None


def find_work_by_video_id(video_id, platform):
    conn = get_conn()
    row = conn.execute(
        "SELECT id FROM works WHERE video_id=? AND platform=?",
        (video_id, platform),
    ).fetchone()
    return row["id"] if row else None


def get_work_material_filenames(work_id):
    conn = get_conn()
    rows = conn.execute(
        "SELECT filename FROM materials WHERE work_id=?",
        (work_id,),
    ).fetchall()
    return {r["filename"] for r in rows}


def get_all_planner_layouts():
    conn = get_conn()
    rows = conn.execute("SELECT * FROM planner_layouts ORDER BY updated_at DESC").fetchall()
    return [dict(r) for r in rows]


@auto_rollback
def create_planner_layout(name, config):
    conn = get_conn()
    now = datetime.now().isoformat()
    cur = conn.cursor()
    cur.execute(
        "INSERT INTO planner_layouts (name, config, created_at, updated_at) VALUES (?, ?, ?, ?)",
        (name, json.dumps(config), now, now),
    )
    conn.commit()
    return cur.lastrowid


@auto_rollback
def update_planner_layout(layout_id, name=None, config=None):
    conn = get_conn()
    now = datetime.now().isoformat()
    if name is not None and config is not None:
        conn.execute(
            "UPDATE planner_layouts SET name=?, config=?, updated_at=? WHERE id=?",
            (name, json.dumps(config), now, layout_id),
        )
    elif name is not None:
        conn.execute(
            "UPDATE planner_layouts SET name=?, updated_at=? WHERE id=?",
            (name, now, layout_id),
        )
    elif config is not None:
        conn.execute(
            "UPDATE planner_layouts SET config=?, updated_at=? WHERE id=?",
            (json.dumps(config), now, layout_id),
        )
    conn.commit()


@auto_rollback
def delete_planner_layout(layout_id):
    conn = get_conn()
    conn.execute("DELETE FROM planner_layouts WHERE id=?", (layout_id,))
    conn.commit()


@auto_rollback
def insert_personal_upload(filename, original_filename, mtype, file_size=None, batch_id=""):
    conn = get_conn()
    cur = conn.cursor()
    cur.execute(
        "INSERT INTO personal_uploads (filename, original_filename, type, file_size, batch_id, created_at) VALUES (?, ?, ?, ?, ?, ?)",
        (filename, original_filename, mtype, file_size, batch_id, datetime.now().isoformat()),
    )
    conn.commit()
    return cur.lastrowid


def get_all_personal_uploads():
    conn = get_conn()
    rows = conn.execute(
        "SELECT * FROM personal_uploads ORDER BY batch_id DESC, original_filename ASC, id ASC"
    ).fetchall()
    return [dict(r) for r in rows]


def get_personal_upload(upload_id):
    conn = get_conn()
    row = conn.execute("SELECT * FROM personal_uploads WHERE id=?", (upload_id,)).fetchone()
    return dict(row) if row else None


@auto_rollback
def delete_personal_upload(upload_id):
    conn = get_conn()
    conn.execute("DELETE FROM personal_uploads WHERE id=?", (upload_id,))
    conn.commit()


@auto_rollback
def delete_personal_uploads(upload_ids):
    conn = get_conn()
    conn.executemany("DELETE FROM personal_uploads WHERE id=?", [(uid,) for uid in upload_ids])
    conn.commit()
