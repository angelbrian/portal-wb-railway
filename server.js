require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const mongoose = require('mongoose');
const { Schema } = mongoose;
const fs = require('fs');

const aFormatData = require('./controllers/dataFormat');

const app = express();
const port = process.env.PORT;
const user = process.env.DB_USER;
const pass = process.env.DB_PASS;

console.log({ port, user, pass })

app.use(bodyParser.json({ limit: `50mb` }));
app.use(bodyParser.urlencoded({ limit: `50mb`, extended: true, parameterLimit: 1000000 }));
app.use(function (req, res, next) {
  res.header("Access-Control-Allow-Origin", "*");
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, PATCH, DELETE');
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
  next();
});

const mongoUri = `mongodb+srv://${user}:${pass}@cluster0.2qtf72w.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;
mongoose.connect(mongoUri);

const db = mongoose.connection;
db.on('error', console.error.bind(console, 'connection error:'));
db.once('open', () => {
  console.log('Connected to MongoDB');
});

const dataSchema = new Schema({
  data: Schema.Types.Mixed
});

const Data = mongoose.model('Data', dataSchema);

app.get('/', async (req, res) => {
    res.status(200).send('ready');
});

app.post('/api/upload', async (req, res) => {
  try {
    const data = aFormatData(Object.values(req.body));
    const { year, month, company_short } = data;
    console.log({ year, month, company_short })

    const path = `data.${year}.${month}.${company_short}`;

    const filter = {};

    const update = {
      $set: {
        [path]: data
      }
    };

    const options = {
      new: true,
      upsert: true,
      useFindAndModify: false
    };

    const updatedDocument = await Data.findOneAndUpdate(filter, update, options);
    console.log(updatedDocument);

    if (updatedDocument) {
      res.status(200).json({ message: 'Documento actualizado o creado correctamente', updatedDocument });
    } else {
      res.status(404).json({ message: 'Documento no encontrado' });
    }
  } catch (error) {
    console.error('Error al guardar datos en MongoDB:', error);
    res.status(500).send('Error interno al guardar datos');
  }
});

app.post('/api/data', async (req, res) => {

  try {
    const months = require(`./public/months-enabled.json`);
    const groups = require('./public/groups.json');
    const son = require('./public/groups-son.json');
    const companies = require('./public/companies.json');

    const allData = await Data.find({});
    const forAnioData = allData[0]['data']['2024'];

    if (allData.length) {
      res.status(200).send({
        months,
        groups,
        son,
        companies,
        data: forAnioData,
      });
    } else {
      res.status(404).json({ message: 'No data found' });
    }
  } catch (error) {
    console.error('Error retrieving data from MongoDB:', error);
    res.status(500).json({ message: 'Internal server error' });
  }

});

app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});