import { describe, it, expect, vi, beforeEach } from "vitest";
import { registerChatParticipant } from "../chat/participant";
import * as vscode from "vscode";

vi.mock("vscode", () => {
  const chat = {
    createChatParticipant: vi.fn(() => ({
      iconPath: "",
      followupProvider: undefined,
    })),
  };
  return {
    chat,
    EventEmitter: class {
      event = vi.fn();
      fire = vi.fn();
    },
    Uri: {
      joinPath: vi.fn(() => ({ fsPath: "icon.png" })),
    },
  };
});

describe("participant tests", () => {
  let mockContext: vscode.ExtensionContext;

  beforeEach(() => {
    mockContext = {
      extensionUri: { fsPath: "/tmp" },
      subscriptions: {
        push: vi.fn(),
      },
    } as unknown as vscode.ExtensionContext;
    vi.clearAllMocks();
  });

  it("should register the chat participant correctly", () => {
    registerChatParticipant(mockContext);
    expect(vscode.chat.createChatParticipant).toHaveBeenCalledWith(
      "cmd-lite.chat",
      expect.any(Function)
    );
  });

  it("should provide relevant followups for design and fix commands", () => {
    let capturedParticipant: { iconPath: string; followupProvider?: vscode.ChatFollowupProvider } | undefined;
    vi.mocked(vscode.chat.createChatParticipant).mockImplementation((_id, _handler) => {
      capturedParticipant = {
        iconPath: "",
        followupProvider: undefined,
      };
      return capturedParticipant as unknown as vscode.ChatParticipant;
    });

    registerChatParticipant(mockContext);
    expect(capturedParticipant).toBeDefined();
    const provider = capturedParticipant?.followupProvider;
    expect(provider).toBeDefined();

    const designFollowups = provider?.provideFollowups(
      { metadata: { command: "design" } } as vscode.ChatResult,
      {} as unknown as vscode.ChatContext,
      {} as unknown as vscode.CancellationToken
    );
    expect(designFollowups).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: "Polish animations" }),
        expect.objectContaining({ label: "Audit a11y" }),
      ])
    );

    const fixFollowups = provider?.provideFollowups(
      { metadata: { command: "fix" } } as vscode.ChatResult,
      {} as unknown as vscode.ChatContext,
      {} as unknown as vscode.CancellationToken
    );
    expect(fixFollowups).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: "Run build" }),
        expect.objectContaining({ label: "Run tests" }),
      ])
    );
  });
});
