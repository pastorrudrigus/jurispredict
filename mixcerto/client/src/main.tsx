import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { AuthProvider } from "./auth";
import { ToastProvider } from "./components/ui";
import "./styles.css";

try {
  const t = localStorage.getItem("mixcerto.theme");
  if (t === "light" || t === "dark") document.documentElement.dataset.theme = t;
} catch { /* sem armazenamento */ }

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <AuthProvider>
      <ToastProvider>
        <App />
      </ToastProvider>
    </AuthProvider>
  </React.StrictMode>,
);
