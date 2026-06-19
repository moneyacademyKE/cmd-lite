import * as net from "node:net";
import { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import { JSONRPCMessage } from "@modelcontextprotocol/sdk/types.js";

/**
 * A custom MCP transport that wraps a standard node:net Socket.
 * Useful for communicating over Unix Domain Sockets (UDS) or named pipes.
 */
export class SocketTransport implements Transport {
  private buffer = "";

  onclose?: () => void;
  onerror?: (error: Error) => void;
  onmessage?: (message: JSONRPCMessage) => void;

  constructor(private readonly socket: net.Socket) {}

  async start(): Promise<void> {
    this.socket.on("data", (chunk) => {
      this.buffer += chunk.toString("utf8");
      this.processBuffer();
    });

    this.socket.on("error", (err) => {
      if (this.onerror) {
        this.onerror(err);
      }
    });

    this.socket.on("close", () => {
      if (this.onclose) {
        this.onclose();
      }
    });
  }

  private processBuffer(): void {
    // Basic newline-delimited JSON (JSON-ND) parser
    let newlineIndex: number;
    while ((newlineIndex = this.buffer.indexOf("\n")) >= 0) {
      const line = this.buffer.slice(0, newlineIndex).trim();
      this.buffer = this.buffer.slice(newlineIndex + 1);

      if (line) {
        try {
          const message = JSON.parse(line) as JSONRPCMessage;
          if (this.onmessage) {
            this.onmessage(message);
          }
        } catch (error) {
          if (this.onerror) {
            this.onerror(new Error(`Failed to parse message: ${error}`));
          }
        }
      }
    }
  }

  async close(): Promise<void> {
    this.socket.destroy();
  }

  async send(message: JSONRPCMessage): Promise<void> {
    if (!this.socket.writable) {
      throw new Error("Socket is not writable");
    }
    const data = JSON.stringify(message) + "\n";
    this.socket.write(data);
  }
}
