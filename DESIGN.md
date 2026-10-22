---
name: 乡居共治
description: 森林绿乡村治理工作区与村民日常上报界面
colors:
  web-canvas: "#e0e8e0"
  web-surface: "#f9faf7"
  web-surface-soft: "#f0f3ed"
  web-line: "#d4ddd2"
  web-ink: "#233c30"
  web-muted: "#56685a"
  web-accent: "#315e47"
  mobile-primary: "#173b32"
  mobile-button: "#214c39"
  mobile-canvas: "#f8faf5"
  mobile-surface: "#ffffff"
  mobile-ink: "#243b32"
  mobile-muted: "#647269"
  mobile-line: "#e6eae3"
  mobile-voice-surface: "#eef4e6"
  mobile-pending: "#94522f"
  mobile-pending-surface: "#f8ede5"
  mobile-processing: "#7b601f"
  mobile-processing-surface: "#f6f0de"
  mobile-completed: "#326847"
  mobile-completed-surface: "#e8f3e9"
typography:
  mobile-title:
    fontFamily: "'PingFang SC', 'Microsoft YaHei', system-ui, sans-serif"
    fontSize: "27px"
    fontWeight: 650
    lineHeight: 1.3
    letterSpacing: "-0.5px"
  mobile-body:
    fontFamily: "'PingFang SC', 'Microsoft YaHei', system-ui, sans-serif"
    fontSize: "15px"
    lineHeight: 1.6
  mobile-input:
    fontFamily: "'PingFang SC', 'Microsoft YaHei', system-ui, sans-serif"
    fontSize: "16px"
    lineHeight: 1.7
  mobile-label:
    fontFamily: "'PingFang SC', 'Microsoft YaHei', system-ui, sans-serif"
    fontSize: "12px"
rounded:
  mobile-input: "11px"
  mobile-button: "12px"
  mobile-card: "16px"
  mobile-status: "5px"
spacing:
  mobile-inline: "20px"
  mobile-card-padding: "16px"
  mobile-field-gap: "23px"
components:
  mobile-button-primary:
    backgroundColor: "{colors.mobile-button}"
    textColor: "{colors.mobile-surface}"
    rounded: "{rounded.mobile-button}"
    padding: "13px 20px"
  mobile-button-primary-active:
    backgroundColor: "#37694b"
  mobile-input:
    backgroundColor: "#fcfdf9"
    textColor: "{colors.mobile-ink}"
    typography: "{typography.mobile-input}"
    rounded: "{rounded.mobile-input}"
    padding: "12px"
  mobile-card:
    backgroundColor: "{colors.mobile-surface}"
    rounded: "{rounded.mobile-card}"
  mobile-status-pending:
    backgroundColor: "{colors.mobile-pending-surface}"
    textColor: "{colors.mobile-pending}"
    rounded: "{rounded.mobile-status}"
    padding: "2px 7px"
---

# Design System: 乡居共治

## Overview

**Creative North Star: "乡居共治"**

沿用现有森林绿界面与浅绿白表面。桌面主要色彩来自 `src/index.css` 的 `--ui-*` 变量；手机使用独立的 `src/mobile/base.css` 与 `mobile.css`，延续既有品牌，不替换桌面视觉系统。正文使用系统中文无衬线字体，图标统一 Lucide。

桌面工作区是 Operate 模式：紧凑顶部品牌与统计条，场景工具栏，主要空间视窗，右侧可收起业务面板。大部分首屏面积留给3D。手机为村民日常任务提供单列列表、明确主动作与受保护焦点的表单。

**Key Characteristics:**

- 森林绿主动作与浅绿白表面。
- 中文可读性优先，状态同时使用颜色、文字和图标。
- 桌面空间工作区与手机单列任务界面分别适配。

## Colors

### Primary

桌面森林绿用于品牌和工作区操作；手机深森林绿用于首页上报入口，标准主按钮使用稍浅的绿色。手机浅绿用于语音辅助区和选中选项。

### Neutral

浅绿白为画布，白色用于列表、表单与弹窗。深绿色文字承担主要信息，灰绿用于解释、时间和辅助信息，浅绿灰描边区分输入与分组。

### Status

桌面问题以红、橙、绿区分风险与状态。手机待受理为暖棕色、处理中为黄棕色、已办结为绿色，每种状态都有浅色底及对应文字；地图点沿用相应状态语义。

**The 状态有文字 Rule.** 状态颜色始终配合可读标签，不能只靠色相传达进展。

## Typography

