require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const mongoose = require('mongoose');
const fs = require('fs');

const NodeCache = require('node-cache');
const cache = new NodeCache({ stdTTL: 600 });

const fileUpload = require('express-fileupload');
const ExcelJS = require('exceljs');

const { Schema } = mongoose;

const aFormatData = require('./controllers/dataFormat');

const app = express();
const port = process.env.PORT;
const user = process.env.DB_USER;
const pass = process.env.DB_PASS;

const year = '2024';

app.use(bodyParser.json({ limit: `50mb` }));
app.use(bodyParser.urlencoded({ limit: `50mb`, extended: true, parameterLimit: 1000000 }));
app.use(function (req, res, next) {
  res.header("Access-Control-Allow-Origin", "*");
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, PATCH, DELETE');
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
  next();
});
app.use(fileUpload());

// const mongoUri = `mongodb+srv://${user}:${pass}@cluster0.2qtf72w.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;
// const mongoUri = `mongodb+srv://${user}:${pass}@clusterportal.mca6q.mongodb.net/?retryWrites=true&w=majority&appName=ClusterPortal`;
const mongoUri = `mongodb+srv://${user}:${pass}@clusterportal.mca6q.mongodb.net/portal?retryWrites=true&w=majority`;
mongoose.connect(mongoUri).then(() => {
  console.log('Conectado a MongoDB localmente sin SSL');
}).catch(err => {
  console.error('Error al conectar con MongoDB local:', err);
});

// mongoose.connect(mongoUri)
//   .then(() => {
//     console.log('Connected to MongoDB');
//   })
//   .catch((error) => {
//     console.error('Error connecting to MongoDB:', error);
//   });

const db = mongoose.connection;
db.on('error', console.error.bind(console, 'connection error:'));
db.once('open', () => {
  console.log('Connected to MongoDB');
});

// const dataSchema = new Schema({
//   data: Schema.Types.Mixed,
//   lines: Schema.Types.Mixed,
//   dashboard: Schema.Types.Mixed,
//   prueba: Schema.Types.Mixed,
// });
const dataSchema = new Schema({
  year: Schema.Types.Mixed,
  documentType: Schema.Types.Mixed,
  distributor: Schema.Types.Mixed,
});

const Data = mongoose.model('Data', dataSchema);

app.get('/', async (req, res) => {
  res.status(200).send('ready 1');
});

app.post('/cintura', async (req, res) => {
  const options = {
    new: true, // Devuelve el documento actualizado
    upsert: true, // Crea un nuevo documento si no existe
    useFindAndModify: false // Opción para evitar el uso de findAndModify
  };

  // Utiliza findOneAndUpdate para actualizar el documento
  const updatedDocument = await Data.findOneAndUpdate(
    { year: year, documentType: 'groupsEnabled' },  // Criterio de búsqueda
    { $set: { [`values`]: require('./public/lines.json')['groupsEnabled'] } },
    { ...options, strict: false }
  );
  res.status(200).send('ready 1');
});

