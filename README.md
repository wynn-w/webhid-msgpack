# WebHID Demo

这是一个用于检查 WebHID 通信的浏览器示例。页面可以连接任意允许访问的 HID 设备，并发送以下两条预设指令：

```json
{"c":"gMtu"}
```

```json
{"c":"gDevInfo"}
```

通信记录会显示请求内容、有效的 HID 报告字节和 MsgPack 解包结果。

## 本地运行

项目需要 Node.js 和支持 WebHID 的 Chromium 浏览器。

```powershell
npm install
npm run dev
```

打开终端中显示的本地地址，然后点击“连接设备”。WebHID 只能在 `localhost` 或 HTTPS 页面中使用。

## 项目结构

```text
index.html            页面结构和日志模板
src/main.js           页面事件和状态更新
src/webhid-client.js  WebHID 连接与请求处理
src/packet.js         HID 数据包封包和解包
src/styles.css        页面样式
```

## 协议参数

- Report ID：`0`
- MTU：`64`
- 请求超时：`5000 ms`
- MsgPack：通过 CDN 加载 `@msgpack/msgpack@3.1.3`
- 请求方式：一次只发送一个请求，并使用临时 `inputreport` 监听器等待响应


## 构建

```powershell
npm run build
npm run preview
```
