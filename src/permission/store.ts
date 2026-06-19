import * as vscode from "vscode";
import type { PermissionChoice } from "./gate";

const PERMISSION_STORE_KEY = "cmd-lite.permissionStore";
let _globalState: vscode.Memento | null = null;

export function initializePermissionStore(context: vscode.ExtensionContext): void {
  _globalState = context.globalState;
}

function getStore(): Record<string, PermissionChoice> {
  return (_globalState?.get<Record<string, PermissionChoice>>(PERMISSION_STORE_KEY) ?? {});
}

function saveStore(store: Record<string, PermissionChoice>): void {
  _globalState?.update(PERMISSION_STORE_KEY, store);
}

export function checkPermissionStore(key: string): PermissionChoice | null {
  return getStore()[key] ?? null;
}

export function setPermissionStore(key: string, choice: "allow-always" | "deny-always"): void {
  const store = getStore();
  store[key] = choice;
  saveStore(store);
}

export function clearPermissionStore(key?: string): void {
  if (key) {
    const store = getStore();
    delete store[key];
    saveStore(store);
  } else {
    saveStore({});
  }
}
