import { describe, it, expect, vi, afterEach, Mock } from "vitest";
import { CmdMcpServer } from "../mcp/server";
import { terminalTool } from "../mcp/tools/terminal";
import * as net from "node:net";

// Mock net.createServer
vi.mock("node:net", () => ({
  createServer: vi.fn(() => ({
    on: vi.fn(),
    listen: vi.fn(),
    close: vi.fn(),
  })),
}));

vi.mock("vscode", () => ({
  env: { appName: "mock" },
  window: {
    createOutputChannel: vi.fn(() => ({
      appendLine: vi.fn(),
      show: vi.fn(),
    })),
  },
  workspace: {
    workspaceFolders: [],
  },
}));

describe("CmdMcpServer", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("should initialize and register tools", () => {
    const socketPath = "/tmp/fake.sock";
    const server = new CmdMcpServer(socketPath, [terminalTool]);

    expect(server).toBeDefined();
    expect(net.createServer).toHaveBeenCalled();
  });

  it("should start and stop correctly", () => {
    const socketPath = "/tmp/fake.sock";
    const server = new CmdMcpServer(socketPath, [terminalTool]);

    server.start();
    server.stop();

    const mockServer = (net.createServer as Mock).mock.results[0].value;
    expect(mockServer.listen).toHaveBeenCalledWith(socketPath, expect.any(Function));
    expect(mockServer.close).toHaveBeenCalled();
  });
});
