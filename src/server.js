const fastify = require('fastify')({ logger: true });

const PORT = Number(process.env.PORT || 3000);
const HOST = '0.0.0.0';

fastify.get('/', async () => {
  return {
    ok: true,
    app: 'Nevel Flow AI',
    message: 'Root route is running'
  };
});

fastify.get('/health', async () => {
  return {
    ok: true,
    app: 'Nevel Flow AI',
    message: 'Server is running'
  };
});

const start = async () => {
  try {
    await fastify.listen({ port: PORT, host: HOST });
    fastify.log.info(`Nevel Flow AI running on ${HOST}:${PORT}`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();
