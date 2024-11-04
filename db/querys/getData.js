const pool = require("../connect");

async function getMonths() {
    let conn;
    try {
        conn = await pool.getConnection();
        const rows = await conn.query('SELECT * FROM months_catalogue');
        console.log(rows);

        return rows;
    } catch (err) {
        console.error(err);
    } finally {
        if (conn) conn.end(); // abrr: Aquí se libera la conexión.
    }

    return null;
};

async function getFinancialStaments( { year_id, company_id, } ) {
    let conn;
    try {
        conn = await pool.getConnection();

        // Inicia la consulta base
        let query = 'SELECT * FROM financial_statements';
        const queryParams = [];

        // Construye las condiciones WHERE dinámicamente
        const whereConditions = [];

        if ( year_id ) {
            whereConditions.push('year_id = ?');
            queryParams.push( year_id );
        }

        if ( company_id ) {
            whereConditions.push('company_id = ?');
            queryParams.push( company_id );
        }

        // Agrega las condiciones WHERE a la consulta si existen
        if ( whereConditions.length > 0 ) {
            query += ' WHERE ' + whereConditions.join(' AND ');
        }

        // Ejecuta la consulta con los parámetros
        const rows = await conn.query(query, queryParams);
        console.log(rows);

        return rows;
    } catch (err) {
        console.error('Error al obtener registros:', err);
    } finally {
        if (conn) conn.end();
    }

    return null;
};

async function getAccountsList( { company_id, account, name, year_id } ) {
    let conn;
    try {
        conn = await pool.getConnection();

        // Inicia la consulta base
        let query = 'SELECT * FROM accounts_list';
        const queryParams = [];

        // Construye las condiciones WHERE dinámicamente
        const whereConditions = [];

        if ( year_id ) {
            whereConditions.push('year_id = ?');
            queryParams.push( year_id );
        }

        if ( company_id ) {
            whereConditions.push('company_id = ?');
            queryParams.push( company_id );
        }
        
        if ( account ) {
            whereConditions.push('account = ?');
            queryParams.push( account );
        }
        
        if ( name ) {
            whereConditions.push('name = ?');
            queryParams.push( name );
        }

        // Agrega las condiciones WHERE a la consulta si existen
        if ( whereConditions.length > 0 ) {
            query += ' WHERE ' + whereConditions.join(' AND ');
        }

        // Ejecuta la consulta con los parámetros
        const rows = await conn.query(query, queryParams);
        // console.log(rows);

        return rows;
    } catch (err) {
        console.error('Error al obtener registros:', err);
    } finally {
        if (conn) conn.end();
    }

    return null;
};

module.exports = {
    getMonths,
    getFinancialStaments,
    getAccountsList,
};