import { createDepacketizer, getUsedReportBytes, packetize, toHex } from "./packet.js";

const REPORT_ID = 0;
const MTU = 64;
const REQUEST_TIMEOUT = 5000;

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

export class WebHIDClient extends EventTarget {
  #device = null;
  #requestPending = false;
  #cancelRequest = null;
  #requestNumber = 0;

  get device() {
    return this.#device;
  }

  get connected() {
    return Boolean(this.#device?.opened);
  }

  async connect() {
    this.#checkBrowserSupport();

    const devices = await navigator.hid.requestDevice({ filters: [] });
    const device = devices[0];
    if (!device) throw new Error("未选择 HID 设备");

    if (!device.opened) {
      await device.open();
    }

    this.#device = device;
    navigator.hid.addEventListener("disconnect", this.#handleDisconnect);
    return this.#readDeviceInfo(device);
  }

  async disconnect() {
    const device = this.#device;
    this.#device = null;
    this.#cancelRequest?.(new Error("设备连接已断开"));
    navigator.hid?.removeEventListener("disconnect", this.#handleDisconnect);

    if (device?.opened) {
      await device.close();
    }

    this.dispatchEvent(new CustomEvent("disconnected", { detail: { reason: "requested" } }));
  }

  async request(message, timeout = REQUEST_TIMEOUT) {
    if (!this.connected) {
      throw new Error("设备未连接，请先连接 HID 设备");
    }
    if (this.#requestPending) {
      throw new Error("上一条请求仍在等待响应");
    }

    const codec = window.MessagePack;
    if (!codec?.encode || !codec?.decode) {
      throw new Error("MsgPack 加载失败，请检查网络连接");
    }

    const device = this.#device;
    const packets = packetize(codec.encode(message), MTU);
    const depacketize = createDepacketizer();
    const requestNumber = ++this.#requestNumber;
    let receivedPacketNumber = 0;
    this.#requestPending = true;

    return new Promise((resolve, reject) => {
      let finished = false;
      let timeoutId;

      const cleanup = () => {
        if (finished) return;
        finished = true;
        clearTimeout(timeoutId);
        device.removeEventListener("inputreport", handleInput);
        this.#requestPending = false;
        this.#cancelRequest = null;
      };

      const fail = (error) => {
        cleanup();
        reject(error instanceof Error ? error : new Error(String(error)));
      };

      const handleInput = (event) => {
        try {
          const report = new Uint8Array(
            event.data.buffer,
            event.data.byteOffset,
            event.data.byteLength,
          );
          const usedBytes = getUsedReportBytes(report);
          if (usedBytes) {
            receivedPacketNumber += 1;
            this.#emitReport("reportreceived", event.reportId, usedBytes, {
              requestNumber,
              packetNumber: receivedPacketNumber,
              packetCount: report[0] === 0xa5 ? 1 : undefined,
            });
          }

          const content = depacketize(report);
          if (!content) return;

          const response = codec.decode(content);
          cleanup();
          resolve(response);
        } catch (error) {
          fail(new Error(`响应解包失败：${errorMessage(error)}`));
        }
      };

      timeoutId = setTimeout(() => {
        fail(new Error(`等待设备响应超时（${timeout} ms）`));
      }, timeout);

      this.#cancelRequest = fail;
      device.addEventListener("inputreport", handleInput);
      this.#sendPackets(device, packets, requestNumber).catch((error) => {
        fail(new Error(`发送 HID 报告失败：${errorMessage(error)}`));
      });
    });
  }

  async #sendPackets(device, packets, requestNumber) {
    for (const [index, packet] of packets.entries()) {
      await device.sendReport(REPORT_ID, packet);

      const usedBytes = getUsedReportBytes(packet);
      if (usedBytes) {
        this.#emitReport("reportsent", REPORT_ID, usedBytes, {
          requestNumber,
          packetNumber: index + 1,
          packetCount: packets.length,
        });
      }
    }
  }

  #emitReport(eventName, reportId, data, packetInfo) {
    this.dispatchEvent(
      new CustomEvent(eventName, {
        detail: { reportId, data, hex: toHex(data), ...packetInfo },
      }),
    );
  }

  #checkBrowserSupport() {
    if (!window.isSecureContext) {
      throw new Error("WebHID 需要通过 HTTPS 或 localhost 访问");
    }
    if (!("hid" in navigator)) {
      throw new Error("当前浏览器不支持 WebHID，请使用最新版 Chrome 或 Edge");
    }
  }

  #readDeviceInfo(device) {
    return {
      productName: device.productName || "未命名设备",
      vendorId: device.vendorId,
      productId: device.productId,
    };
  }

  #handleDisconnect = (event) => {
    if (event.device !== this.#device) return;

    this.#device = null;
    this.#cancelRequest?.(new Error("设备连接已断开"));
    navigator.hid.removeEventListener("disconnect", this.#handleDisconnect);
    this.dispatchEvent(new CustomEvent("disconnected", { detail: { reason: "removed" } }));
  };
}
