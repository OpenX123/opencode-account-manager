import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";

const savedTheme = window.localStorage.getItem("ocam-theme");
const initialTheme =
  savedTheme === "light" || savedTheme === "dark"
    ? savedTheme
    : window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light";
document.documentElement.dataset.theme = initialTheme;

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