正文和标题沿用中文系统无衬线栈。手机大标题使用中等偏重字重与紧凑字距；事件描述保持较宽行高，表单输入以可读性为先。这里记录实际交付的系统字栈，不将它推广为未来宣传页面的展示字体。

### Hierarchy

- 页面标题使用 `mobile-title`；详情标题为（25px），首页任务标题为（34px），小于（359px）视口时为（30px）。这些是已交付任务界面的局部层级。
- 正文使用 `mobile-body`；事件列表标题为（16px、600），描述行高为（1.9）。
- 输入框、搜索框、原文编辑和称呼编辑统一（16px）。
- 状态、导航、时间和辅助提示使用 `mobile-label`；表单标签为（15px、600）。

**The 输入可读 Rule.** 手机输入保持（16px），不为容纳更多字段缩小输入文字。

## Layout

桌面保留紧凑顶部、空间主视窗和右侧可收起业务面板。布局改变时空间视图自动调整尺寸。

手机应用壳最大宽度（480px），高度为（100dvh）；桌面浏览手机端时居中。品牌与村名位于顶部，四项导航位于底部，中间内容独立滚动。常规页面两侧留白（20px），窄于（359px）时缩至（15px）；达到（700px）视口时外壳增加侧边线。安全区用于顶部、底部导航和表单提交栏。

上报使用全屏原生 dialog；地图选点、称呼编辑及说明使用居中 dialog，最大宽度（448px），距屏幕两侧至少（16px）。照片使用全屏深色预览。表单有独立滚动区和固定提交栏；关闭时保留草稿。

## Elevation & Depth

以浅色表面、描边与留白组织层次，阴影用于应用壳、首页主入口、事件点及浮起弹窗；实景地图控件以白底与描边区分层次。桌面浮层阴影沿用 `--ui-floating-shadow`，夜间使用既有深色变量，不以手机配色覆盖桌面夜间系统。

手机弹窗使用柔和遮罩；居中弹窗阴影承担浮起层级。焦点轮廓为（3px）浅绿、偏移（3px）。按钮禁用透明度为（0.48）。动画仅用于状态反馈：按钮背景短暂变化、处理旋转与录音条反馈；遵守减少动画偏好。

## Shapes

手机主入口、列表、个人资料、语音辅助区、回执和居中弹窗统一为 `mobile-card` 圆角。标准按钮采用 `mobile-button`；表单输入和录音按钮为 `mobile-input`；状态徽标使用较小的 `mobile-status`。实景地图面板采用 `mobile-card` 圆角，缩略图为（10px）；圆形用于头像、点位和图标按钮。全屏表单与照片预览不加圆角。

## Components

### Buttons

标准主按钮为绿色底白字，最小高度（49px），水平与垂直内边距由前置 tokens 定义。小按钮最小高度（42px）。按下时变为浅一些的绿色；键盘焦点有清晰轮廓，禁用状态降低透明度。文字按钮用于取消、返回和次要动作；圆形图标按钮用于关闭和视图切换。

### Chips

状态徽标为小圆角、浅色底和较深文字。办理筛选选项最小高度（40px），默认浅绿、选中深绿白字，并配合程序化选中状态。

### Cards / Containers

列表、设置和回执使用白色平面容器；内部条目以细线分隔。首页主上报入口和个人资料使用深绿底；不要把这些反色主动作的色彩扩散到普通事件条目。卡片边界以表面色和形状为主，避免每个容器都加浮层阴影。

### Inputs / Fields

浅绿白底、浅色描边、统一输入圆角与（12px）内边距。聚焦时描边转绿并切换白底。错误在对应字段下方以暖棕文字展示；提交错误使用浅暖色提示块。分类选择为三列图标按钮，选中后加深绿色描边和文字。

### Navigation

手机底部四项为首页、随手报、进度、我的；白底、顶部分隔线，图标在上、文字在下。激活项加深绿色及字重，随手报有浅绿图标容器。导航链接最小高度（48px）。桌面继续沿用原有场景工具栏与业务面板导航。

### Voice / Map / Scene

录音按钮长按开始，松开处理，上滑取消；准备、转写、整理均有文字状态及取消操作。录音取消态使用暖红，原文可展开修改并重试整理；音量条是录音状态反馈，不代表实测音量。

手机地图采用桌面真实模型生成的同一 PNG，保留完整图像比例与建筑纹理。地图上方用紧凑浅色标签显示“实景投影”和村名，顶部村名为当前同步状态，不做选村按钮。首屏保留主上报入口，并提供实景地图缩略入口。地图支持单指平移、双指缩放、轻点选点和完整范围复位；控件与事件标记可点区域至少（44px），可见标记保持小尺寸以减少对底图的遮挡。

