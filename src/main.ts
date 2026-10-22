import { log } from "./log";
import { registerServiceWorker, requestPersistence } from "./pwa";
import { mountShell } from "./ui/shell";

log("music-practice start");
const app = document.getElementById("app");
if (app) mountShell(app);

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
