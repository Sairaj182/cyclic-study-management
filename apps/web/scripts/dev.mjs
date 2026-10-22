/* global process */
import { spawn } from "node:child_process";

const nextCommand = process.platform === "win32" ? "next.cmd" : "next";
const port = process.env.PORT_MAIN_WEBSITE ?? "3000";
const child = spawn(
  nextCommand,
  ["dev", "--hostname", "0.0.0.0", "--port", port],
  {
    stdio: "inherit",
    env: process.env,
    shell: process.platform === "win32",
  },
);

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
  } else {
    process.exit(code ?? 1);
  }
});
