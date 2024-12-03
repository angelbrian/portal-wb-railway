require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const fs = require('fs');

const { Schema } = mongoose;

const app = express();
const port = process.env.PORT;
const user = process.env.DB_USER;
const pass = process.env.DB_PASS;

// current
const mongoUri = `mongodb+srv://${user}:${pass}@clusterportal.mca6q.mongodb.net/portal?retryWrites=true&w=majority&appName=ClusterPortal&tls=true`;
// new
const newMongoUri = `mongodb+srv://${user}:${pass}@clusterkatalabs.kb27m.mongodb.net/kata?retryWrites=true&w=majority&appName=ClusterKatalabs=true`;

mongoose.connect(mongoUri).then(() => {
  console.log('Conectado a MongoDB localmente sin SSL');
}).catch(err => {
  console.error('Error al conectar con MongoDB local:', err);
});

const db = mongoose.connection;
db.on('error', console.error.bind(console, 'connection error:'));
db.once('open', () => {
  console.log('Connected to MongoDB');
});

const dataSchema = new Schema({
    year: Schema.Types.Mixed,
    documentType: Schema.Types.Mixed,
    distributor: Schema.Types.Mixed,
    type: Schema.Types.Mixed,
    values: Schema.Types.Mixed, // Acepta objetos anidados o cualquier dato
}, { strict: false });

const Data = mongoose.model('Data', dataSchema);

// NEW
// const newConnection = mongoose.createConnection(newMongoUri);
const newConnection = mongoose.createConnection( newMongoUri );
// .then(() => {
//     console.log('NEW Conectado a MongoDB localmente sin SSL');
//   }).catch(err => {
//     console.error('NEW Error al conectar con MongoDB local:', err);
//   });

// SE USA el mismo esquema
const NewDataModel = newConnection.model('Data', dataSchema);

app.get('/', async (req, res) => {
    // Documento por _id
    const data = await Data.findById('66bfe3078a1b146ef7fe2a89');
    res.status(200).send( data );
});

app.post('/migrate/:id', async (req, res) => {
    try {
      const { id } = req.params;
  
      // Busca el documento en la base de datos actual
      const oldData = await Data.findById(id);
      if (!oldData) {
        return res.status(404).json({ message: 'Document not found in the old database' });
      }
  
      // Convierte el documento a un objeto plano
      const documentToMigrate = oldData.toObject();
  
      // Busca y reemplaza (o inserta si no existe) el documento en la nueva base de datos
      const replacedDocument = await NewDataModel.findOneAndReplace(
        { _id: documentToMigrate._id }, // Filtro por _id
        documentToMigrate,             // Nuevo documento
        { upsert: true, new: true }    // upsert: crea si no existe, new: devuelve el documento actualizado
      );
  
      return res.status(200).json({
        message: 'Document successfully migrated or updated in the new database',
        replacedDocument,
      });
    } catch (error) {
      console.error('Error migrating or replacing document:', error);
      return res.status(500).json({ message: 'Internal server error' });
    }
  });
  
  

app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});