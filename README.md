# MyLike + Media-Parser Docker 部署

短视频素材采集与管理系统，由两个服务组成：

| 服务 | 端口 | 说明 |
|---|---|---|
| **MyLike** | 5000 | 前端界面 + 素材库管理 + 导入下载 |
| **media-parser** | 8051 | 多平台链接解析引擎（50+ 平台） |

```
用户浏览器 → MyLike (:5000) → media-parser (:8051) → 各平台
                                ↓
                         解析无水印地址
                                ↓
                    MyLike 下载 + 生成缩略图 + 入库
```

---

## 前置要求

- Docker Engine >= 20.10
- Docker Compose V2（`docker compose` 命令）
- 磁盘空间 >= 2GB
- 容器需能访问外网

---

## 部署步骤

### 第 1 步：克隆本仓库

```bash
git clone <your-repo-url> MyLike_Docker
cd MyLike_Docker
```

此时项目结构如下，但 **`media-parser/` 目录不存在**（已被 .gitignore 屏蔽）：

```
MyLike_Docker/
├── MyLike/              # MyLike 服务源码（已包含）
├── docker-compose.yml   # 双服务编排
├── .env.example         # 环境变量模板
└── .gitignore
```

### 第 2 步：手动克隆 media-parser 源码

media-parser 是独立开源项目，需手动拉取到本项目下：

```bash
git clone https://github.com/ucmao/media-parser.git media-parser
```

> 如果网络受限无法访问 GitHub，可从其他镜像站拉取，或将已有的 media-parser 源码目录复制到 `media-parser/` 下。
>
> 克隆后确认目录结构：
> ```bash
> ls media-parser/Dockerfile
> ls media-parser/app.py
> ```
> 两个文件都存在即可。

### 第 3 步：配置环境变量（可选）

```bash
cp .env.example .env
```

编辑 `.env`，按需填写：

| 变量 | 说明 | 不配置的后果 |
|---|---|---|
| `MEDIA_PARSER_API_KEY` | MyLike 调用 media-parser 的认证密钥 | 使用默认值，能用但不安全 |
| `SECRET_KEY` | Flask 会话加密密钥 | 自动生成并持久化到 `data/.secret_key` |
| `TRUST_PROXY_HEADERS` | 是否信任 Nginx 反代头 | 默认 `false`，直接访问没问题 |
| `XHS_COOKIE` 等 | 各平台 Cookie | 大部分平台免 Cookie 即可解析 |

> **不创建 `.env` 也能开箱即用**，所有参数都有默认值。

### 第 4 步：构建并启动

```bash
docker compose up -d --build
```

首次构建会下载 Python 基础镜像、安装依赖，耗时 3-10 分钟。

### 第 5 步：验证服务

```bash
# 查看容器状态（两个服务都应为 Up）
docker compose ps

# 检查 media-parser 健康状态
curl http://localhost:8051/api/health
# 期望返回: {"status":"ok"}

# 查看日志（确认无报错）
docker compose logs -f
```

### 第 6 步：访问应用

| 服务 | 地址 | 说明 |
|---|---|---|
| MyLike | `http://localhost:5000` | 前端界面，导入和管理素材 |
| media-parser | `http://localhost:8051` | 控制台，首次访问需创建管理员账号 |

---

## 镜像源说明（NAS / 非华为内网部署必读）

两个 Dockerfile 默认使用华为内网镜像源，非华为网络环境需修改为公网源：

| 类型 | 当前源（华为内网） | 公网官方源 | 国内加速源 |
|---|---|---|---|
| APT | `mirrors.tools.huawei.com` | `deb.debian.org` / `security.debian.org` | `mirrors.aliyun.com` |
| PIP | `mirrors.tools.huawei.com/pypi/simple` | `pypi.org/simple` | `mirrors.aliyun.com/pypi/simple` |

需修改的文件：

1. `media-parser/Dockerfile` — 第 13-14 行（APT）、第 19 行（PIP）
2. `MyLike/Dockerfile` — 第 10-11 行（APT）、第 17 行（PIP）

将 `mirrors.tools.huawei.com` 替换为公网源即可。

---

## 日常操作

```bash
# 启动
docker compose up -d

# 停止
docker compose down

# 重启单个服务
docker compose restart mylike
docker compose restart media-parser

# 查看状态
docker compose ps

# 查看日志
docker compose logs -f mylike
docker compose logs -f media-parser

# 更新代码后重新构建
docker compose up -d --build
```

---

## 数据持久化

| 宿主机路径 | 容器路径 | 说明 |
|---|---|---|
| `./media-parser/data` | `/app/data` | media-parser 数据库（用户、API Key、日志） |
| `./media-parser/logs` | `/app/logs` | media-parser 运行日志 |
| `./MyLike/media` | `/app/media` | 下载的媒体文件 + 缩略图 |
| `./MyLike/data` | `/app/data` | MyLike 数据库 |

容器重建后数据不丢失。备份时停服后打包上述目录即可。

---

## 使用流程

1. 浏览器打开 `http://localhost:5000`
2. 进入"导入"页面
3. 粘贴抖音/小红书/B站等平台的分享链接
4. 点击导入，系统自动：解析链接 → 下载媒体 → 生成缩略图 → 写入数据库
5. 在"素材库"页面浏览和管理已导入的素材

---

## 端口冲突处理

如果 5000 或 8051 端口被占用，修改 `docker-compose.yml` 中的端口映射：

```yaml
ports:
  - "5001:5000"    # 宿主机 5001 → 容器 5000
  - "8052:8051"    # 宿主机 8052 → 容器 8051
```

---

## 常见问题

### Q: `docker compose up` 报错连接不到 Docker daemon

Docker Desktop 未启动，先启动 Docker Desktop 再重试。

### Q: media-parser 构建失败，pip install 超时

Dockerfile 中使用了华为内网源，非华为网络无法访问。按上文"镜像源说明"修改为公网源。

### Q: 容器启动后视频缩略图不生成

MyLike 容器内已安装 ffmpeg，如仍失败检查日志：`docker compose logs mylike`。

### Q: 如何配置 Nginx 反向代理

将 `.env` 中 `TRUST_PROXY_HEADERS=true`，然后在 Nginx 中配置 `proxy_pass` 到对应端口，并传递 `X-Forwarded-Proto` 和 `X-Forwarded-Host` 头。
