import { log } from "./log";
import { registerServiceWorker, requestPersistence } from "./pwa";
import { makeTodayPort } from "./app/todayPort";
import { getEffectiveConfig } from "./config";
import { nowIso } from "./dates";
import { newId } from "./data/schema";
import { store } from "./data/store";
import { mountShell } from "./ui/shell";
import "./ui/today.css";

log("music-practice start");
const app = document.getElementById("app");
if (app) {
  const today = makeTodayPort(store, { newId, nowIso: () => nowIso(), getEffectiveConfig });
  mountShell(app, { today });
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
