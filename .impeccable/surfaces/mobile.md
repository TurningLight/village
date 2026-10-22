# 村民端 H5

Mode: Operate。沿用已确认的森林绿乡居共治品牌，扩展村民端；不是替换既有视觉世界。独立 `mobile.html` 与 `/mobile/*`，开发端口5174，HTTPS测试端口5175；桌面端口5173。两个端同时运行，共用API5190；用户已确认 vivo 手机 HTTPS 和录音测试可用。

## Direction contract

THESIS：让村民用“说清楚、标位置、确认提交”的短路径处理家门口的小事；首页以唯一的大上报入口领路。

OWN-WORLD：沿用既有森林绿、浅绿白底、中文系统无衬线、Lucide线性图标。深绿承载上报主动作，暖色提示待受理，绿色表示办结。没有营销照片或装饰插画。

STORY：自动连接电脑当前的真实村庄，首页了解办理情况并进入实景地图；打开随手报，用文字或语音填写、在同一投影上选位置并加照片；核对村名后提交；在进度中持续查看管理员的办理说明。

FIRST VIEWPORT：顶部品牌和自动同步的真实村名；34px双行主标题；深绿大上报入口；三项实际事件状态计数；实景地图缩略入口；最新事件列表；底部固定首页、随手报、进度、我的。手机宽度390px、375px，桌面浏览手机端时居中最大480px。

FORM：既有品牌下的窄屏任务界面，标准底部导航、滚动列表与受保护焦点的上报表单。按住说话是核心交互；录音过程反馈时间，上滑取消，松开后分阶段识别和整理。本次直接扩展既有产品，依据new-work的local extension例外不运行概念抽签，不生成参考合成图。

FINISH：unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

## 交付与边界

- 业务流程、字段校验、照片压缩、原文与整理重试、IndexedDB草稿、本地身份、跨端事件同步。
- 表单不能在语音处理期间提交；提交成功前必须得到本地API持久化确认。重复提交ID不覆盖已受理记录。
- 手机不提供青禾村 Demo 或手动选村，按 `activeRealModelId` 每 2.5 秒检查桌面实景选择。新村庄无底图时显示等待，不套用旧图；桌面进入 Demo 时保留最后真实村庄。
- 共用服务持久化校准 PNG 与元数据。手机只加载二维影像，不加载原模型、Three.js 或 MapLibre；同图像坐标用于选点和事件标记。
- 实景选点保存模型 ID、UV、投影版本与射线；不自动定位到真实经纬度，也不虚构三维高度。投影变更后重新选点，旧版无可靠三维锚点的记录保留列表入口，不在新图上猜位置。
- 草稿与事件按模型隔离。电脑切村时保存原村草稿，再显示新村表单；服务端拒绝过时的村庄或投影提交。
- 桌面和手机独立Vite依赖缓存，避免并行开发服务器相互覆盖缓存。
- 语音和 HTTPS 继续沿用现有配置；用户已确认 vivo 真机测试可用。本轮不读取或展示密钥，也不将历史模拟测试表述为本轮真实模型调用。
- 首轮历史截图：`.impeccable/review/mobile.png`、`desktop.png`、`user-375.png`、`report.png`、`map-picker.png`、`progress.png`、`detail.png`、`me.png`。
- 本轮实景截图：`.impeccable/review/real-map/` 下的手机首页、地图、选点、上报、详情、375px地图与桌面小地图、分屏。自动验证及功能实测结果见该目录 `verification.md`。

## 实景地图局部规则（2026-10-22）

延续现有品牌与任务路径，采用 local extension。投影面板 16px 圆角；村名及辅助提示至少 12px；右下地图控件与事件触控目标至少 44px。地图以原图等比显示，支持拖动、双指缩放、完整范围复位与点击选点；手势结束和图像外留白不能意外落点。同步、等待、失败、版本更新与重新定位均有可读状态。本轮独立审阅结论为 ship；分屏标记错位修复已复核（1 resolved / 0 partial / 0 unresolved），证据见 `real-map/finish-review.md` 与 `real-map/verification.md`，不复用历史交付 verdict。
