import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import { App } from "./App";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

if ("serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", () => {
    void navigator.serviceWorker
      .register("/sw.js")
      .then(async () => {
        const reg = await navigator.serviceWorker.ready;
        const urls = Array.from(
          document.querySelectorAll<HTMLScriptElement | HTMLLinkElement>(
            "script[src], link[rel='stylesheet'][href], link[rel='modulepreload'][href]",
          ),
        )
          .map((el) => ("src" in el ? el.src : el.href))
          .filter((u) => u && u.startsWith(window.location.origin));
        reg.active?.postMessage({ type: "PRECACHE_URLS", urls });
      })
      .catch(() => undefined);
  });
}
