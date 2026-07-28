import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { ThemeProvider } from "next-themes";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TransportProvider } from "@connectrpc/connect-query";
import App from "./App.tsx";
import AccessGate from "./components/AccessGate.tsx";
import { transport } from "./lib/review-client.ts";
import { AuthProvider } from "./lib/auth-context.tsx";
import "./index.css";

// One QueryClient for the app. connect-query's generated hooks resolve their
// transport from TransportProvider, so components just call useQuery(listDrafts).
const queryClient = new QueryClient();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <TransportProvider transport={transport}>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <ThemeProvider attribute="class" defaultTheme="dark" enableSystem>
            <BrowserRouter>
              <AccessGate>
                <App />
              </AccessGate>
            </BrowserRouter>
          </ThemeProvider>
        </AuthProvider>
      </QueryClientProvider>
    </TransportProvider>
  </StrictMode>,
);
