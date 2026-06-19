import * as net from "node:net";
import * as fs from "node:fs";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
  CallToolResult,
} from "@modelcontextprotocol/sdk/types.js";
import { SocketTransport } from "./transport.js";
import { cleanupSocket } from "../context/session.js";

export interface McpTool extends Tool {
  execute(args: Record<string, unknown>): Promise<CallToolResult>;
}

export class CmdMcpServer {
  private server: net.Server;
  private mcpServer: Server;

  constructor(
    private readonly socketPath: string,
    private readonly tools: McpTool[] = [] // We will inject tools here
  ) {
    this.mcpServer = new Server(
      {
        name: "cmd-lite-mcp",
        version: "0.1.0",
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.setupHandlers();

    this.server = net.createServer((socket) => {
      const transport = new SocketTransport(socket);
      this.mcpServer.connect(transport).catch(console.error);
    });

    this.server.on("error", (err) => {
      console.error("[MCP] Server error:", err);
    });
  }

  private setupHandlers(): void {
    this.mcpServer.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: this.tools.map((t) => ({
          name: t.name,
          description: t.description,
          inputSchema: t.inputSchema,
        })),
      };
    });

    this.mcpServer.setRequestHandler(CallToolRequestSchema, async (request) => {
      const tool = this.tools.find((t) => t.name === request.params.name);
      if (!tool) {
        throw new Error(`Tool not found: ${request.params.name}`);
      }
      return await tool.execute(request.params.arguments || {});
    });
  }

  public start(): void {
    cleanupSocket(this.socketPath);
    this.server.listen(this.socketPath, () => {
      try {
        fs.chmodSync(this.socketPath, 0o600);
      } catch {
        // best-effort
      }
    });
  }

  public stop(): void {
    this.mcpServer.close();
    this.server.close();
    cleanupSocket(this.socketPath);
  }
}
