require('dotenv').config();
const redis = require('redis');

const client = redis.createClient({
  socket: {
    host: process.env.REDIS_HOST,
    port: process.env.REDIS_PORT,
  },
  password: process.env.REDIS_PASSWORD,
});

client.on( 'connect', () => {
  console.log( 'Conectado a Redis' );
});

client.on( 'error', ( err ) => {
  console.error( 'Error en Redis:', err );
});

(
  async () => {
    try {
      await client.connect();
      console.log( 'Redis está listo' );
    } catch ( err ) {
      console.error( 'Error al conectar a Redis:', err );
    }
  }
)();

module.exports = client;