import { log } from "./log";
import { mountShell } from "./ui/shell";

log("music-practice start");
const app = document.getElementById("app");
if (app) mountShell(app);
