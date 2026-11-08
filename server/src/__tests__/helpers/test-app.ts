import express, { Router } from 'express';
import { errorHandler } from '../../middleware';

export function createTestApp(router: Router, prefix: string) {
  const app = express();
  app.use(express.json());
  app.use(prefix, router);
  app.use(errorHandler);
  return app;
}
