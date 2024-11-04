const pool = require("../connect");


async function insertFinancialStatements( values ) {
  let conn;
  try {
    conn = await pool.getConnection();

    // Crea una cadena para cada fila y únelas con comas
    const valuePlaceholders = values.map(() => "(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").join(", ");
    const flatValues = values.flat();

    // Inserta la consulta usando los placeholders y valores
    const query = `
      INSERT INTO financial_statements 
      (month_id, company_id, year_id, cuenta, nombre, si_deudor, si_acreedor, cargos, abonos, sa_deudor, sa_acreedor, saldo_final) 
      VALUES ${valuePlaceholders}
    `;

    const res = await conn.query(query, flatValues);
    console.log(`Se insertaron ${res.affectedRows} registros`);
  } catch (err) {
    console.error("Error al insertar registros:", err);
  } finally {
    if (conn) conn.end();
  }
};

async function insertAccountsList( values ) {
    let conn;
    try {
      conn = await pool.getConnection();
  
      // Crea una cadena para cada fila y únelas con comas
      const valuePlaceholders = values.map(() => '(?, ?, ?, ?)').join(', ');
      const flatValues = values.flat();
  
      // Inserta la consulta usando los placeholders y valores
      const query = `
        INSERT INTO accounts_list 
        (company_id, year_id, account, name) 
        VALUES ${valuePlaceholders}
      `;
  
      const res = await conn.query(query, flatValues);
      console.log(`Se insertaron ${res.affectedRows} registros`);
      return res;
    } catch (err) {
      console.error("Error al insertar registros:", err);
    } finally {
      if (conn) conn.end();
    }
    
    return null;
};

async function insertAccountsEnabled( values ) {
    let conn;
    try {
      conn = await pool.getConnection();
  
      // Crea una cadena para cada fila y únelas con comas
      const valuePlaceholders = values.map(() => '(?, ?)').join(', ');
      const flatValues = values.flat();
  
      // Inserta la consulta usando los placeholders y valores
      const query = `
        INSERT INTO accounts_enabled 
        (agroup_id, account_list_id) 
        VALUES ${valuePlaceholders}
      `;
  
      const res = await conn.query(query, flatValues);
      console.log(`Se insertaron ${res.affectedRows} registros`);
      return res;
    } catch (err) {
      console.error("Error al insertar registros:", err);
    } finally {
      if (conn) conn.end();
    }
    
    return null;
};

module.exports = {
    insertFinancialStatements,
    insertAccountsList,
    insertAccountsEnabled,
};