app.post('/api/format', async (req, res) => {
  
  try {
    if (!req.files || Object.keys(req.files).length === 0) {
      return res.status(400).send('No files were uploaded.');
    }

    // // const dataGroupsChilds = await Data.find({ year: '2024', documentType: 'groupsChilds' }).select('values');
    // const dataGroupsChilds = await Data.find(
    //   { year: '2024', documentType: 'groupsChilds' },  // Criterios de búsqueda
    //   { [`values.${company_short}`]: 1 }  // Proyección para incluir solo el nodo 'RPL'
    // );
    // // const dataGralList = await Data.find({ year: '2024', documentType: 'gralList' }).select('values');
    
    // const groupsChilds = aFormatData.getNode( dataGroupsChilds );
    // const gralList = aFormatData.getNode( dataGralList );
    // // console.log(groupsChilds)
    
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(req.files.file.data);
  
    const worksheet = workbook.worksheets[0];
    const jsonData = [];
  
    worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      const rowData = [];
      row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
        const cellValue = cell.value;
        const cellStyle = cell.font;
        const bold = cellStyle && cellStyle.bold;
        rowData.push(bold ? { text: cellValue, bold: true } : { text: cellValue, bold: false });
      });
      jsonData.push(rowData);
    });

    const formatData = aFormatData.aFormatData( jsonData );
    const { data, dataGral } = formatData;
  
    const { year, month, company_short, balance } = data;

    const dataGroupsChilds = await Data.find(
      { year: '2024', documentType: 'groupsChilds' },  // Criterios de búsqueda
      { [`values.${ company_short }`]: 1 }  // Proyección para incluir solo el nodo 'RPL'
    );
    const dataGralList = await Data.find(
      { year: '2024', documentType: 'gralList' },
      { [`values.${ company_short }`]: 1 }
    );
    
    const groupsChilds = aFormatData.getNode( dataGroupsChilds );
    const gralList = aFormatData.getNode( dataGralList );
    // console.log(groupsChilds)

    // return res.status(200).json({ gralList })
    let groupsChildsTemp = {};
    let gralListTemp = gralList;
    
    if( !gralListTemp[company_short] )
      gralListTemp[company_short] = {};

    balance.forEach(( item ) => {

      gralListTemp[company_short][item.cuenta] = { cuenta: item.cuenta, nombre: item.nombre };
      if( !groupsChilds[item.cuenta] ) {
        groupsChildsTemp[item.cuenta] = {};
        groupsChildsTemp[item.cuenta][item.cuenta] = { cuenta: item.cuenta, nombre: item.nombre };
        // console.log('ENTREEEEEEÉ')
      } else {
        groupsChildsTemp[item.cuenta] = groupsChilds[item.cuenta];
      }

      item.data.forEach(( element ) => {

        const { cuenta, nombre } = element;
        if( !groupsChildsTemp[item.cuenta][cuenta] ) {
          groupsChildsTemp[item.cuenta][cuenta] = {
            cuenta,
            nombre,
          }
        }
        gralListTemp[company_short][cuenta] = { cuenta, nombre };

      });

    });


    const options = {
      new: true,
      upsert: true,
      useFindAndModify: false
    };

    // const updatedDocument1 = await Data.findOneAndUpdate(
    //   { year, documentType: 'groupsChilds' },  // Criterio de búsqueda
    //   { $set: { [`values.${company_short}`]: groupsChildsTemp } },
    //   { ...options, strict: false }
    // );
    const updatedDocument1 = await Data.findOneAndUpdate(
      { year, documentType: 'groupsChilds' },  // Criterio de búsqueda
      { $set: { [`values.${company_short}`]: groupsChildsTemp } },
      { ...options, strict: false }
    );
    
    const updatedDocument2 = await Data.findOneAndUpdate(
      { year, documentType: 'gralList' },  // Criterio de búsqueda
      { $set: { [`values.${company_short}`]: gralListTemp[company_short] } },
      { ...options, strict: false }
    );

    const updatedDocument3 = await Data.findOneAndUpdate(
      // { year, documentType: 'dataGralForMonth' },  // Criterio de búsqueda
      { year, month, documentType: 'dataGralForMonth' },  // Criterio de búsqueda
      { $set: { [`values.${year}.${month}.${company_short}`]: dataGral } },
      { ...options, strict: false }
    );

    if (updatedDocument1 && updatedDocument2 && updatedDocument3) {
      cache.flushAll();

      return res.status(200).json({ message: 'Documento actualizado o creado correctamente', dataGral/*data*/ });
    } else {
      return res.status(404).json({ message: 'Documento no encontrado' });
    }
   
  } catch (error) {
    console.error('Error al guardar datos en MongoDB:', error);
    return res.status(500).send('Error interno al guardar datos');
  }
});

