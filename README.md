# 乡居共治｜农村人居环境数字体检与微更新协同平台

本项目包含独立运行的**桌面管理端、手机村民 H5 和本地 Node API**：

- **可视化事件处理工作台**：3D 实景、二维投影、小地图/分屏、事件定位、现场照片、受理与办结、演示微更新。
- **智慧治理终端**：办结工作留痕、月度工作总结、带原事件依据的治理分析助手。
- **手机村民端**：跟随电脑真实村庄、地图选点、文字/照片/语音上报、草稿与办理进度。

**首次打开默认使用「黎槎八卦村」作为 3D 实景 Demo，需要联网加载 Sketchfab。** 已保存过场景或模型的浏览器继续恢复自己的选择。「青禾村 Demo」保留为可选的程序化场景，用于离线模型演示和预设设施改造，不是八卦村真实数据。

本文合并原 `README.md` 与 `README-部署说明.md`，按当前实现更新。更新日期：**2026-10-22**。

## 目录

1. [环境配置与代码初始化](#1-环境配置与代码初始化)
2. [API 与大模型配置](#2-api-与大模型配置)
3. [项目运行与手机 HTTPS](#3-项目运行与手机-https)
4. [3D 模型格式、资源来源与导入](#4-3d-模型格式资源来源与导入)
5. [功能使用指导](#5-功能使用指导)
6. [构建、部署与数据备份](#6-构建部署与数据备份)
7. [检查与常见问题](#7-检查与常见问题)
8. [下一步计划](#8-下一步计划)
9. [代码结构与详细文档](#9-代码结构与详细文档)

## 1. 环境配置与代码初始化

### 1.1 安装环境

| 项目 | 要求与说明 |
| --- | --- |
| Node.js | 推荐 **24 LTS**，项目当前运行于 Node 24；也可使用 Node 22.12+。锁定的 Vite 要求 `^20.19.0 \|\| >=22.12.0`，新环境建议选受维护的 LTS |
| npm | 随 Node 安装，使用仓库的 `package-lock.json` 锁定依赖 |
| 浏览器 | 支持 WebGL 和 IndexedDB 的现代浏览器，开启硬件加速；手机录音需要可信 HTTPS 和麦克风权限 |
| 网络 | 八卦村在线模型需要访问 Sketchfab；模型服务需要服务端能访问阿里云百炼 |
| 可选工具 | mkcert 用于真机局域网 HTTPS；Blender 或源建模软件用于导出 GLB/glTF |

从 [Node.js 官方下载页](https://nodejs.org/en/download)安装 LTS，重新打开终端并检查：

```sh
node -v
npm -v
```

当前不需要安装 Python、FastAPI、PostgreSQL 或 PostGIS。主要技术栈为 React 19、TypeScript、Vite、Three.js、React Three Fiber 9、Drei、MapLibre、Zustand、React Router。

### 1.2 初始化项目代码

下载或克隆本项目，进入包含 `package.json` 的目录：

```sh
cd rural-governance-platform
npm ci
```

`npm ci` 按锁文件安装，不要删除锁文件来绕过版本问题。编辑器打开此目录，后文命令均在项目根目录执行。

首次复制配置模板；**已有 `.env.local` 时不要覆盖密钥**。

macOS / Linux：

```sh
test -e .env.local || cp .env.example .env.local
chmod 600 .env.local
```

Windows PowerShell：

```powershell
if (-not (Test-Path .env.local)) { Copy-Item .env.example .env.local }
```

用本地编辑器填写 `.env.local`。不配置模型 Key，仍能使用场景、文字/照片上报及事件办理；语音、AI 留痕、月报整理和分析助手需有效模型配置。

## 2. API 与大模型配置

### 2.1 申请阿里云百炼 Key

1. 登录[阿里云百炼控制台](https://bailian.console.aliyun.com/)，按账号提示开通服务。
2. 打开[北京地域 API Key 页面](https://bailian.console.aliyun.com/cn-beijing/model/settings/api-key)，确认华北 2（北京）地域。
3. 创建或复制可用 Key；如限制模型权限，允许 `qwen3-asr-flash`、`qwen-plus`，并确认额度可用。
4. Key 只填入本机 `.env.local`，不放进网页、客户端代码或聊天，也**不要添加 `VITE_` 前缀**。

地域、Key 和接入地址必须匹配，见[百炼官方配置说明](https://help.aliyun.com/zh/model-studio/get-api-key)。

### 2.2 `.env.local` 示例

```dotenv
# 服务端模型配置：只在本地填写实际 Key
DASHSCOPE_API_KEY=在本地填写自己的北京地域Key
DASHSCOPE_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1
DASHSCOPE_ASR_MODEL=qwen3-asr-flash
DASHSCOPE_TEXT_MODEL=qwen-plus

# 留痕、月报、治理助手共用一个文本模型
GOVERNANCE_MODEL=qwen-plus
# 可选：不填则复用上方的 Key / Base URL
# GOVERNANCE_API_KEY=
# GOVERNANCE_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1

API_PORT=5190
# 以下为 npm run start 的静态服务配置，不是 Vite 开发端口
HOST=0.0.0.0
WEB_PORT=5181
MOBILE_PORT=5184

# 手机 HTTPS 可选项，先生成证书再启用服务
# MOBILE_HTTPS_CERT_FILE=.certs/mobile-cert.pem
# MOBILE_HTTPS_KEY_FILE=.certs/mobile-key.pem
# MOBILE_HTTPS_PORT=5175
```

语音流程为 **Qwen3-ASR-Flash 转写 → Qwen-Plus 整理字段**；治理留痕、月报和助手默认也使用 Qwen-Plus。治理 Key 优先 `GOVERNANCE_API_KEY`，为空时用 `DASHSCOPE_API_KEY`；治理地址优先 `GOVERNANCE_BASE_URL`，其次 `DASHSCOPE_BASE_URL`。

### 2.3 单独启动 API 与检查

```sh
npm run dev:api
```

API 默认只监听 `127.0.0.1:5190`。可用浏览器或以下命令检查：

```sh
curl http://127.0.0.1:5190/api/health
curl http://127.0.0.1:5190/api/voice/config
curl http://127.0.0.1:5190/api/governance/config
```

健康接口应返回 `{"ok":true}`。`enabled:true` 仅说明读到了非空 Key，不证明鉴权、权限和额度有效；完整验证需真实录音或生成一份留痕。

修改服务端代码或 `.env.local` 后，先在原终端 `Ctrl+C`，再重启 API。若用 `npm run dev` 启动整组服务，则重启整组，不要重复启动占用 5190 的实例。配置未就绪时事件照常保存，AI 生成会显示配置/失败状态；修复后可重试。

## 3. 项目运行与手机 HTTPS

### 3.1 同时启动桌面、手机与 API

```sh
npm run dev
```

| 服务 | 开发地址 | 说明 |
| --- | --- | --- |
| 桌面事件工作台 | [http://localhost:5173/](http://localhost:5173/) | 首次默认八卦村实景 Demo |
| 智慧治理终端 | [http://localhost:5173/governance](http://localhost:5173/governance) | 共用当前村庄与事件 |
| 手机 H5 | [http://localhost:5174/mobile](http://localhost:5174/mobile) | 电脑可预览，手机访问需换成电脑 IP |
| 本地 API | `http://127.0.0.1:5190` | 两端经各自 `/api` 同源代理访问 |
| 手机 HTTPS | `https://电脑IP:5175/mobile` | 另行准备证书、启动；不包含在 `npm run dev` 中 |

在启动终端按 `Ctrl+C` 停止整组。开发端口 5173、5174 严格检查占用；先停止旧实例。不要在 `npm run dev` 后追加 Vite 的 `--port` 参数，当前编排脚本不会转发这些参数。

### 3.2 分开初始化运行

也可以在三个终端分别执行，**与上面的整组启动二选一**：

```sh
# 终端一：API
npm run dev:api
```

```sh
# 终端二：桌面网页端
npm run dev:web
```

```sh
# 终端三：手机 H5
npm run dev:mobile
```

React、TypeScript 和 CSS 修改支持热更新；服务端 `.mjs` 与模型配置变化需重启 API。两端入口、构建产物和依赖缓存独立，可以同时运行。

### 3.3 手机如何访问

当前手机端是 H5，无需安装 App 或小程序：

1. 电脑与手机连接可互访的同一局域网。校园网、公共/访客 Wi-Fi 可能隔离设备；超时时可开启手机热点，让电脑连接它。
2. 查找**电脑当前 IPv4**：macOS 可用 `ipconfig getifaddr en0`（按实际 Wi-Fi 网卡调整），Windows 用 `ipconfig`，Linux 用 `ip addr`。
3. 手机先打开 `http://电脑IP:5174/mobile` 验证网络。手机上的 `localhost` 指向手机自己。
4. 录音使用下节配置的 `https://电脑IP:5175/mobile`，不能仅把 5174 的 HTTP 改成 HTTPS。

换 Wi-Fi、重新连接热点后 IP 可能改变，旧访问地址不会自动更新。

### 3.4 首次配置 HTTPS 与录音

浏览器录音需要安全上下文及麦克风权限，见 [MDN getUserMedia](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia)。本地使用 [mkcert](https://github.com/FiloSottile/mkcert)，macOS 示例：

```sh
brew install mkcert
mkcert -install
mkdir -p .certs
ipconfig getifaddr en0
```

把下面示例 IP 换成查到的电脑地址：

```sh
PHONE_LAN_IP=192.168.43.100
mkcert -cert-file .certs/mobile-cert.pem -key-file .certs/mobile-key.pem localhost 127.0.0.1 ::1 "$PHONE_LAN_IP"
cp "$(mkcert -CAROOT)/rootCA.pem" .certs/phone-rootCA.crt
```

只把 **`phone-rootCA.crt` 公开根证书**传到自己的测试手机并安装信任，不传 `mobile-key.pem` 或 `rootCA-key.pem`：

- **vivo / Android**：系统设置搜索“CA 证书”“安装证书”或“凭据”，安装自己的 CA。可经 USB 传文件；网络互通后也可从 `http://电脑IP:5174/dev/phone-rootCA.crt` 下载。具体菜单因系统版本而异。
- **iPhone / iPad**：安装证书描述文件，再到“关于本机 → 证书信任设置”启用对应根证书的完全信任。

其他电脑系统的安装方法见 mkcert 官方说明；手机细节见[语音配置与手机 HTTPS 测试](docs/语音配置与手机HTTPS测试.md)。不要通过忽略证书错误来测试录音。

保持普通开发服务与 API 运行，另开终端：

```sh
npm run dev:mobile:https
```

手机打开 `https://电脑当前IP:5175/mobile`，用系统浏览器并允许麦克风。已有可用证书的环境可直接启动；**IP 变化时重新签发包含新 IP 的服务证书、重启 5175，使用同一 CA 无需重装手机根证书**。重启 `npm run dev` 不会重启独立的 5175 服务。

## 4. 3D 模型格式、资源来源与导入

### 4.1 默认八卦村 Demo

| 项目 | 内容 |
| --- | --- |
| 模型 | Licha Fengshui Village (Ba Gua Cun) 黎槎八卦村 |
| 作者 / 来源 | Old Media Art / [Sketchfab 原页](https://sketchfab.com/3d-models/2b79987cd49c4727b1bd12aa7ab62927) |
| 模型 ID | `2b79987cd49c4727b1bd12aa7ab62927` |
| 项目记录许可 | [CC BY-NC 4.0](https://creativecommons.org/licenses/by-nc/4.0/)，界面保留署名与链接；实际下载和发布前以作者原页当前授权为准 |

默认通过官方 Viewer 在线嵌入，不必预先下载，也不需要填写 Sketchfab 下载 API Key；百炼 Key 用于语音/治理模型，两者用途不同。离线使用需先按授权取得完整源文件，再本地导入。

已保存其他场景的浏览器不会强制重置。要切回八卦村，选择「实景模型 → 地图设置 → Sketchfab 在线 → 使用黎槎八卦村」，无需清空全部站点数据。

### 4.2 格式与资源要求

| 资源 | 是否支持及准备方式 |
| --- | --- |
| `.glb` | **推荐**，glTF 2.0 Binary；优先把网格、缓冲、纹理全部内嵌 |
| `.gltf` + `.bin` + 纹理 | 支持完整文件夹或 ZIP；提供所有引用文件，保留相对目录 |
| 包含 GLB/glTF 的 `.zip` | 支持，只保留一个 `.glb` 或 `.gltf` 入口，不加密、不混入多个模型入口 |
| Draco / Meshopt / KTX2 | 提供本地解码器，支持常见压缩资源，实际兼容性以导入校验为准 |
| OBJ、FBX、BLEND | 不直接支持，需在 Blender 或源软件导出 GLB/glTF 2.0 |
| OSGB、LAS/LAZ、3D Tiles、GeoTIFF | 不直接支持；用对应专业工具先生成网格、转换为支持格式，不能只改扩展名 |

上传总量及 ZIP 解压后总量均不超过 **512 MiB**（界面标记为 512 MB）。这是读取上限，不是性能保证；实际规模取决于浏览器内存、显卡、纹理与网格复杂度，先用较小模型验证。

模型至少含有效三维网格。想得到有真实建筑纹理的二维底图，应提供完整村庄、地面/屋顶、有效 UV 与纹理。系统不会补出源模型缺失的建筑。glTF 按 Y-up 读取，展示时自动适配方向、居中和缩放，不据此建立真实 GPS 或米制测绘坐标。

完整 glTF 示例：

```text
village/
  scene.gltf          # 唯一入口
  scene.bin           # glTF 引用的网格缓冲
  textures/
    village.jpg       # 名称与路径须和 glTF 引用对应
```

不要只上传 `.gltf` 而漏掉缓冲或图片，也不要使用电脑绝对路径。外部网站纹理/缓冲需先一起打包；导出时保留材质、UV 与图片。可参考 [Blender 官方 glTF 导出手册](https://docs.blender.org/manual/en/4.0/addons/import_export/scene_gltf2.html)。

### 4.3 从哪里下载或获得

| 来源 | 用途与获取方法 |
| --- | --- |
| [八卦村原模型](https://sketchfab.com/3d-models/2b79987cd49c4727b1bd12aa7ab62927) | 在线方式直接使用内置入口；本地方式查看原页当前下载入口、许可，按平台要求获取完整文件 |
| [Sketchfab](https://sketchfab.com/) | 搜索 village、photogrammetry、乡村等；不是所有模型都可下载，选择有权限且提供兼容格式的资源。见[官方可下载格式说明](https://sketchfab.com/developers/download-api) |
| [Khronos glTF Sample Assets](https://github.com/KhronosGroup/glTF-Sample-Assets) | 官方格式/材质/压缩测试样例，按各模型说明和许可获取，不代表真实村庄 |
| 项目自带资源 | `tests/fixtures/models/示例村庄.glb`、`示例村庄-gltf.zip`、`gltf-folder/`；无需下载，程序生成的功能样例，不是八卦村实景 |
| 自有航测/倾斜摄影成果 | 自己或受托方提供完整网格和纹理，确认授权后转换导出；原始测绘工程不能直接当作 GLB 上传 |

下载 ZIP 后检查入口与格式，大型样例库含多个模型，不能把整个仓库 ZIP 当成一个村庄上传。各资源可用性、权限与许可证以当前原页为准。

### 4.4 导入与二维投影

1. 工作台选「实景模型」，打开「地图设置」。
2. 本地选「本地上传 → 选择模型文件 / ZIP」或「选择文件夹」；在线选「Sketchfab 在线」，输入模型页链接、嵌入链接或 32 位 ID，不粘贴整段 iframe HTML。
3. 等待模型和纹理校验，成功后保存为当前浏览器默认来源；失败保留原模型。
4. 等待投影生成，在左下小地图查看，可展开左右对照；后续按模型恢复本地缓存。
5. 显示“实景二维底图已共享到手机”后，再用手机测试同一村庄。

本地模型为正交投影，Sketchfab 为相机校准的小视角俯视影像。底图保留输入模型可见纹理与分布，**不等于测绘正射成果；当前没有自动建筑分割、真实建筑计数或地理配准**。旧版点位无法可靠重定位时会提示重新确认，不会猜测位置。[投影原理与边界](docs/通用实景投影.md)。

本地完整模型存于桌面 IndexedDB，当前保留最新一份本地模型；手机接收 API 保存的二维 PNG 与校准数据，不加载完整 3D 文件。[上传操作细节](docs/本地实景模型上传与测试.md)。

## 5. 功能使用指导

### 5.1 桌面事件处理

1. 打开 `/`，默认 3D 主视窗加左下小地图；可展开分屏，或切换 2D、重置、俯视、日夜与图层。
2. 「治理事件」按类型/状态筛选；点击标记或列表查看详情与位置。
3. 「新增事件」后在地面/建筑选点，填写标题、分类、区域和说明保存；点击模型外空白处不会生成位置。
4. 在详情填写实际处理说明，受理、确认办结或重新受理，保留办理时间线。
5. 手机照片在「现场照片」显示，点击缩略图看完整大图；多张可用按钮/左右方向键切换，Escape 关闭。
6. **已办结事项查看一次后隐藏桌面 3D/2D/小地图标记**，列表、统计与档案保留。查看状态属于当前浏览器，刷新仍隐藏；重新受理及新办结周期恢复。这不是删除，不影响手机标记。

预置业务事件是模拟数据，不代表八卦村现实问题；实景不会用演示建筑数冒充真实数量。

### 5.2 微更新方案

进入「青禾村 Demo → 微更新」，选择路灯、广场或垃圾点，比较改造前后；路灯结合夜间查看。方案改变程序化设施、铺装、绿化或灯光，不自动办结事件。这些预设依赖独立设施对象，**不能直接改造八卦村或任意上传实景网格**。

### 5.3 智慧治理终端

点击“乡居共治”左侧叶子图标切换页面，或访问 `/governance`：

1. 事件办结、同步 API 后，后台自动接收并排队生成工作留痕，无需一直打开终端。
2. 核对村庄和月份，查看待生成、整理中、已留痕、失败等状态；可重试失败任务，展开原始流程、回到原事件核对。
3. 该批留痕完成后自动汇总月报：程序计算统计段，模型整理已记录的措施、结果与复盘；支持复制和下载。
4. 重新受理使旧留痕退出有效汇总，月报待更新；新稿成功前保留旧正文及原来源。
5. 点击右下机器人打开分析助手，询问集中地点、未办结事项安排或优化建议；回答附事件依据，可回跳原记录。平时隐藏，只读，不自动派单/修改事件。

终端使用工作台当前村庄。月度数据按上海时区计算，与当前待处理/处理中分开统计；上报集中不等于事故率，“村内选点”等泛称需核实。模型稿应对照原始资料使用，不将未记录的验收、满意度当成事实。[治理终端说明](docs/智慧治理终端与模型配置.md)。

### 5.4 手机上报与进度

1. 电脑选定真实村庄、完成底图共享；手机自动跟随最后真实村庄和投影更新，不提供青禾 Demo 或手动选村。电脑切回青禾时，手机保留最后真实村庄。
2. 「首页」看概况与地图，「随手报」填写；单指平移、双指缩放、轻点影像选位置，复位显示全村。
3. 填写标题、分类、程度、描述和地点，可拍照或选图；最多 4 张，每张输入文件不超过 12 MiB，压缩后提交。
4. 可信 HTTPS 下长按录音、松开后转写并整理；上滑取消，最长 60 秒。语音不自动提交、不代替地图定位，已有手填内容按规则保留，提交前核对修改。
5. 「进度」查看列表、地图和详情；管理端查看同一记录及照片，办理状态同步回手机。
6. 草稿按村庄保存；称呼与“我的上报”身份只属于当前手机浏览器，不是正式账号。更换协议、主机、端口或设备，本地身份和草稿不自动迁移。

点位保存模型 ID、投影版本、影像 UV 等，不生成虚构 GPS。换村/换底图后按提示重新确认。[手机实景操作](docs/手机实景底图与录入.md)。

## 6. 构建、部署与数据备份

### 6.1 构建并启动验收版本

```sh
npm run build
npm run start
```

构建先检查 TypeScript，再生成 `dist/web/` 与 `dist/mobile/`。start 同时启动 API 和两套静态服务：

| 服务 | 默认地址 | 配置项 |
| --- | --- | --- |
| 桌面工作台 / 治理终端 | `http://localhost:5181/` / `/governance` | `WEB_PORT` |
| 手机 H5 | `http://localhost:5184/mobile` | `MOBILE_PORT` |
| 本地 API | `http://127.0.0.1:5190` | `API_PORT` |

`HOST` 影响构建后静态服务，Vite 开发入口另行监听局域网；API 保持回环监听。切换前停止原开发组，避免同一 API 端口冲突。start 不提供 TLS，真机录音仍需可信 HTTPS。

只预览单个构建产物，可用 `npm run preview:web`、`npm run preview:mobile`，但 preview **不启动 API**，需另行保持 `npm run dev:api`。项目的双端整体运行入口为 `npm run start`。

### 6.2 部署结构

完整功能需要 **Node API + 桌面静态站点 + 手机静态站点**，不再是“只上传一份 dist/”：

- 可在同一机器运行 API 与两套静态服务，再由可信 HTTPS 反向代理分别转发到 5181、5184，用两个域名区分两端；手机入口仍为 `/mobile`。
- 直接托管静态文件时，桌面根目录用 `dist/web/`，页面路由回退 `index.html`；手机根目录用 `dist/mobile/`，页面路由回退 `mobile.html`。
- 两端 `/api/` 代理到同一个 `127.0.0.1:5190`，保留原始 Host 以通过同源校验，并按接口上传体积配置请求大小和超时。
- 保留完整 `assets/`、`vendor/` 等目录，包括工作线程与解码器；正确提供 JS、MJS、WASM MIME 类型，不能直接双击 HTML。
- 本文按域名根路径部署；子路径还需协调 Vite base、路由、`/mobile` 与 API，不能只改一个目录。

当前无正式认证、分级权限或多机数据库事务，适用于本地/受控内网验收；公网发布前完成下一步计划中的后台及运维措施。本地 mkcert CA 不作为公网证书。

### 6.3 数据存储与备份

| 位置 | 内容 |
| --- | --- |
| `.local-data/issues.json` | 事件、办理历史和照片 |
| `.local-data/governance.json` | 留痕、月报、生成任务与来源 |
| `.local-data/maps/` | 手机共享目录、当前实景、PNG 与校准参数 |
| 桌面 IndexedDB | 本地模型、来源选择与投影缓存；原模型文件应另行留存 |
| 浏览器 localStorage | 事件副本、场景偏好、桌面办结查看状态；手机身份与分村草稿 |
| `.env.local` / `.certs/` | 本机密钥及开发证书，不提交 Git、不放进静态目录 |

备份时宜停止写入、整体复制 `.local-data/`，同时留存模型源文件和自己的配置。不要为了重试 AI 删除事件库。完整 3D 文件只在浏览器保存，不能误认为 API 已备份。

`localhost` 与 `127.0.0.1`、HTTP 与 HTTPS、不同端口属于不同浏览器存储来源。事件/照片/共享地图通过同一 API 同步，模型原文件、身份与草稿不是自动云同步。当前未加入离线应用缓存；本地模型无需外网取模型，但页面仍由 Web 服务提供。

## 7. 检查与常见问题

```sh
npm test
npm run lint
npm run build
```

专项命令为 `npm run test:issues`、`npm run test:models`。本次整理前最近一轮回归为 123 项通过；真实模型调用、页面效果和真机录音仍需人工验收，不以模拟响应测试代替。

| 现象 | 处理 |
| --- | --- |
| 依赖/Node 版本报错 | 核对版本，按锁文件 `npm ci`，不要先删锁文件 |
| 端口占用 | 停止旧实例；API 同一端口只运行一份 |
| 电脑可用、手机超时 | 核对电脑当前 IP、同网互通、防火墙及校园网隔离；必要时用手机热点 |
| 换网后 HTTPS 失败 | 换新 IP 链接，更新服务证书并重启 5175，不是重复安装同一个根证书 |
| 页面可用但不能录音 | 核对可信 HTTPS、5175、浏览器能力及麦克风权限 |
| enabled:true 但模型失败 | 核对地域、权限、额度和服务端网络；重启 API 后重试 |
| 八卦村无法载入 | 核对 Sketchfab 与 WebGL；可用授权本地模型，或青禾村演示设施功能 |
| 模型缺纹理/多个入口 | 补齐资源、保留路径，只保留一个 GLB/glTF 入口 |
| 投影失败/等待 | 等纹理加载，按错误提示重试；投影不能补齐源模型缺失的建筑 |
| 手机等待底图 | 桌面先选真实模型并共享投影，确认共用 API；Demo 不发布新真实村庄 |
| 办结标记消失 | 已查看后隐藏是预期行为，列表及治理档案仍可查 |
| 换网址后模型/我的上报不见 | 检查协议、主机、端口及浏览器存储范围，不直接清空站点数据 |
| 构建有大分包提示 | 引擎较大，提示本身不代表失败，查看退出状态与最终结果 |

## 8. 下一步计划

以下是建议开发顺序，**未实现项不作为当前功能承诺，不预设上线日期**。

| 优先级 | 方向 | 验收目标 |
| --- | --- | --- |
| P0 | 固化双端验收与部署 | 八卦村首次打开、换村、模型上传、照片、语音、重开办理、月报和已查看隐藏形成可重复清单；补弱网与跨浏览器测试 |
| P0 | 身份与权限 | 村民、经办人员、管理员及村庄隔离；服务端认证、状态命令、操作审计 |
| P0 | 数据与文件服务 | 正式数据库、图片/模型存储、模型版本、并发与备份恢复；可在现有适配层后接 FastAPI / PostgreSQL |
| P1 | 治理报告质量 | 任务监控、额度/超时可见性、人工校核与发布、模板和效果评估，保留来源版本 |
| P1 | 大场景与空间精度 | 轻量化、分块/LOD、瓦片；先建立可核实地理配准及 PostGIS 数据，再推进建筑分割/设施对象，不用相对坐标冒充 GPS |
| P1 | UniApp / 小程序 / App | 确定目标平台；复用接口、模型 ID、投影数据和业务规则，重写视图/导航/手势与平台适配，完成真机验收 |

手机端目前是 **React H5，不是可直接编译发布的 UniApp 工程**。已有业务、HTTP、草稿、录音等适配边界，可减少迁移成本，但仍需实际平台开发。[UniApp 迁移边界](docs/手机端开发与测试.md#后续-uniapp-迁移)。

## 9. 代码结构与详细文档

```text
src/
  App.tsx                       桌面场景与工作区编排
  main.tsx / mobile/main.tsx     独立双端入口
  components/
    scene3d/                    在线/本地实景、程序化场景、拾取
    map/                        二维、小地图、备用 SVG
    governance/                 事件详情、办理、微更新面板
    governance-terminal/        留痕、月报、治理助手
    issues/                     录入表单与桌面照片预览
  mobile/                       村民 H5、领域函数、平台适配
  lib/ services/ store/          模型/投影、接口、业务及展示状态
server/                         本地 API、模型代理、静态服务
shared/                         治理事实统计与证据边界
scripts/                        服务运行编排
public/vendor/                  解码器、Viewer SDK、第三方声明
tests/                          回归及模型测试资源
docs/                           详细功能与历史阶段记录
需求/                           原始需求，不表示全部已交付
```

详细说明：[模型上传](docs/本地实景模型上传与测试.md)、[实景投影](docs/通用实景投影.md)、[手机底图](docs/手机实景底图与录入.md)、[语音及 HTTPS](docs/语音配置与手机HTTPS测试.md)、[治理终端](docs/智慧治理终端与模型配置.md)、[助手实现参考](docs/治理助手实现参考.md)。

阶段记录中的 IP、测试数量和阶段范围属于当时快照；新环境按本文与当前代码配置，不照搬旧网络地址。发布时保留第三方模型署名和 `public/vendor/` 许可声明。
