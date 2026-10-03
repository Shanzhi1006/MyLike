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

## 一、前置准备

### 1.1 安装 Docker

部署前请确保你的机器已安装 **Docker Engine >= 20.10** 和 **Docker Compose V2**。

#### Windows / macOS

1. 下载并安装 [Docker Desktop](https://www.docker.com/products/docker-desktop/)
2. 启动 Docker Desktop，等待左下角图标变为绿色（Running）
3. 打开终端（PowerShell / Terminal），验证安装：

```bash
docker --version
# 期望输出: Docker version 24.x.x 或更高

docker compose version
# 期望输出: Docker Compose version v2.x.x
```

#### Linux（以 Ubuntu 为例）

```bash
# 安装 Docker
curl -fsSL https://get.docker.com | sudo sh

# 启动 Docker 服务
sudo systemctl start docker
sudo systemctl enable docker

# 将当前用户加入 docker 组（免 sudo），需重新登录生效
sudo usermod -aG docker $USER

# 验证
docker --version
docker compose version
```

### 1.2 验证 Docker 就绪

```bash
# 运行测试容器，确认 Docker 引擎正常工作
docker run --rm hello-world
```

如果看到 "Hello from Docker!" 字样，说明 Docker 已就绪。

### 1.3 其他要求

- 磁盘空间 >= 2GB（用于镜像构建 + 媒体文件存储）
- 容器需能访问外网（解析平台链接时需要）
- 确保本机 **5000** 和 **8051** 端口未被占用

```bash
# 检查端口是否被占用（Linux/macOS）
lsof -i :5000
lsof -i :8051

# Windows PowerShell
netstat -ano | findstr ":5000"
netstat -ano | findstr ":8051"
```

如果端口被占用，请在后续步骤中修改 `docker-compose.yml` 的端口映射。

---

## 二、部署步骤（详细）

### 第 1 步：克隆本仓库

```bash
git clone <your-repo-url> MyLike_Docker
cd MyLike_Docker
```

克隆后目录结构如下：

```
MyLike_Docker/
├── mylike/              # MyLike 服务源码（已包含）
├── docker-compose.yml   # 双服务编排文件
├── .env.example         # 环境变量模板
├── .gitignore
└── README.md
```

> **注意**：此时 `media-parser/` 目录**不存在**，因为它是独立的第三方开源项目，已被 `.gitignore` 屏蔽，需要手动拉取。

---

### 第 2 步：克隆 media-parser 源码

media-parser 是独立的开源项目（GitHub: [ucmao/media-parser](https://github.com/ucmao/media-parser)），不在本仓库中上传，需要手动 clone 到本项目目录下：

```bash
# 确保你在 MyLike_Docker 目录下
git clone https://github.com/ucmao/media-parser.git media-parser
```

> **网络受限无法访问 GitHub？**
>
> 可以使用镜像站加速拉取：
> ```bash
> git clone https://ghproxy.com/https://github.com/ucmao/media-parser.git media-parser
> ```
>
> 或者手动下载 ZIP 包解压到 `media-parser/` 目录。

**验证克隆成功：**

```bash
# 检查关键文件是否存在
ls media-parser/Dockerfile
ls media-parser/app.py
ls media-parser/docker-entrypoint.sh
```

三个文件都存在即说明克隆正确。

---

### 第 3 步：修改 docker-entrypoint.sh 行尾符为 LF（重要）

media-parser 项目中的 `docker-entrypoint.sh` 文件在 Windows 上 clone 时可能会被自动转换为 CRLF（`\r\n`）行尾符，这会导致 **Linux 容器内执行脚本报错**（`bad interpreter: No such file or directory`）。

必须将其改为 **LF**（`\n`）行尾符。

#### 方法 A：使用 VS Code（推荐，小白友好）

1. 用 VS Code 打开 `media-parser/docker-entrypoint.sh`
2. 点击编辑器右下角状态栏的 **"CRLF"** 按钮
3. 在弹出菜单中选择 **"LF"**
4. 保存文件（Ctrl + S）

#### 方法 B：使用 Git 命令

```bash
# 在项目根目录执行
git -C media-parser config core.autocrlf false
git -C media-parser rm --cached docker-entrypoint.sh
git -C media-parser checkout -- docker-entrypoint.sh
```

#### 方法 C：使用 sed 命令（Linux/macOS/Git Bash）

```bash
sed -i 's/\r$//' media-parser/docker-entrypoint.sh
```

#### 验证已改为 LF

```bash
# Linux/macOS
file media-parser/docker-entrypoint.sh
# 期望输出包含 "ASCII text" 而非 "with CRLF line terminators"

# 或者检查是否包含 \r
cat -A media-parser/docker-entrypoint.sh | head -3
# LF 格式行尾是 $，CRLF 格式行尾是 ^M$（如果看到 ^M 说明还是 CRLF）
```

---

### 第 4 步：先单独启动 media-parser 服务

由于 MyLike 需要调用 media-parser 的 API，我们需要**先启动 media-parser**，登录管理员账号并生成一个 API Token，然后再配置 MyLike。

#### 4.1 创建 .env 文件

```bash
# 复制环境变量模板
cp .env.example .env
```

#### 4.2 仅构建并启动 media-parser

```bash
# 只启动 media-parser 一个服务（MyLike �依赖 media-parser 健康检查通过才会启动，所以此时不会自动启动）
docker compose up -d --build media-parser
```

首次构建会下载 Python 基础镜像并安装依赖，耗时约 3-10 分钟，请耐心等待。

#### 4.3 验证 media-parser 已正常运行

```bash
# 查看容器状态（应为 Up）
docker compose ps media-parser

# 检查健康状态接口
curl http://localhost:8051/api/health
# 期望返回: {"status":"ok"}

# 查看启动日志，确认无报错
docker compose logs media-parser
```

---

### 第 5 步：登录 media-parser 管理后台，创建无限制 Token

#### 5.1 首次访问并创建超级管理员账号

1. 浏览器打开：**http://localhost:8051/auth/setup**
2. 按页面提示填写管理员用户名和密码，完成超级管理员账号创建
3. 创建成功后，`/auth/setup` 入口会自动关闭

> 如果页面显示 "初始化已完成" 或类似提示，说明管理员账号之前已创建过，直接访问 **http://localhost:8051** 登录即可。

#### 5.2 登录管理控制台

1. 访问 **http://localhost:8051**
2. 使用刚才创建的管理员账号登录

#### 5.3 生成无限制 API Key

1. 进入控制台的 **API Key 管理** 页面
2. 点击 **新建 / 生成 API Key**
3. 将该 Key 的权限设置为 **无限制**（不限有效期、不限积分、不限调用次数）
4. 复制生成的 API Key（格式类似 `mp-xxxxxxxxxxxxxxxxxxxxxxxx`）

> **请妥善保存这个 Key**，下一步需要填入 `.env` 文件。

---

### 第 6 步：配置 .env 文件

编辑项目根目录下的 `.env` 文件，更新以下关键配置：

```bash
# 使用你喜欢的编辑器打开
# VS Code:  code .env
# Vim:      vim .env
# Nano:     nano .env
```

需要修改的内容：

```bash
# ==========================================
# 1. 镜像源配置（根据你的网络环境选择）
# ==========================================

# 国内公网（默认，阿里云）：
APT_MIRROR=mirrors.aliyun.com
PIP_MIRROR=mirrors.aliyun.com/pypi/simple

# 海外 / 国际网络：
# APT_MIRROR=deb.debian.org
# PIP_MIRROR=pypi.org/simple

# 清华（备选）:  
# APT_MIRROR=mirrors.tuna.tsinghua.edu.cn
# PIP_MIRROR=pypi.tuna.tsinghua.edu.cn/simple

# ==========================================
# 2. MyLike 调用 media-parser 的 API Key
# ==========================================
# 把第 5 步生成的无限制 API Key 填入这里
MEDIA_PARSER_API_KEY=mp-你刚才复制的APIKey

# ==========================================
# 3. 其他配置（一般无需修改）
# ==========================================
SECRET_KEY=
TRUST_PROXY_HEADERS=false

# ==========================================
# 4. 平台 Cookie（可选，按需配置）
# ==========================================
XHS_COOKIE=
DOUYIN_COOKIE=
DOUBAO_COOKIE=
YUANBAO_COOKIE=
PINDUODUO_COOKIE=
KUAISHOU_COOKIE=
JIMENG_COOKIE=
WEIBO_COOKIE=
```

**关键确认项：**

| 配置项 | 说明 |
|---|---|
| `MEDIA_PARSER_API_KEY` | **必须填写**第 5 步生成的 API Key，否则 MyLike 无法调用 media-parser |
| `APT_MIRROR` / `PIP_MIRROR` | 根据你的网络环境选择，影响构建速度 |

---

### 第 7 步：启动全部服务

```bash
# 构建并启动所有服务（包括 MyLike）
docker compose up -d --build
```

> 因为 media-parser 已经构建过，这次只需构建 MyLike，速度较快。

#### 验证所有服务正常

```bash
# 1. 查看容器状态 —— 两个服务都应为 Up
docker compose ps

# 期望看到：
# NAME            STATUS                   PORTS
# media-parser    Up (healthy)             0.0.0.0:8051->8051/tcp
# mylike          Up                       0.0.0.0:5000->5000/tcp

# 2. 检查 media-parser 健康状态
curl http://localhost:8051/api/health
# 期望返回: {"status":"ok"}

# 3. 检查 MyLike 是否正常响应
curl http://localhost:5000
# 期望返回 HTML 页面内容

# 4. 查看实时日志，确认无报错
docker compose logs -f
# 按 Ctrl+C 退出日志查看
```

如果两个服务都显示 `Up` 且日志无报错，恭喜你，部署成功！

---

## 三、访问应用

| 服务 | 地址 | 说明 |
|---|---|---|
| **MyLike** | http://localhost:5000 | 前端主界面，导入和管理素材 |
| **media-parser** | http://localhost:8051 | 解析引擎控制台，管理 API Key 和平台配置 |

打开浏览器访问 **http://localhost:5000** 即可开始使用。

---

## 四、项目架构

### 整体架构

```
┌─────────────┐     HTTP/API      ┌──────────────┐     HTTP      ┌──────────┐
│  用户浏览器   │ ──────────────→  │   MyLike     │ ──────────→  │  各平台   │
│             │                   │  (:5000)     │              │ (抖音等)  │
└─────────────┘                   └──────┬───────┘              └──────────┘
                                         │ 调用解析 API
                                         ▼
                                  ┌──────────────┐
                                  │ media-parser │
                                  │  (:8051)     │
                                  └──────────────┘
```

### 服务职责

| 服务 | 职责 |
|---|---|
| **MyLike** | Web 前端界面、素材导入、素材库管理、标签管理、下载与缩略图生成、数据库管理 |
| **media-parser** | 多平台链接解析（50+ 平台）、API Key 鉴权、用户与权限管理、QPS 限流 |

### MyLike 主要模块

| 模块 | 说明 |
|---|---|
| **导入** (`import.html`) | 粘贴平台分享链接，自动解析 → 下载 → 生成缩略图 → 入库 |
| **素材库** (`library.html`) | 浏览、搜索、管理已导入的素材 |
| **标签管理** (`tags.html`) | 为素材打标签，分类管理 |
| **规划板** (`planner.html`) | 素材规划与预览 |
| **系统设置** (`system_api.py`) | 系统配置与状态查看 |

---

## 五、使用流程

1. 浏览器打开 **http://localhost:5000**
2. 进入 **"导入"** 页面
3. 粘贴抖音 / 小红书 / B站等平台的分享链接
4. 点击导入，系统自动完成：解析链接 → 下载媒体 → 生成缩略图 → 写入数据库
5. 在 **"素材库"** 页面浏览和管理已导入的素材
6. 使用 **标签** 功能对素材进行分类

---

## 六、日常运维命令

```bash
# 启动所有服务
docker compose up -d

# 停止所有服务
docker compose down

# 重启单个服务
docker compose restart mylike
docker compose restart media-parser

# 查看服务状态
docker compose ps

# 查看实时日志
docker compose logs -f mylike
docker compose logs -f media-parser

# 更新代码后重新构建
docker compose up -d --build

# 完全清理（停止 + 删除容器 + 删除镜像）
docker compose down --rmi all
```

---

## 七、数据持久化

| 宿主机路径 | 容器路径 | 说明 |
|---|---|---|
| `./media-parser/data` | `/app/data` | media-parser 数据库（用户、API Key、日志） |
| `./media-parser/logs` | `/app/logs` | media-parser 运行日志 |
| `./mylike/media` | `/app/media` | 下载的媒体文件 + 缩略图 |
| `./mylike/data` | `/app/data` | MyLike 数据库 |

容器重建后数据不丢失。备份时停服后打包上述目录即可。

---

## 八、镜像源配置

两个 Dockerfile 的 APT 和 PIP 镜像源均通过 `.env` 文件中的构建参数控制，**无需修改 Dockerfile**。

APT 源内置自动回退机制：如果配置的镜像源在 60 秒内无法访问，会自动回退到 Debian 官方源 `deb.debian.org`。

### 镜像源对照表

| 类型 | 国内公网（默认） | 海外官方 | 清华备选 |
|---|---|---|---|
| APT | `mirrors.aliyun.com` | `deb.debian.org` | `mirrors.tuna.tsinghua.edu.cn` |
| PIP | `mirrors.aliyun.com/pypi/simple` | `pypi.org/simple` | `pypi.tuna.tsinghua.edu.cn/simple` |

> 修改 `.env` 中的镜像源后需要重新构建：`docker compose up -d --build`

---

## 九、常见问题

### Q: `docker compose up` 报错连接不到 Docker daemon

Docker Desktop 未启动，先启动 Docker Desktop 再重试。

### Q: 构建失败，apt-get 或 pip install 超时

镜像源与当前网络环境不匹配。在 `.env` 中配置正确的 `APT_MIRROR` 和 `PIP_MIRROR`，然后重新构建：

```bash
docker compose up -d --build
```

### Q: media-parser 容器启动报 `bad interpreter` 或 `No such file` 错误

`docker-entrypoint.sh` 文件行尾符为 CRLF，请按 **第 3 步** 将其改为 LF。

### Q: MyLike 导入素材时提示解析失败

1. 检查 `MEDIA_PARSER_API_KEY` 是否正确填写了 media-parser 生成的 API Key
2. 检查 media-parser 容器是否正常运行：`docker compose ps media-parser`
3. 查看 media-parser 日志：`docker compose logs media-parser`

### Q: 端口 5000 或 8051 被占用

修改 `docker-compose.yml` 中的端口映射：

```yaml
ports:
  - "5001:5000"    # 宿主机 5001 → 容器 5000
  - "8052:8051"    # 宿主机 8052 → 容器 8051
```

### Q: 如何配置 Nginx 反向代理

将 `.env` 中 `TRUST_PROXY_HEADERS=true`，然后在 Nginx 中配置 `proxy_pass` 到对应端口，并传递 `X-Forwarded-Proto` 和 `X-Forwarded-Host` 头。

### Q: 容器启动后视频缩略图不生成

MyLike 容器内已安装 ffmpeg，如仍失败检查日志：`docker compose logs mylike`。