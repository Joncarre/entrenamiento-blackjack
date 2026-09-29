import cors from 'cors';
import express from 'express';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { roundsRouter } from './routes/rounds.js';
import { sessionsRouter } from './routes/sessions.js';
import { statsRouter } from './routes/stats.js';

const here = dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT ?? 4000);

const app = express();
app.use(cors());
app.use(express.json({ limit: '1mb' }));

app.get('/api/health', (_req, res) => res.json({ ok: true }));
app.use('/api/sessions', sessionsRouter);
app.use('/api/rounds', roundsRouter);
app.use('/api/stats', statsRouter);

// En produccion el servidor tambien sirve el build del cliente.
const clientDist = join(here, '..', '..', 'client', 'dist');
if (existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get('*', (_req, res) => res.sendFile(join(clientDist, 'index.html')));
}

app.use((err: any, _req: any, res: any, _next: any) => {
  console.error('[api]', err);
  res.status(500).json({ error: err?.message ?? 'Error interno' });
});

app.listen(PORT, () => {
  console.log(`API de entrenamiento escuchando en http://localhost:${PORT}`);
});
