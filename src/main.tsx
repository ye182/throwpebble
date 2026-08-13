import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { lockEntryViewport } from "./lib/lockEntryViewport";
import "./styles/app.css";

lockEntryViewport();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
