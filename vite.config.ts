import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    // Erlaubt die Preview-Hosts der Sandbox (z. B. *.e2b.app)
    allowedHosts: true,
  },
});
