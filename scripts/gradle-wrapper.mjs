import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { platform } from "node:os";

const root = resolve("apps/gateway-android");
const isWindows = platform() === "win32";
const args = process.argv.slice(2);
const wrapperJar = resolve(root, "gradle/wrapper/gradle-wrapper.jar");
const wrapperScript = resolve(root, isWindows ? "gradlew.bat" : "gradlew");

let command;
let commandArgs;
let shell = false;
if (existsSync(wrapperJar)) {
  // ZIP extraction on Unix-like hosts may drop the executable bit from gradlew.
  // Invoke the checked-in shell wrapper through sh instead of failing with EACCES.
  if (!isWindows) {
    command = "sh";
    commandArgs = [wrapperScript, ...(args.length ? args : ["assembleDebug"])];
  } else {
    command = wrapperScript;
    commandArgs = args.length ? args : ["assembleDebug"];
    shell = true;
  }
} else {
  command = isWindows ? "gradle.bat" : "gradle";
  commandArgs = args.length ? args : ["assembleDebug"];
  shell = isWindows;
  console.warn("Gradle wrapper JAR was not present in the original Gateway archive; using installed Gradle from PATH.");
}
const result = spawnSync(command, commandArgs, { cwd: root, stdio: "inherit", shell });
if (result.error) {
  console.error(`Gateway build could not start: ${result.error.message}`);
  console.error("Install a Gradle version compatible with apps/gateway-android/build.gradle.kts, or regenerate the wrapper using the included gradle-wrapper.properties.");
  process.exit(1);
}
process.exit(result.status ?? 1);
