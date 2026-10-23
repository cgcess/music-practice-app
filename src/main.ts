import { log } from "./log";
import { registerServiceWorker, requestPersistence } from "./pwa";
import { makeRepertoirePort } from "./app/repertoirePort";
import { makeTodayPort } from "./app/todayPort";
import { getEffectiveConfig } from "./config";
import { nowIso } from "./dates";
import { newId } from "./data/schema";
import { store } from "./data/store";
import { mountShell } from "./ui/shell";
import "./ui/base.css";
import "./ui/today.css";
import "./ui/repertoire.css";

log("music-practice start");
const app = document.getElementById("app");
if (app) {
  const deps = { newId, nowIso: () => nowIso(), getEffectiveConfig };
  const today = makeTodayPort(store, deps);
  const repertoire = makeRepertoirePort(store, deps);
  mountShell(app, { today, repertoire });
}

void requestPersistence(navigator.storage);
void registerServiceWorker({
  prod: import.meta.env.PROD,
  baseUrl: import.meta.env.BASE_URL,
  serviceWorker: navigator.serviceWorker,
  reload: () => location.reload(),
  onVisible: (fn) =>
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") fn();
    }),
});