app.post('/api/upload', async (req, res) => {
  
  if (!req.files || Object.keys(req.files).length === 0) {
    return res.status(400).send('No files were uploaded.');
  }

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(req.files.file.data);

  const worksheet = workbook.worksheets[0];
  const jsonData = [];

  worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    const rowData = [];
    row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      const cellValue = cell.value;
      const cellStyle = cell.font;
      const bold = cellStyle && cellStyle.bold;
      rowData.push(bold ? { text: cellValue, bold: true } : { text: cellValue, bold: false });
    });
    jsonData.push(rowData);
  });

  res.status(200).json(jsonData);
  
});

app.post('/api/data', async (req, res) => {
  try {
      const cacheKey = `data_${year}`;
      const cachedData = cache.get(cacheKey);

      if (cachedData) {
          return res.status(200).json(cachedData);
      }

      const [
        dataNames,
        dataGroupsEnabledMultiplicator,
        dataGroupsEnabled,
        dataGroupsChilds,
        dataGroupsSum,
        dataDataGralForMonth
      ] = await Promise.all([
        Data.find({ year, documentType: 'names' }).select('values'),
        Data.find({ year, documentType: 'groupsEnabledMultiplicator' }).select('values'),
        Data.find({ year, documentType: 'groupsEnabled' }).select('values'),
        Data.find({ year, documentType: 'groupsChilds' }).select('values'),
        Data.find({ year, documentType: 'groupsSum' }).select('values'),
        Data.find({ year, documentType: 'dataGralForMonth' }).select('values')
      ]);

      const names = aFormatData.getNodeMultiple(dataNames[0]);
      const groupsEnabledMultiplator = aFormatData.getNodeMultiple(dataGroupsEnabledMultiplicator[0]);
      const groupsEnabled = aFormatData.getNodeMultiple(dataGroupsEnabled[0]);
      const groupsChilds = aFormatData.getNodeMultiple(dataGroupsChilds[0]);
      const groupsSum = aFormatData.getNodeMultiple(dataGroupsSum[0]);
      // const dataGralForMonth = aFormatData.getNode(dataDataGralForMonth[0])?.['2024'];
      let dataGralForMonth = {};
      const dataGralForMonthTemp = dataDataGralForMonth.map(( elementD, indexD ) => {

        const md = [ 'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio' ];
        const allCompanies = [  'MVS', 'VFJ', 'COR', 'PAT', 'DNO', 'MOV', 'DOS', 'VEC', 'ACT', 'GDL', 'OCC', 'REN', 'FYJ', 'GAR', 'RUT', 'MIN', 'HMS', 'DAC', 'AGS', 'SIN', 'RPL' ];
        const afd = aFormatData.getNodeMultiple( elementD )?.['2024'];

        // if ( indexD === 0 ) {
          
          md.forEach(( m ) => {
            allCompanies.forEach(( c ) => {
  
              if( afd?.[m]?.[c] ) {

                if( !dataGralForMonth?.[m] )
                  dataGralForMonth[m] = {};
                if( !dataGralForMonth?.[m]?.[c] )
                  dataGralForMonth[m][c] = {};

                  dataGralForMonth = {
                    ...dataGralForMonth,
                    [m]: {
                      ...dataGralForMonth[m],
                      [c]: afd[m][c]
                    }
                  }
  
              }
  
            });
          });

        // }

      });

      // return res.status(200).json({ dataDataGralForMonth: dataGralForMonth });

      if (
          names &&
          groupsEnabledMultiplator &&
          groupsEnabled &&
          groupsChilds &&
          groupsSum &&
          dataGralForMonth
      ) {
          tempData = {};
          dataRemake = {};
          const msFixed = aFormatData.getMonthsUntilNow().filter(i => dataGralForMonth[i]);

          names.forEach(name => {
              dataRemake[name] = {};

              Object.entries(groupsEnabled).forEach(([company, nameTemp]) => {
                  if (company && nameTemp[name]) {
                      dataRemake[name][company] = {};

                      msFixed.forEach(month => {
                          dataRemake[name][company][month] = {};

                          nameTemp[name].forEach((accountFather, index) => {
                              if (index === 0) dataRemake[name][company][month]['balance'] = [];

                              const saldoFinalTemp = groupsSum[company]?.[name]?.[accountFather];

                              if (groupsChilds[company] && groupsChilds[company][accountFather]) {
                                  if (
                                      dataGralForMonth[month] &&
                                      dataGralForMonth[month][company] &&
                                      dataGralForMonth[month][company][accountFather]
                                  ) {
                                      let dataTemp = [];

                                      Object.keys(groupsChilds[company][accountFather]).forEach(
                                          (accountChild, index) => {
                                              if (dataGralForMonth[month][company][accountChild] && index !== 0) {
                                                  if (saldoFinalTemp) {
                                                      dataGralForMonth[month][company][
                                                          accountChild
                                                      ]['saldo-final'] = saldoFinalTemp.reduce(
                                                          (acc, currentAcc) => {
                                                              return (
                                                                  acc +
                                                                  dataGralForMonth[month][company][
                                                                      accountChild
                                                                  ][currentAcc]
                                                              );
                                                          },
                                                          0
                                                      );
                                                  }

                                                  dataTemp.push(
                                                      dataGralForMonth[month][company][accountChild]
                                                  );
                                              }
                                          }
                                      );

                                      dataGralForMonth[month][company][accountFather].data = dataTemp;

                                      if (saldoFinalTemp) {
                                          dataGralForMonth[month][company][
                                              accountFather
                                          ]['saldo-final'] = saldoFinalTemp.reduce(
                                              (acc, currentAcc) => {
                                                  return (
                                                      acc +
                                                      dataGralForMonth[month][company][accountFather][
                                                          currentAcc
                                                      ]
                                                  );
                                              },
                                              0
                                          );
                                      }

                                      dataRemake[name][company][month]['balance'].push(
                                          dataGralForMonth[month][company][accountFather]
                                      );
                                  }
                              }
                          });
                      });
                  }
              });
          });

          const responseData = {
              data: dataRemake,
              groupsChilds,
              groupsEnabled,
              dataGralForMonth,
              groupsEnabledMultiplator,
              months: msFixed
          };

          // Almacenar en la caché con TTL
          cache.set(cacheKey, responseData);

          return res.status(200).json(responseData);
      } else {
          return res.status(404).json({ message: 'No data found' });
      }
  } catch (error) {
      console.error('Error retrieving data from MongoDB:', error);
      return res.status(500).json({ message: 'Internal server error' });
  }
});

