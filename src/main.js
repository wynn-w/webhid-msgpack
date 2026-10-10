import { WebHIDClient } from "./webhid-client.js";

const client = new WebHIDClient();
const ui = {
  connectButton: document.querySelector("[data-connect]"),
  disconnectButton: document.querySelector("[data-disconnect]"),
  commandButtons: [...document.querySelectorAll("[data-command]")],
  clearButton: document.querySelector("[data-clear]"),
  console: document.querySelector("[data-console]"),
  status: document.querySelector("[data-status]"),
  device: document.querySelector("[data-device]"),
  statusDot: document.querySelector("[data-status-dot]"),
  logTemplate: document.querySelector("[data-log-template]"),
  emptyTemplate: document.querySelector("[data-empty-template]"),
};

let busyMessage = "";
let deviceInfo = null;

function formatError(error) {
  return error instanceof Error ? error.message : String(error);
}

function formatHexId(value) {
  return `0x${value.toString(16).padStart(4, "0").toUpperCase()}`;
}

function currentTime() {
  return new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(new Date());
}

function renderControls() {
  const busy = Boolean(busyMessage);
  const connected = client.connected;

  ui.status.textContent = busyMessage || (connected ? "已连接" : "未连接");
  ui.device.textContent = connected ? deviceInfo?.productName || "HID 设备" : "等待选择设备";
  ui.statusDot.classList.toggle("online", connected);
  ui.connectButton.disabled = busy || connected;
  ui.disconnectButton.disabled = busy || !connected;

  for (const button of ui.commandButtons) {
    button.disabled = busy || !connected;
  }
}

function setBusy(message = "") {
  busyMessage = message;
  renderControls();
}

function appendLog({ level, title, message, data }) {
  const entry = ui.logTemplate.content.firstElementChild.cloneNode(true);

  entry.classList.add(level);
  entry.querySelector("[data-log-level]").textContent = level;
  entry.querySelector("[data-log-time]").textContent = currentTime();
  entry.querySelector("[data-log-title]").textContent = title;
  entry.querySelector("[data-log-message]").textContent = message;

  const dataElement = entry.querySelector("[data-log-data]");
  if (data === undefined) {
    dataElement.remove();
  } else {
    dataElement.textContent = JSON.stringify(data, null, 2);
  }

  ui.console.querySelector(".empty-state")?.remove();
  ui.console.prepend(entry);
}

function appendReport(direction, report) {
  appendLog({
    level: direction,
    title: direction === "tx" ? "发送 HID Report" : "接收 HID Report",
    message: `${report.hex}\nReport ID ${report.reportId} · ${report.data.length} bytes`,
  });
}

async function connectDevice() {
  setBusy("正在连接…");

  try {
    deviceInfo = await client.connect();
    appendLog({
      level: "success",
      title: "设备连接成功",
      message: [
        deviceInfo.productName,
        `VID ${formatHexId(deviceInfo.vendorId)}`,
        `PID ${formatHexId(deviceInfo.productId)}`,
      ].join(" · "),
      data: deviceInfo,
    });
  } catch (error) {
    appendLog({ level: "error", title: "连接失败", message: formatError(error) });
  } finally {
    setBusy();
  }
}

async function disconnectDevice() {
  setBusy("正在断开…");

  try {
    await client.disconnect();
  } catch (error) {
    appendLog({ level: "error", title: "断开失败", message: formatError(error) });
  } finally {
    setBusy();
  }
}

async function sendCommand(command) {
  const request = { c: command };
  setBusy(`等待 ${command} 响应…`);
  appendLog({
    level: "request",
    title: `发送 ${command}`,
    message: JSON.stringify(request),
    data: request,
  });

  try {
    const response = await client.request(request);
    appendLog({
      level: "success",
      title: `${command} 响应成功`,
      message: "MsgPack 响应已解包。",
      data: response,
    });
  } catch (error) {
    appendLog({ level: "error", title: `${command} 通信失败`, message: formatError(error) });
  } finally {
    setBusy();
  }
}

function clearLogs() {
  ui.console.replaceChildren(ui.emptyTemplate.content.cloneNode(true));
}

ui.connectButton.addEventListener("click", connectDevice);
ui.disconnectButton.addEventListener("click", disconnectDevice);
ui.clearButton.addEventListener("click", clearLogs);

for (const button of ui.commandButtons) {
  button.addEventListener("click", () => sendCommand(button.dataset.command));
}

client.addEventListener("reportsent", (event) => appendReport("tx", event.detail));
client.addEventListener("reportreceived", (event) => appendReport("rx", event.detail));
client.addEventListener("disconnected", (event) => {
  deviceInfo = null;
  setBusy();
  appendLog({
    level: event.detail.reason === "removed" ? "error" : "success",
    title: "设备已断开",
    message: event.detail.reason === "removed" ? "设备已从系统移除。" : "连接已关闭。",
  });
});

renderControls();
