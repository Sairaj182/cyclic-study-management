import { env } from "./env";
import { buildApp } from "./app";

const app = buildApp();

app.listen({ port: env.API_PORT, host: env.HOST }, (err, address) => {

  if (err) {
    app.log.error(err);
    process.exit(1);
  }
  app.log.info(`API running at ${address}`);
});
