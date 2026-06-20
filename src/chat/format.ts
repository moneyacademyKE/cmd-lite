import { stripAnsi } from "../util/util";

export { stripAnsi };

export function markdownFromCli(chunk: string): string {
  return stripAnsi(chunk);
}