地图面板使用（16px）圆角、浅色描边和（12px）辅助文字；控件沿右下排列，说明固定在影像外侧，避免遮盖建筑。载入、未共享和失败均在地图区域给出明确说明与恢复路径。切换村庄显示状态提示；投影更新后要求重新确认位置，不靠移动旧标记掩盖版本变化。图像外留白、拖动与缩放手势不触发选点。

实景地图不表示已核实的 GPS 或测绘位置，不添加无依据的正北、米制比例尺或建筑数量。桌面默认 3D 主视窗与左下二维小地图，可展开为左右对照。桌面模拟村庄继续使用低多边形建筑、柔和自然光、灰瓦与暖白墙、规整农田和水系；夜间由真实照明及发光材质表达。

### Desktop Governance Documents / Assistant

本节只补充桌面治理终端的局部组件规则，沿用既有桌面 `web-*` 色彩与 `--ui-*` 来源；前置 token、手机组件和 sidecar 保持原样。终端与实景工作台使用同一顶栏，品牌左侧叶子图标兼作页面菜单触发器。菜单为浅色浮层，条目同时呈现图标、页面名称、用途说明与选中状态，键盘可移动选择并返回触发器；不把整块品牌文字改成无说明的链接。

治理事实条以细分隔组织数据，数字使用等宽数字特性；计数、单位与统计口径分层，月度数据和当前状态各自保留文字标签。档案列表与月报共用浅色面板，列表条目使用细线及留白分隔，月报采用居中的文档标题、模型和时间信息、分段正文、来源及导出动作。治理正文保持较宽行距（13px、1.95），长标题和长文字可换行；这些是桌面文档组件的局部规格，不覆盖手机输入字号。宽屏使用左右档案与月报；窄于或等于（925px）时上下排列，窄于或等于（650px）时事实条改为两列，统计图和地点列表改为单列。

治理标准按钮采用紧凑圆角（7px），高度至少（38px）；输入、搜索和月份控件保持浅色表面与描边。搜索和助手输入的占位文字采用灰绿（#647061）且不降低透明度，以便在默认浅色输入表面上达到普通文字的对比度要求。状态标签以小圆角（4px）、明确文字和必要图标表达待生成、整理中、已留痕、失败与撤回；不能因颜色相近省略状态名。当前归档正文与原始办理流程通过分组和说明区分，模型输出始终保留来源与整理稿属性。

助手入口为右下圆形机器人图标，平时不展示对话。打开后使用右侧原生模态对话框，宽度不超过（450px），窄视口占满可用宽度；标题、村庄与月份、滚动对话和固定输入区相互分开。回复使用普通段落、可核对来源和单独建议区，数据边界使用默认折叠说明。浮层使用既有深绿阴影语义与柔和遮罩，焦点轮廓清晰；侧栏入场与处理中动画遵守减少动画偏好。该组件模式不推广为手机页面的新导航或全局聊天层。

### Desktop Event Photos

桌面事件详情在描述下展示现场照片与数量；单张占满详情栏，多张采用两列缩略图。缩略图可裁切以统一浏览，大图保持完整比例。点击进入原生模态预览，使用既有浅色表面、森林绿文字、柔和深绿遮罩；预览保留事件标题、照片序号、关闭和多图切换操作。Escape 关闭后焦点回到原缩略图，读取失败显示明确说明与重试入口，不以占位图片冒充现场。

已办结事项查看后只隐藏桌面空间标记，详情、列表和治理档案继续可查；重新办理恢复标记。此查看状态不改变事件颜色语义、业务状态或手机地图。

## Do's and Don'ts

### Do:

- **Do** 沿用森林绿、浅绿白和 Lucide 图标，保留桌面既有视觉系统。
- **Do** 为状态、忙碌、错误、焦点与禁用提供明确的文字或交互反馈。
- **Do** 保持手机输入文字（16px），导航辅助标签至少（12px）。
- **Do** 为手机顶部、导航和提交栏保留安全区，并尊重减少动画偏好。

### Don't:

- **Don't** 只用颜色表达问题状态。
- **Don't** 将实景模型投影呈现为已核实的 GPS 或测绘定位，也不要将旧村庄底图套在新村庄名称下。
- **Don't** 用手机新规则覆盖桌面工作区及夜间场景的既有样式。
