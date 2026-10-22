# 语音配置与手机 HTTPS 测试

本项目使用北京地域阿里云百炼：`qwen3-asr-flash` 将录音转写成文字，再由 `qwen-plus` 整理成上报字段。同一个有这两个模型权限的百炼API Key即可完成两次调用。

## 1. 申请百炼 API Key

1. 登录[阿里云百炼控制台](https://bailian.console.aliyun.com/)，首次使用按控制台提示由本人完成实名认证与服务开通。
2. 打开[北京地域 API Key 页面](https://bailian.console.aliyun.com/cn-beijing/model/settings/api-key)，确认地域是「华北2（北京）」。各地域Key不能混用。
3. 点击「创建 API Key」。个人测试可用本人账号和默认业务空间；如果设置自定义模型权限，需要同时允许 `qwen3-asr-flash` 与 `qwen-plus`。
4. 创建后复制Key到本机配置文件。不要发到聊天、截图或客户端代码中。账号需具备对应模型的可用额度/余额，实际消费以控制台为准。

依据：[阿里云首次调用说明](https://help.aliyun.com/zh/model-studio/first-api-call-to-qwen)、[获取与配置 API Key](https://help.aliyun.com/zh/model-studio/get-api-key)。

## 2. 填到项目根目录 .env.local

项目使用 `.env.local` 保存服务端配置（文件权限600）。现有环境已由用户完成配置，不要用模板覆盖已有 Key；首次配置其他环境时，保留以下字段，只替换第一行等号后面的值：

```dotenv
DASHSCOPE_API_KEY=这里替换为你复制的Key
DASHSCOPE_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1
DASHSCOPE_ASR_MODEL=qwen3-asr-flash
DASHSCOPE_TEXT_MODEL=qwen-plus
API_PORT=5190
```

不要添加 `VITE_` 前缀。`.env.local` 和证书目录均已排除版本控制；开发服务器也禁止通过HTTP读取这些文件。已有其他环境变量时保留，不要覆盖整个文件。

旧的北京域名仍可用；阿里云同时推荐业务空间专属域名。若使用专属域名，把 `DASHSCOPE_BASE_URL` 改为 `https://你的WorkspaceId.cn-beijing.maas.aliyuncs.com/compatible-mode/v1`，Key与WorkspaceId需属于对应地域和业务空间。无需将WorkspaceId填入模型名称。[Qwen-ASR官方接入说明](https://help.aliyun.com/zh/model-studio/qwen-asr-api-reference)

保存后必须重启现有API进程：在运行API的终端Ctrl+C，再执行 `npm run dev:api`；不要额外启动第二个占用5190的进程。如果是用 `npm run dev` 一起启动的，则重启这一整组。若由Codex在后台运行，可告知「Key已填好」让Codex重启并检查，无需发送Key。

在电脑打开 `http://127.0.0.1:5190/api/voice/config`，应看到 `"enabled":true`。这仅说明服务进程读到了非空Key，不能证明鉴权、额度和模型权限有效；需完成一次真实录音才能验证全链路。

## 3. Mac 生成局域网开发证书

选用本地局域网HTTPS，不需要把无鉴权演示API公开到公网。证书工具需在本机安装并确认信任。当前测试环境已完成证书与 vivo 手机信任设置，用户已确认可用；以下步骤用于新环境或网络地址变化时参考。

在项目根目录终端执行：

```sh
brew install mkcert
mkcert -install
mkdir -p .certs
ipconfig getifaddr en0
```

`mkcert -install` 创建本机开发CA并安装到Mac信任库，可能需要本人输入系统密码。当前Mac的Wi-Fi地址为 `10.142.176.9`；若上面命令显示别的地址，把下方IP也替换成新地址：

```sh
mkcert -cert-file .certs/mobile-cert.pem -key-file .certs/mobile-key.pem localhost 127.0.0.1 ::1 10.142.176.9
cp "$(mkcert -CAROOT)/rootCA.pem" .certs/phone-rootCA.crt
```

最后一条只复制公开的根证书，便于发给自己的测试手机。不要传输 `rootCA-key.pem` 或 `mobile-key.pem`，也不要把证书放进 `public/`。若电脑IP改变，重新生成包含新IP的服务证书并重启HTTPS服务；使用同一CA无需每次重新安装手机根证书。[mkcert官方说明](https://github.com/FiloSottile/mkcert)

## 4. 手机安装并信任开发根证书

**iPhone / iPad：**

1. 用AirDrop将 `.certs/phone-rootCA.crt` 发到自己的测试手机。
2. 打开证书，进入「设置 → 已下载描述文件」安装；某些版本在「通用 → VPN与设备管理」中查看。
3. 再进入「设置 → 通用 → 关于本机 → 证书信任设置」，对这次mkcert生成的根证书开启「完全信任」。仅安装描述文件还不够。
4. 使用Safari测试，不要先用微信等内置浏览器。页面必须无证书错误。

依据：[Apple安装描述文件](https://support.apple.com/zh-cn/102400)、[Apple启用根证书信任](https://support.apple.com/zh-cn/102390)。信任开发CA会影响该手机的TLS信任，请只使用自己生成的CA，测试结束可移除对应描述文件。

**Android：**

将同一 `phone-rootCA.crt` 装为用户CA证书，在系统设置中搜索「CA证书」或「安装证书」，具体路径随品牌而不同。使用Chrome测试。这里针对浏览器H5；未来原生App或小程序还可能有独立的证书及合法域名配置要求。[Chrome本地信任说明](https://chromium.googlesource.com/chromium/src/+/main/net/data/ssl/chrome_root_store/faq.md#how-does-the-chrome-certificate-verifier-consider-local-trust-decisions)

vivo 手机不使用AirDrop或iPhone的“完全信任”菜单。网络互通后，可用手机浏览器从 `http://电脑IP:5174/dev/phone-rootCA.crt` 下载公开根证书到Download目录；也可通过USB文件传输。这个入口仅在手机开发服务器存在，固定只提供根证书，其他证书和私钥路径仍禁止访问，不进入生产构建。在设置中搜索“证书”或“凭据”，找到“安装证书/从存储安装”，选择CA证书并安装自己的开发根证书。OriginOS版本不同，菜单位置会变化；不要选择需要私钥的客户端证书，也不要执行“清除所有凭据”。[vivo凭证存储说明](https://www.vivo.com.cn/instructions/index?modelName=PD1708&pageId=26661)

若手机连页面都打不开，先在同一Wi-Fi下测试 `http://电脑IP:5174/mobile`：HTTP也连接超时，应先检查局域网互通（校园网/访客网可能隔离设备），安装证书不能解决网络不可达；HTTP能打开而HTTPS提示证书问题时，再处理CA安装。若换用其他Wi-Fi或手机热点，电脑IP可能改变，需重新生成包含新IP的服务证书并重启HTTPS入口。

## 5. 启动专用 HTTPS 手机入口

现有桌面5173、手机HTTP5174和共用API5190继续运行。另开一个终端，在项目根目录执行：

```sh
npm run dev:mobile:https
```

新入口默认 **5175**，独立依赖缓存，不抢占原有端口。证书默认从 `.certs/mobile-cert.pem`、`.certs/mobile-key.pem` 读取。需要自定义时，在 `.env.local` 设置 `MOBILE_HTTPS_CERT_FILE`、`MOBILE_HTTPS_KEY_FILE`、`MOBILE_HTTPS_PORT`。

手机和Mac连接相同Wi-Fi，手机Safari/Chrome打开：

```text
https://10.142.176.9:5175/mobile
```

使用电脑当前IP，不能在手机中填localhost。不能仅将旧地址 `http://IP:5174` 改成https，5174仍是HTTP。手机只访问5175，`/api`会由Vite代理到本机5190，不需要修改前端API地址或给5190单独配置TLS。普通局域网HTTP不满足浏览器录音的安全上下文要求。[MDN录音权限说明](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia)、[Vite HTTPS配置](https://vite.dev/config/server-options.html#server-https)

## 6. 验证长按录音

1. 重新打开上报表单，确认「语音服务暂未开通」已消失。
2. 按住「按住说话」，首次出现麦克风权限弹窗时允许。若授权期间已经松手，本次会取消，重新长按即可。
3. 说：「东侧桥头的路灯连续两晚不亮，晚上走路看不清，请安排检修。」持续几秒后松开。
4. 应看到「转成文字 → 整理问题信息」，随后标题、类别、描述、地点填入。核对并按需修改；地图位置仍要手动确认。
5. 测试向上滑动后松开取消、过短录音、处理中取消、转写原文展开/修改/重新整理。最长60秒会自动结束。

已有手动填写的标题、类别、地点会保留，语音描述追加；语音不会自动提交事件。一次录音会发送至百炼转写，并将原文发送至文本模型整理；请用虚构事件做首次测试。

## 常见问题

| 现象 | 检查 |
| --- | --- |
| 仍提示暂未开通 | Key是否保存在根目录.env.local；API是否真正重启；关闭并重开表单 |
| enabled:true但识别失败 | 仅代表读到Key，检查北京地域、Key有效性、两个模型权限和账户额度 |
| 证书不受信任 | 检查手机根证书安装及完全信任、访问IP是否包含在服务证书中；不要忽略证书警告 |
| HTTPS手机页面打不开 | 确认5175服务运行、相同Wi-Fi、非访客网络、Mac防火墙允许该Node服务；核对当前IP |
| 没有麦克风权限/不支持录音 | 使用系统Safari或Chrome，检查站点麦克风权限及HTTPS；避开内置浏览器 |
| 整理失败但有原文 | 展开语音原文，检查文字后重新整理；无需再次录音 |
| HTTPS中“我的上报”为空 | HTTP和HTTPS是不同站点，本机身份与草稿不会自动迁移；全村进度仍通过同一API同步 |

## 验证记录

最初交付通过临时测试证书验证 TLS 握手、手机页面入口和同源 API 代理；此后用户完成实际配置，并确认 vivo 手机 HTTPS 与录音测试可用。当前实景底图功能沿用这些配置，不重复申请 Key、生成同一 IP 的证书或安装 CA。若电脑 IP 变化，再按第 3 节重新生成包含新 IP 的服务证书。
