# 乡居共治部署说明

当前功能、数据边界与目录结构见 [README](README.md)，阶段验收见 [桌面阶段验收](docs/桌面阶段验收.md)。

## 本地启动

```sh
npm ci
npm run dev -- --host 127.0.0.1 --port 5180 --strictPort
```

打开终端提示的网址。端口占用时选择其他端口；端口变化意味着新的浏览器存储范围。

## 生产构建

```sh
npm run build
npm run preview -- --host 127.0.0.1 --port 5181 --strictPort
```

部署 `dist/` 目录至静态 Web 服务即可。请通过 HTTP(S) 访问，不能直接双击 index.html。站点部署在子路径时需设置 Vite 的 `base` 并重新构建；保留完整的 assets/ 与 vendor/，包括 MapLibre 的 .mjs 工作线程和模型解码器。服务器应正确返回 JavaScript 模块的 MIME 类型。

当前无服务器 API、账号系统或云端数据；事件及上传模型保存在访问者浏览器。上传资源不会自动发布给其他访问者。在线 Sketchfab 模型继续需要外网，程序化青禾村与完整本地模型不依赖外部模型或在线底图。

## 检查

```sh
npm test
npm run lint
npm run build
```

Three.js 和 MapLibre 的引擎包较大，已按场景与地图按需加载；构建仍可能显示分包大小提示。实际浏览器验收范围以阶段验收文档为准。
