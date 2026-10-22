import { createApp } from './app';
import { config } from './config';
import { migrate } from './db';

async function main() {
  await migrate();
  createApp().listen(config.port, () => {
    console.log(`MiniLedger API listening on http://localhost:${config.port}`);
  });
}

main().catch((err) => {
  console.error('Failed to start:', err);
  process.exit(1);
});
