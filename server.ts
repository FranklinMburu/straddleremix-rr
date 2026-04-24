import express from "express";
import { createServer as createViteServer } from "vite";
import { spawn } from "child_process";
import path from "path";
import { createProxyMiddleware } from "http-proxy-middleware";

async function startServer() {
  const app = express();
  const PORT = 3000;
  const PYTHON_PORT = 8000;

  let pythonProcess: any = null;

  const startPython = () => {
    console.log("🚀 Starting MT5 Trading Engine (Python)...");
    const pythonCmd = process.platform === "win32" ? "python" : "python3";
    
    pythonProcess = spawn(pythonCmd, ["main.py"], {
      stdio: "inherit",
      env: { ...process.env, PYTHONUNBUFFERED: "1" }
    });

    pythonProcess.on("error", (err: any) => {
      console.error("❌ Failed to start Python engine:", err);
    });

    pythonProcess.on("exit", (code: number) => {
      if (code !== 0 && code !== null) {
        console.log(`⚠️ Python engine exited with code ${code}. Restarting in 5s...`);
        setTimeout(startPython, 5000);
      }
    });
  };

  startPython();

  // Handle cleanup on Exit
  const cleanup = () => {
    if (pythonProcess) {
      console.log("🛑 Killing Python engine...");
      pythonProcess.kill();
    }
  };

  process.on("SIGINT", () => {
    cleanup();
    process.exit();
  });

  process.on("SIGTERM", () => {
    cleanup();
    process.exit();
  });

  // API Proxy to Python Engine
  app.use(
    "/api",
    createProxyMiddleware({
      target: `http://127.0.0.1:${PYTHON_PORT}`,
      changeOrigin: true,
      on: {
        error: (err, req, res: any) => {
          res.status(503).json({ 
            error: "Python Backend Unreachable", 
            details: "The MT5 Engine is initializing or failed to start. Check server logs." 
          });
        }
      }
    })
  );

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`✨ Dashboard ready at http://localhost:${PORT}`);
  });
}

startServer();
