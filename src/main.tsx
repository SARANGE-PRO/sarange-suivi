import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./styles.css";

// iOS Safari ignore user-scalable=no : on bloque le pincement (zoom) à la main.
document.addEventListener("gesturestart", (event) => event.preventDefault());
document.addEventListener(
  "touchmove",
  (event) => {
    if (event.touches.length > 1) {
      event.preventDefault();
    }
  },
  { passive: false }
);

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
