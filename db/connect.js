const mariadb = require('mariadb');

const pool = mariadb.createPool({
  host: 'localhost',       // Cambia a la IP o el hostname de tu servidor MariaDB
  user: 'root',       // Usuario de la base de datos
  password: 'Katalabs&1', // Contraseña de la base de datos
  database: 'katalabs',    // Nombre de la base de datos
  connectionLimit: 5        // Opcional, límite de conexiones en el pool
});

module.exports = pool;
