import "fastify";

declare module "fastify" {
  interface FastifyRequest {
    user: any;
    session: any;
  }
}