app.get('/api/groups', async (req, res) => {
  try {
    const cacheKey = 'groupsData';
    const cachedData = cache.get(cacheKey);

    // Si los datos están en la caché, se retornan directamente
    if (cachedData) {
      return res.status(200).send(cachedData);
    }

    // Si los datos no están en la caché, se consultan desde MongoDB
    const dataGroupsEnabledMultiplicator = await Data.find({ year, documentType: 'groupsEnabledMultiplicator' }).select('values');
    const dataGroupsSum = await Data.find({ year, documentType: 'groupsSum' }).select('values');
    const dataGroupsEnabled = await Data.find({ year, documentType: 'groupsEnabled' }).select('values');
    const dataNames = await Data.find({ year, documentType: 'names' }).select('values');
    const dataCompanies = await Data.find({ year, documentType: 'companies' }).select('values');
    const dataGralList = await Data.find({ year, documentType: 'gralList' }).select('values');
    const dataGroupsChilds = await Data.find({ year, documentType: 'groupsChilds' }).select('values');

    // Formateo de los datos
    const multiplicators = aFormatData.getNode(dataGroupsEnabledMultiplicator);
    const sum = aFormatData.getNode(dataGroupsSum);
    const groups = aFormatData.getNode(dataGroupsEnabled);
    const names = aFormatData.getNode(dataNames);
    const companies = aFormatData.getNode(dataCompanies);
    const gralList = aFormatData.getNode(dataGralList);
    const groupsChilds = aFormatData.getNode(dataGroupsChilds);

    const responseData = {
      groups,
      multiplicators,
      names,
      companies,
      gralList,
      groupsChilds,
      sum,
    };

    // Almacenar los datos en la caché con un TTL de 10 minutos
    cache.set(cacheKey, responseData);

    // Enviar la respuesta
    res.status(200).send(responseData);
  } catch (error) {
    console.error('Error retrieving data from MongoDB:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

app.post('/api/multiplicators', async (req, res) => {

  try {

    const options = {
      new: true, // Devuelve el documento actualizado
      upsert: true, // Crea un nuevo documento si no existe
      useFindAndModify: false // Opción para evitar el uso de findAndModify
    };

    // Utiliza findOneAndUpdate para actualizar el documento
    const updatedDocument = await Data.findOneAndUpdate(
      { year: year, documentType: 'groupsEnabledMultiplicator' },  // Criterio de búsqueda
      { $set: { [`values`]: req.body } },
      { ...options, strict: false }
    );

    if (updatedDocument) {
      // cache.del('groupsData');
      cache.flushAll();

      return res.status(200).json({ message: 'Documento actualizado o creado correctamente' });
    } else {
      return res.status(404).json({ message: 'Documento no encontrado' });
    }

  } catch (error) {
    res.status(500).json({ message: 'Internal server error' });
  }

});

app.post('/api/name', async (req, res) => {

  try {

    const options = {
      new: true, // Devuelve el documento actualizado
      upsert: true, // Crea un nuevo documento si no existe
      useFindAndModify: false // Opción para evitar el uso de findAndModify
    };

    // Utiliza findOneAndUpdate para actualizar el documento
    const updatedDocument = await Data.findOneAndUpdate(
      { year: year, documentType: 'names' },  // Criterio de búsqueda
      { $set: { [`values`]: Object.values( req.body ) } },
      { ...options, strict: false }
    );

    if (updatedDocument) {
      cache.flushAll();

      return res.status(200).json({ message: 'Documento actualizado o creado correctamente' });
    } else {
      return res.status(404).json({ message: 'Documento no encontrado' });
    }

  } catch (error) {
    res.status(500).json({ message: 'Internal server error' });
  }

});

app.post('/api/order', async (req, res) => {

  try {

    // const allData = await Data.find({});
    // const groups = allData[0]['lines']['groupsEnabled'];
    const dataGroupsEnabled = await Data.find({ year, documentType: 'groupsEnabled' }).select('values');
    const groups = aFormatData.getNode( dataGroupsEnabled );

    const { group, category, accounts } = req.body;

    groups[group][category] = accounts;

    const options = {
      new: true, // Devuelve el documento actualizado
      upsert: true, // Crea un nuevo documento si no existe
      useFindAndModify: false // Opción para evitar el uso de findAndModify
    };

    // Utiliza findOneAndUpdate para actualizar el documento
    const updatedDocument = await Data.findOneAndUpdate(
      { year: year, documentType: 'groupsEnabled' },  // Criterio de búsqueda
      { $set: { [`values`]: groups } },
      { ...options, strict: false }
    );

    if (updatedDocument) {
      cache.flushAll();

      return res.status(200).json({ message: 'Documento actualizado o creado correctamente' });
    } else {
      return res.status(404).json({ message: 'Documento no encontrado' });
    }

  } catch (error) {
    res.status(500).json({ message: 'Internal server error' });
  }

});

app.post('/api/link', async (req, res) => {

  // const allData = await Data.find({});
  // const groups = allData[0]['lines']['groups'];
  // const groupsEnabled = allData[0]['lines']['groupsEnabled'];
  const dataGroups = await Data.find({ year, documentType: 'groups' }).select('values');
  const groups = aFormatData.getNode( dataGroups );
  
  const dataGroupsEnabled = await Data.find({ year, documentType: 'groupsEnabled' }).select('values');
  const groupsEnabled = aFormatData.getNode( dataGroupsEnabled );

  if( !groups[req.body.company] )
    groups[req.body.company] = [];
  
  if( !groupsEnabled[req.body.company] )
    groupsEnabled[req.body.company] = [];

  if ( !groups[req.body.company].find(( value ) => value.name === req.body.agroup ) ) {
    groups[req.body.company] = [ ...groups[req.body.company], { name: req.body.agroup, data: [] } ];
  }
  
  if ( !groupsEnabled[req.body.company][req.body.agroup] ) {
    groupsEnabled[req.body.company] = { ...groupsEnabled[req.body.company], [req.body.agroup]: [] };
  }

  try {

    const options = {
      new: true, // Devuelve el documento actualizado
      upsert: true, // Crea un nuevo documento si no existe
      useFindAndModify: false // Opción para evitar el uso de findAndModify
    };

    // Utiliza findOneAndUpdate para actualizar el documento
    // const updatedDocument = await Data.findOneAndUpdate(filter, update, options);
    const updatedDocument1 = await Data.findOneAndUpdate(
      { year: year, documentType: 'groups' },  // Criterio de búsqueda
      { $set: { [`values`]: groups } },
      { ...options, strict: false }
    );
    
    const updatedDocument2 = await Data.findOneAndUpdate(
      { year: year, documentType: 'groupsEnabled' },  // Criterio de búsqueda
      { $set: { [`values`]: groupsEnabled } },
      { ...options, strict: false }
    );

    if (updatedDocument1 && updatedDocument2) {
      // cache.del('groupsData');
      cache.flushAll();

      return res.status(200).json(groupsEnabled);
    } else {
      return res.status(404).json({ message: 'Documento no encontrado' });
    }

  } catch (error) {
    res.status(500).json({ message: 'Internal server error' });
  }

});

app.post('/api/unlink', async (req, res) => {
  const { company, agroup } = req.body;

  try {
    // Encuentra el documento
    // const allData = await Data.find({});
    // if (!allData.length) {
    //   return res.status(404).json({ message: 'No data found' });
    // }

    // const data = allData[0];
    // const groups = data.lines.groups;
    // const groupsEnabled = data.lines.groupsEnabled;
    const dataGroups = await Data.find({ year, documentType: 'groups' }).select('values');
    const groups = aFormatData.getNode( dataGroups );
    
    const dataGroupsEnabled = await Data.find({ year, documentType: 'groupsEnabled' }).select('values');
    const groupsEnabled = aFormatData.getNode( dataGroupsEnabled );

    // Verifica si el grupo y la empresa existen
    if (!groups[company] || !groupsEnabled[company] || !groups[company].find(group => group.name === agroup)) {
      return res.status(404).json({ message: 'Group or company not found' });
    }

    // Elimina el grupo de 'groups'
    groups[company] = groups[company].filter(group => group.name !== agroup);

    // Elimina el grupo de 'groupsEnabled'
    delete groupsEnabled[company][agroup];

    // Actualiza el documento en la base de datos
    // const updatedDocument = await Data.findOneAndUpdate(
    //   { _id: data._id },
    //   {
    //     $set: {
    //       'lines.groups': groups,
    //       'lines.groupsEnabled': groupsEnabled,
    //     }
    //   },
    //   { new: true, useFindAndModify: false }
    // );
    const options = {
      new: true, // Devuelve el documento actualizado
      upsert: true, // Crea un nuevo documento si no existe
      useFindAndModify: false // Opción para evitar el uso de findAndModify
    };

    const updatedDocument1 = await Data.findOneAndUpdate(
      { year: year, documentType: 'groups' },  // Criterio de búsqueda
      { $set: { [`values`]: groups } },
      { ...options, strict: false }
    );
    
    const updatedDocument2 = await Data.findOneAndUpdate(
      { year: year, documentType: 'groupsEnabled' },  // Criterio de búsqueda
      { $set: { [`values`]: groupsEnabled } },
      { ...options, strict: false }
    );

    if (updatedDocument1 && updatedDocument2) {
      cache.flushAll();

      return res.status(200).json( groupsEnabled );
    } else {
      return res.status(404).json({ message: 'Document not found' });
    }
  } catch (error) {
    console.error('Error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

app.put('/api/agroup', async (req, res) => {

  try {
    const name = req.body.name;
    // Encuentra el documento
    // const allData = await Data.find({});
    // if (!allData.length) {
    //   return res.status(404).json({ message: 'No data found' });
    // }

    // const data = allData[0];
    // const groupsEnabled = Object.values( data.lines.groupsEnabled );
    const dataGroupsEnabled = await Data.find({ year, documentType: 'groupsEnabled' }).select('values');
    const groupsEnabled = Object.values( aFormatData.getNode( dataGroupsEnabled ) );

    let useAgroup = false;

    groupsEnabled.forEach(( element ) => {
      if ( !useAgroup ) {
        const keys = Object.keys( element );
        if( keys.find(e => e === name) )
          useAgroup = true;
      }
    });


    if ( useAgroup ) {
      return res.status(404).json({ message: 'Document not found' });
    }
    
    // const names = (data.lines.names).filter(e => e !== name);
    const dataNames = await Data.find({ year, documentType: 'names' }).select('values');
    let names = aFormatData.getNode( dataNames );
    names = (names).filter(e => e !== name);

    const options = {
      new: true, // Devuelve el documento actualizado
      upsert: true, // Crea un nuevo documento si no existe
      useFindAndModify: false // Opción para evitar el uso de findAndModify
    };
    // Actualiza el documento en la base de datos
    // const updatedDocument = await Data.findOneAndUpdate(
    //   { _id: data._id },
    //   {
    //     $set: {
    //       'lines.names': names,
    //     }
    //   },
    //   { new: true, useFindAndModify: false }
    // );
    const updatedDocument = await Data.findOneAndUpdate(
      { year: year, documentType: 'names' },  // Criterio de búsqueda
      { $set: { [`values`]: names } },
      { ...options, strict: false }
    );


    if (updatedDocument) {
      cache.flushAll();

      return res.status(200).json( names );
    } else {
      return res.status(404).json({ message: 'Document not found' });
    }
  } catch (error) {
    console.error('Error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

app.put('/api/groups', async (req, res) => {
  
  try {
    let tempData = {};
    const dataGroups = Object.entries(req.body.groups);
    dataGroups.forEach((e) => {
      tempData[e[0]] = [];
      const dataGroupsTemp = Object.entries(e[1]);
      dataGroupsTemp.forEach((d) => {
        tempData[e[0]].push({
          name: d[0],
          data: d[1],
        });
      });
    });

    // const update = {
    //   $set: {
    //     'lines.groups': tempData,
    //     'lines.groupsEnabled': req.body.groups,
    //     'lines.groupsEnabledMultiplicator': req.body.multiplicators,
    //   }
    // };

    const options = {
      new: true, // Devuelve el documento actualizado
      upsert: true, // Crea un nuevo documento si no existe
      useFindAndModify: false // Opción para evitar el uso de findAndModify
    };

    // Utiliza findOneAndUpdate para actualizar el documento
    // const updatedDocument = await Data.findOneAndUpdate(filter, update, options);
    const updatedDocument1 = await Data.findOneAndUpdate(
      { year: year, documentType: 'groups' },  // Criterio de búsqueda
      { $set: { [`values`]: tempData } },
      { ...options, strict: false }
    );

    const updatedDocument2 = await Data.findOneAndUpdate(
      { year: year, documentType: 'groupsEnabled' },  // Criterio de búsqueda
      { $set: { [`values`]: req.body.groups } },
      { ...options, strict: false }
    );

    const updatedDocument3 = await Data.findOneAndUpdate(
      { year: year, documentType: 'groupsEnabledMultiplicator' },  // Criterio de búsqueda
      { $set: { [`values`]: req.body.multiplicators } },
      { ...options, strict: false }
    );

    if (updatedDocument1 && updatedDocument2 && updatedDocument3) {
      cache.flushAll();

      return res.status(200).json({ message: 'Documento actualizado o creado correctamente', groups: req.body.groups, multiplicators: req.body.multiplicators });
    } else {
      return res.status(404).json({ message: 'Documento no encontrado' });
    }
  } catch (error) {
    console.error('Error al actualizar documento en MongoDB:', error);
    return res.status(500).json({ message: 'Error interno del servidor' });
  }
});

app.put('/api/childs', async (req, res) => {
  
  try {

    // const allData = await Data.find({});
    // const groupsChilds = allData[0]['lines']['groupsChilds'];
    const dataGroupsChilds = await Data.find({ year: '2024', documentType: 'groupsChilds' }).select('values');
    const groupsChilds = aFormatData.getNode( dataGroupsChilds );

    const { company, account, childs } = req.body;
    
    if( !groupsChilds[company] )
        groupsChilds[company] = {};
    if( !groupsChilds[company][account] )
        groupsChilds[company][account] = {};

    let childsTemp = {};
    
    childs.forEach(( i ) => {

      childsTemp[i.cuenta] = i;

    });
    
    groupsChilds[company][account] = childsTemp;

    // const update = {
    //   $set: {
    //     'lines.groupsChilds': groupsChilds,
    //   }
    // };

    const options = {
      new: true, // Devuelve el documento actualizado
      upsert: true, // Crea un nuevo documento si no existe
      useFindAndModify: false // Opción para evitar el uso de findAndModify
    };

    // Utiliza findOneAndUpdate para actualizar el documento
    // const updatedDocument = await Data.findOneAndUpdate(filter, update, options);
    const updatedDocument = await Data.findOneAndUpdate(
      { year: year, documentType: 'groupsChilds' },  // Criterio de búsqueda
      { $set: { [`values`]: groupsChilds } },
      { ...options, strict: false }
    );

    if (updatedDocument) {
      cache.flushAll();

      return res.status(200).json({ message: 'Documento actualizado o creado correctamente', groupsChilds });
    } else {
      return res.status(404).json({ message: 'Documento no encontrado' });
    }
  } catch (error) {
    console.error('Error al actualizar documento en MongoDB:', error);
    return res.status(500).json({ message: 'Error interno del servidor' });
  }
});

app.post('/api/sum', async (req, res) => {

  try {

    // const allData = await Data.find({});
    // const sum = allData[0]['lines']['groupsSum'];
    const dataGroupsSum = await Data.find({ year: '2024', documentType: 'groupsSum' }).select('values');
    const sum = aFormatData.getNode( dataGroupsSum );

    const { company, agroup, account, checkboxes } = req.body;

    if( !sum[company] )
      sum[company] = {};
    if( !sum[company][agroup] )
      sum[company][agroup] = {};
    if( !sum[company][agroup][account] )
      sum[company][agroup][account] = {};

    sum[company][agroup][account] = checkboxes;

    // const update = {
    //   $set: {
    //     'lines.groupsSum': sum,
    //   }
    // };

    const options = {
      new: true, // Devuelve el documento actualizado
      upsert: true, // Crea un nuevo documento si no existe
      useFindAndModify: false // Opción para evitar el uso de findAndModify
    };

    // Utiliza findOneAndUpdate para actualizar el documento
    // const updatedDocument = await Data.findOneAndUpdate(filter, update, options);
    const updatedDocument = await Data.findOneAndUpdate(
      { year: year, documentType: 'groupsSum' },  // Criterio de búsqueda
      { $set: { [`values`]: sum } },
      { ...options, strict: false }
    );

    if (updatedDocument) {
      cache.flushAll();

      return res.status(200).json({ message: 'Documento actualizado o creado correctamente', sum });
    } else {
      return res.status(404).json({ message: 'Documento no encontrado' });
    }

  } catch (error) {
    res.status(500).json({ message: 'Internal server error' });
  }

});

app.get('/api/settings-dashboard', async (req, res) => {

  // try {

  //   const allData = await Data.find({});
  //   const companies = allData[0]['lines']['companies'];
  //   const agroups = allData[0]['lines']['names'];
  //   const schemas = allData[0]['lines']['schemas'];
  //   const gralList = allData[0]['lines']['gralList'];
  //   const top = allData[0]['dashboard']['top'];

  //   return res.status(200).json({ top, gralList, companies, agroups, schemas });

  // } catch (error) {
    
  // }

}); 

app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});