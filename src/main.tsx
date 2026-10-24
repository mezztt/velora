import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./desktopApp";      // app de escritorio: pantalla «Sistema detenido por falta de pago»

import "@fontsource/inter/400.css";
import "@fontsource/inter/600.css";
import "@fontsource/inter/700.css";

import "./index.css";
import "./velora-polish.css";
import "./velora-ui.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);