import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import App from "./App";
import { ThemeProvider } from "./lib/theme";
import { RefreshProvider } from "./lib/refresh";
import { LangProvider } from "./lib/i18n";
import "@fontsource-variable/public-sans";
import "@fontsource-variable/vazirmatn";
import "@fontsource-variable/jetbrains-mono";
import "./index.css";

const qc = new QueryClient({ defaultOptions: { queries: { retry: 1, staleTime: 10_000 } } });

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={qc}>
      <LangProvider>
      <ThemeProvider>
        <RefreshProvider>
          <BrowserRouter>
            <App />
          </BrowserRouter>
        </RefreshProvider>
      </ThemeProvider>
      </LangProvider>
    </QueryClientProvider>
  </React.StrictMode>,
);
