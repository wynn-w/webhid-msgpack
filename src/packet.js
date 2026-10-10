const DEFAULT_MTU = 64;
const DEFAULT_TYPE = 0xcc;

function checksum(packet) {
  return packet.reduce((sum, byte) => sum + byte, 0) & 0xff;
}

export function packetize(data, mtu = DEFAULT_MTU, type = DEFAULT_TYPE) {
  if (data.length <= mtu - 4) {
    const packet = new Uint8Array(mtu);
    const packetLength = data.length + 4;

    packet[0] = 0xa5;
    packet[1] = packetLength;
    packet[2] = type;
    packet.set(data, 3);
    packet[packetLength - 1] = checksum(packet);

    return [packet];
  }

  const packets = [];
  const chunkSize = mtu - 5;
  const packetCount = Math.ceil(data.length / chunkSize);

  for (let index = 0; index < packetCount; index += 1) {
    const start = index * chunkSize;
    const chunk = data.slice(start, start + chunkSize);
    const packet = new Uint8Array(mtu);
    const packetLength = chunk.length + 5;

    packet[0] = 0xa4;
    packet[1] = packetLength;
    packet[2] = type;
    packet[3] = packetCount - index;
    packet.set(chunk, 3);
    packet[packetLength - 1] = checksum(packet);
    packets.push(packet);
  }

  return packets;
}

export function createDepacketizer() {
  let chunks = [];

  return (packet) => {
    if (packet.length < 4) return undefined;

    if (packet[0] === 0xa5) {
      return packet.slice(3, packet[1] - 1);
    }

    if (packet[0] !== 0xa4) return undefined;

    if (packet[2] > 0x80) {
      chunks = [];
    }

    chunks.push(...packet.slice(4, packet[1] - 1));
    return packet[2] === 1 ? new Uint8Array(chunks) : undefined;
  };
}

export function getUsedReportBytes(report) {
  if (report.length < 4) return undefined;
  if (report[0] !== 0xa4 && report[0] !== 0xa5) return undefined;

  const packetLength = report[1];
  if (packetLength < 4 || packetLength > report.length) return undefined;

  return report.slice(0, packetLength);
}

export function toHex(data) {
  return Array.from(data, (byte) => byte.toString(16).padStart(2, "0").toUpperCase()).join(" ");
}
