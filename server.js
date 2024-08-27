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

const mongoUri = `mongodb+srv://${user}:${pass}@clusterportal.mca6q.mongodb.net/portal?retryWrites=true&w=majority`;
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
});

const Data = mongoose.model('Data', dataSchema);

function handleResponse(res, status, content = {}) {
  return res.status(status).json(content);
}

app.get('/', async (req, res) => {
  res.status(200).send('ready 1');
});

app.post('/cintura', async (req, res) => {
  const month = 'Julio';

  let data = await Data.find(
    { 
      year: '2024', 
      documentType: 'dataGralForMonth',
      r: 'init'
    }, 
    { 
      [`values.2024.${month}`]: 1 
    }
  );

  data = aFormatData.getNodeMultiple( data[0] )['2024'][month];

  let data2 = await Data.find(
    { 
      year: '2024', 
      documentType: 'dataGralForMonth',
      month,
      __v: 0,
    }, 
    { 
      [`values.2024.${month}`]: 1 
    }
  );

  data2 = aFormatData.getNodeMultiple( data2[0] )['2024'][month];

  const dataNew = {
    ...data,
    ...data2
  }

  const options = { new: true, upsert: true, useFindAndModify: false, strict: false };

  await Data.findOneAndUpdate(
    { year, month, documentType: 'dataGralForMonth' },
    { $set: { [`values.2024.${month}`]: dataNew } },
    options
  )

  // return handleResponse( res, 200, { data: Object.keys( data ).length, data2: Object.keys( data2 ).length, dataNew: dataNew } );
  return handleResponse( res, 200, { month, data: Object.keys( data ).length, data2: Object.keys( data2 ).length, dataNew: Object.keys( dataNew ).length } );
  // const options = {
  //   new: true, // Devuelve el documento actualizado
  //   upsert: true, // Crea un nuevo documento si no existe
  //   useFindAndModify: false // Opción para evitar el uso de findAndModify
  // };

  // // Utiliza findOneAndUpdate para actualizar el documento
  // const updatedDocument = await Data.findOneAndUpdate(
  //   { year: year, documentType: 'groupsEnabled' },  // Criterio de búsqueda
  //   { $set: { [`values`]: require('./public/lines.json')['groupsEnabled'] } },
  //   { ...options, strict: false }
  // );
  // res.status(200).send('ready 1');
});

const parseExcelFile = async (fileData) => {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(fileData);

  const worksheet = workbook.worksheets[0];
  const jsonData = [];

  worksheet.eachRow({ includeEmpty: false }, (row) => {
    const rowData = [];
    row.eachCell({ includeEmpty: true }, (cell) => {
      const cellValue = cell.value;
      const cellStyle = cell.font;
      const bold = cellStyle && cellStyle.bold;
      rowData.push(bold ? { text: cellValue, bold: true } : { text: cellValue, bold: false });
    });
    jsonData.push(rowData);
  });

  return jsonData;
}

const processData = (groupsChilds, gralList, balance, company_short) => {
  let groupsChildsTemp = {};
  let gralListTemp = gralList;

  if (!gralListTemp[company_short]) gralListTemp[company_short] = {};

  balance.forEach((item) => {
    let updatedChilds_ = true;

    gralListTemp[company_short][item.cuenta] = { cuenta: item.cuenta, nombre: item.nombre };
    if (!groupsChilds?.[company_short]?.[item.cuenta]) {
      groupsChildsTemp[item.cuenta] = {};
      groupsChildsTemp[item.cuenta][item.cuenta] = { cuenta: item.cuenta, nombre: item.nombre };
    } else {
      groupsChildsTemp[item.cuenta] = groupsChilds[company_short][item.cuenta];
      updatedChilds_ = false;
    }

    item.data.forEach(({ cuenta, nombre }) => {
      if (!groupsChildsTemp[item.cuenta][cuenta] && updatedChilds_) {
        groupsChildsTemp[item.cuenta][cuenta] = { cuenta, nombre };
      }
      gralListTemp[company_short][cuenta] = { cuenta, nombre };
    });
  });

  return { groupsChildsTemp, gralListTemp };
}

app.post('/api/format', async (req, res) => {
  
  try {
    if (!req.files || Object.keys(req.files).length === 0) {
      return res.status(400).send('No files were uploaded.');
    }
    
    const jsonData = await parseExcelFile(req.files.file.data);
    const { data, dataGral } = aFormatData.aFormatData(jsonData);
    const { year, month, company_short, balance } = data;

    const [dataGroupsChilds, dataGralList] = await Promise.all([
      Data.find({ year: '2024', documentType: 'groupsChilds' }, { [`values.${company_short}`]: 1 }),
      Data.find({ year: '2024', documentType: 'gralList' }, { [`values.${company_short}`]: 1 })
    ]);
    
    const groupsChilds = aFormatData.getNode( dataGroupsChilds );
    const gralList = aFormatData.getNode( dataGralList );

    const { groupsChildsTemp, gralListTemp } = processData(groupsChilds, gralList, balance, company_short);
    
    const options = { new: true, upsert: true, useFindAndModify: false, strict: false };
    const [updatedDocument1, updatedDocument2, updatedDocument3] = await Promise.all([
      Data.findOneAndUpdate(
        { year, documentType: 'groupsChilds' },
        { $set: { [`values.${company_short}`]: groupsChildsTemp } },
        options
      ),
      Data.findOneAndUpdate(
        { year, documentType: 'gralList' },
        { $set: { [`values.${company_short}`]: gralListTemp[company_short] } },
        options
      ),
      Data.findOneAndUpdate(
        { year, month, documentType: 'dataGralForMonth' },
        { $set: { [`values.${year}.${month}.${company_short}`]: dataGral } },
        options
      )
    ]);
  
    if (!updatedDocument1 || !updatedDocument2 || !updatedDocument3) {
      throw new Error('Failed to update one or more documents');
    }

    cache.flushAll();
    // return res.status(200).json({ message: 'Documento actualizado o creado correctamente', dataGral });
    const content = { message: 'Documento actualizado o creado correctamente', dataGral };
    return handleResponse( res, 200, content );
   
  } catch (error) {
    console.error('Error al guardar datos en MongoDB:', error);
    return handleError(res, error, 'Error uploading file');
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

async function getDataFromMongo(documentType, projection = {}) {
  if ( documentType === 'dataGralForMonth' ) {
    // const ids = [ '66c669ea3ec076ff46a64068', '66c683033ec076ff460ab187', '66c77b05b9ffc6b12870b379', '66c77de2b9ffc6b1287c889d', '66c77bf8b9ffc6b128748af5', '66c77ca8b9ffc6b128777146', '66c892a1b9ffc6b128dfd5d5' ];
    // return await Data.find({ _id: { $in: ids }, year, documentType, __v: 0 }).select(projection);
    return await Data.find({ year, documentType, __v: 0 }).select(projection);

  }
  return await Data.find({ year, documentType }).select(projection);
}

async function getNodeFromMongo(documentType, projection = {}) {
  const data = await getDataFromMongo(documentType, projection);
  return aFormatData.getNode(data);
}

async function getNodeMultipleFromMongo(documentType, projection = {}) {
  const data = await getDataFromMongo(documentType, projection);

  if ( documentType === 'dataGralForMonth' ) {
    // let dataGralForMonth = {};
    // data.map(( elementD, indexD ) => {
    // const md = [ 'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio' ];
    // const allCompanies = [  'MVS', 'VFJ', 'COR', 'PAT', 'DNO', 'MOV', 'DOS', 'VEC', 'ACT', 'GDL', 'OCC', 'REN', 'FYJ', 'GAR', 'RUT', 'MIN', 'HMS', 'DAC', 'AGS', 'SIN', 'RPL' ];
    // const afd = aFormatData.getNodeMultiple( elementD );
    // // const afd = Object.values( aFormatData.getNodeMultiple( elementD ) );
      
    //   // if (indexD === 0) {
        
    //     md.forEach(( m ) => {
    //       allCompanies.forEach(( c ) => {

    //         if( afd?.['2024']?.[m]?.[c] ) {

    //           if( !dataGralForMonth?.[m] )
    //             dataGralForMonth[m] = {};
    //           if( !dataGralForMonth?.[m]?.[c] )
    //             dataGralForMonth[m][c] = {};

    //             dataGralForMonth = {
    //               ...dataGralForMonth,
    //               [m]: {
    //                 ...dataGralForMonth[m],
    //                 [c]: afd['2024'][m][c]
    //               }
    //             }

    //         }

    //       });
    //     });
        
    //   // }

    // });

    // return dataGralForMonth;

    let nodeDataGralForMonth = [];
    // const dataFilter = aFormatData.getNodeMultiple( dataDataGralForMonth[0] );
    data.forEach( element => {
      const fData = Object.values( element ).filter(i => i.values);
      const aF = aFormatData.getNodeMultiple( fData );
      nodeDataGralForMonth = [
        ...nodeDataGralForMonth,
        aF['2024']
      ]
    });
    // const nodeDataGralForMonth = aFormatData.getNodeMultiple(dataDataGralForMonth);    
    const md = [ 'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio' ];
    let dataGralForMonth = {};
    
    md.forEach(m => {
      const vI = nodeDataGralForMonth.find(n => n[m]);
      if( vI )
        dataGralForMonth[m] = vI[m];
    });

    return dataGralForMonth;
  }
  return aFormatData.getNodeMultiple(data[0]); // asumiendo que solo esperas un documento
}

app.post('/api/data', async (req, res) => {
  try {
      // cache.flushAll();
      const cacheKey = `data_${year}`;
      const cachedData = cache.get(cacheKey);

      if (cachedData) {
        return res.status(200).json(cachedData);
      }
      // cache.flushAll();

      let [
        names,
        groupsEnabledMultiplator,
        groupsEnabled,
        groupsChilds,
        groupsSum,
        // dataGralForMonth,
      ] = await Promise.all([
        getNodeMultipleFromMongo('names'),
        getNodeMultipleFromMongo('groupsEnabledMultiplicator'),
        getNodeMultipleFromMongo('groupsEnabled'),
        getNodeMultipleFromMongo('groupsChilds'),
        getNodeMultipleFromMongo('groupsSum'),
        // getNodeMultipleFromMongo('dataGralForMonth')
      ]);

      return handleResponse( res, 200, {
        names,
        groupsEnabledMultiplator,
        groupsEnabled,
        groupsChilds,
        groupsSum,
        // dataGralForMonth,
      } )

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

                                      // dataGralForMonth[month][company][accountFather].data = dataTemp;
                                      dataGralForMonth = {
                                        ...dataGralForMonth,
                                        [month]: {
                                          ...dataGralForMonth[month],
                                          [company]: {
                                            ...dataGralForMonth[month][company],
                                            [accountFather]: {
                                              ...dataGralForMonth[month][company][accountFather],
                                              data: dataTemp
                                            }
                                          }
                                        }
                                      }

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

                                      if( dataRemake?.[name]?.[company]?.[month]?.['balance'] ) {
                                        dataRemake = {
                                          ...dataRemake,
                                          [name]: {
                                            ...dataRemake[name],
                                            [company]: {
                                              ...dataRemake[name][company],
                                              [month]: {
                                                balance: [
                                                  ...dataRemake[name][company][month]['balance'],
                                                  dataGralForMonth[month][company][accountFather]
                                                ]
                                              }
                                            }
                                          }
                                        };
                                      } else {
                                        dataRemake = {
                                          ...dataRemake,
                                          [name]: {
                                            ...dataRemake[name],
                                            [company]: {
                                              ...dataRemake[name][company],
                                              [month]: {
                                                balance: [
                                                  dataGralForMonth[month][company][accountFather]
                                                ]
                                              }
                                            }
                                          }
                                        };
                                      }
                                      // dataRemake[name][company][month]['balance'].push(
                                      //     dataGralForMonth[month][company][accountFather]
                                      // );
                                  }
                              }
                          });
                      });
                  }
              });
          });

          const responseData = {
              dataGralForMonth,
              data: dataRemake,
              groupsChilds,
              groupsEnabled,
              groupsEnabledMultiplator,
              months: msFixed
          };

          // Almacenar en la caché con TTL
          cache.set(cacheKey, responseData);

          // return res.status(200).json(responseData);
          return handleResponse( res, 200, responseData );
      } else {
          // return res.status(404).json({ message: 'No data found' });
          return handleResponse( res, 404, { message: 'No data found' });
      }
  } catch (error) {
      console.error('Error retrieving data from MongoDB:', error);
      return handleResponse( res, 500, { message: 'Internal server error' } );
  }
});

app.post('/api/datagral', async (req, res) => {
  try {
      // cache.flushAll();
      const cacheKey = `data_${year}`;
      const cachedData = cache.get(cacheKey);

      if (cachedData) {
        return res.status(200).json(cachedData);
      }

      let [
        dataGralForMonth,
      ] = await Promise.all([
        getNodeMultipleFromMongo('dataGralForMonth')
      ]);

      return handleResponse( res, 200, {
        dataGralForMonth,
      } )

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

                                      // dataGralForMonth[month][company][accountFather].data = dataTemp;
                                      dataGralForMonth = {
                                        ...dataGralForMonth,
                                        [month]: {
                                          ...dataGralForMonth[month],
                                          [company]: {
                                            ...dataGralForMonth[month][company],
                                            [accountFather]: {
                                              ...dataGralForMonth[month][company][accountFather],
                                              data: dataTemp
                                            }
                                          }
                                        }
                                      }

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

                                      if( dataRemake?.[name]?.[company]?.[month]?.['balance'] ) {
                                        dataRemake = {
                                          ...dataRemake,
                                          [name]: {
                                            ...dataRemake[name],
                                            [company]: {
                                              ...dataRemake[name][company],
                                              [month]: {
                                                balance: [
                                                  ...dataRemake[name][company][month]['balance'],
                                                  dataGralForMonth[month][company][accountFather]
                                                ]
                                              }
                                            }
                                          }
                                        };
                                      } else {
                                        dataRemake = {
                                          ...dataRemake,
                                          [name]: {
                                            ...dataRemake[name],
                                            [company]: {
                                              ...dataRemake[name][company],
                                              [month]: {
                                                balance: [
                                                  dataGralForMonth[month][company][accountFather]
                                                ]
                                              }
                                            }
                                          }
                                        };
                                      }
                                      // dataRemake[name][company][month]['balance'].push(
                                      //     dataGralForMonth[month][company][accountFather]
                                      // );
                                  }
                              }
                          });
                      });
                  }
              });
          });

          const responseData = {
              dataGralForMonth,
              data: dataRemake,
              groupsChilds,
              groupsEnabled,
              groupsEnabledMultiplator,
              months: msFixed
          };

          // Almacenar en la caché con TTL
          cache.set(cacheKey, responseData);

          // return res.status(200).json(responseData);
          return handleResponse( res, 200, responseData );
      } else {
          // return res.status(404).json({ message: 'No data found' });
          return handleResponse( res, 404, { message: 'No data found' });
      }
  } catch (error) {
      console.error('Error retrieving data from MongoDB:', error);
      return handleResponse( res, 500, { message: 'Internal server error' } );
  }
});

app.get('/api/groups', async (req, res) => {
  // try {
  //   const cacheKey = 'groupsData';
  //   const cachedData = cache.get(cacheKey);

    // Si los datos están en la caché, se retornan directamente
    // if (cachedData) {
    //   // return res.status(200).send(cachedData);
    //   return handleResponse( res, 200, { cachedData } );
    // }

    // Si los datos no están en la caché, se consultan desde MongoDB
    const [
      dataGroupsEnabledMultiplicator,
      dataGroupsSum,
      dataGroupsEnabled,
      dataNames,
      dataCompanies,
      dataGralList,
      dataGroupsChilds
    ] = await Promise.all([
      Data.find({ year, documentType: 'groupsEnabledMultiplicator' }).select('values'),
      Data.find({ year, documentType: 'groupsSum' }).select('values'),
      Data.find({ year, documentType: 'groupsEnabled' }).select('values'),
      Data.find({ year, documentType: 'names' }).select('values'),
      Data.find({ year, documentType: 'companies' }).select('values'),
      Data.find({ year, documentType: 'gralList' }).select('values'),
      Data.find({ year, documentType: 'groupsChilds' }).select('values')
    ]);

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
    // cache.set(cacheKey, responseData, 600);

    return handleResponse( res, 200, responseData );
  // } catch (error) {
  //   console.error('Error retrieving data from MongoDB:', error);
  //   res.status(500).json({ message: 'Internal server error' });
  // }
});

app.post('/api/multiplicators', async (req, res) => {

  try {

    // Validar la entrada de datos
    if (!req.body || Object.keys(req.body).length === 0) {
      return handleResponse( res, 400, { message: 'Bad Request: No data provided' });
    }

    const options = {
      new: true, // Devuelve el documento actualizado
      upsert: true, // Crea un nuevo documento si no existe
      useFindAndModify: false, // Opción para evitar el uso de findAndModify
      strict: false
    };

    // Utiliza findOneAndUpdate para actualizar el documento
    const updatedDocument = await Data.findOneAndUpdate(
      { year: year, documentType: 'groupsEnabledMultiplicator' },  // Criterio de búsqueda
      { $set: { [`values`]: req.body } },
      options
    );

    if ( updatedDocument ) {
      // cache.del('groupsData');
      cache.flushAll();

      // return res.status(200).json({ message: 'Documento actualizado o creado correctamente' });
      return handleResponse( res, 200, { message: 'Documento actualizado o creado correctamente' });
    } else {
      return handleResponse( res, 404, { message: 'Documento no encontrado' });
    }

  } catch (error) {
    return handleResponse( res, 500, { message: 'Internal server error' });
  }

});

app.post('/api/name', async (req, res) => {

  try {

    const options = {
      new: true, // Devuelve el documento actualizado
      upsert: true, // Crea un nuevo documento si no existe
      useFindAndModify: false, // Opción para evitar el uso de findAndModify
      strict: false
    };

    // Utiliza findOneAndUpdate para actualizar el documento
    const updatedDocument = await Data.findOneAndUpdate(
      { year: year, documentType: 'names' },  // Criterio de búsqueda
      { $set: { [`values`]: Object.values( req.body ) } },
      options
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

    const dataGroupsEnabled = await Data.find({ year, documentType: 'groupsEnabled' }).select('values');
    const groups = aFormatData.getNode( dataGroupsEnabled );

    const { group, category, accounts } = req.body;

    groups[group][category] = accounts;

    const options = {
      new: true, // Devuelve el documento actualizado
      upsert: true, // Crea un nuevo documento si no existe
      useFindAndModify: false, // Opción para evitar el uso de findAndModify
      strict: false,
    };

    const updatedDocument = await Data.findOneAndUpdate(
      { year: year, documentType: 'groupsEnabled' },  // Criterio de búsqueda
      { $set: { [`values`]: groups } },
      options
    );

    if ( updatedDocument ) {
      cache.flushAll();

      return handleResponse( res, 200, { message: 'Documento actualizado o creado correctamente' });
    } else {
      return handleResponse( res, 404, { message: 'Documento no encontrado' });
    }

  } catch (error) {
    return handleResponse( res, 500, { message: 'Internal server error' });
  }

});

app.post('/api/link', async (req, res) => {

  
  const [ dataGroups, dataGroupsEnabled ] = await Promise.all([
    Data.find({ year, documentType: 'groups' }).select('values'),
    Data.find({ year, documentType: 'groupsEnabled' }).select('values')
  ]);
  
  const groups = aFormatData.getNode( dataGroups );
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
      new: true,
      upsert: true,
      useFindAndModify: false,
      strict: false,
    };

    // Utiliza findOneAndUpdate para actualizar el documento
    const [updatedDocument1, updatedDocument2] = await Promise.all([
      Data.findOneAndUpdate(
        { year: year, documentType: 'groups' },  // Criterio de búsqueda
        { $set: { [`values`]: groups } },
        options
      ),
      Data.findOneAndUpdate(
        { year: year, documentType: 'groupsEnabled' },  // Criterio de búsqueda
        { $set: { [`values`]: groupsEnabled } },
        { ...options, strict: false }
      )
    ]);

    if ( updatedDocument1 && updatedDocument2 ) {
      // cache.del('groupsData');
      cache.flushAll();

      return handleResponse( res, 200, groupsEnabled);
    } else {
      return handleResponse( res, 404, { message: 'Documento no encontrado' });
    }

  } catch (error) {
    return handleResponse( res, 500, { message: 'Internal server error' });
  }

});

app.post('/api/unlink', async (req, res) => {
  const { company, agroup } = req.body;

  try {
    // Encuentra el documento
    const [ dataGroups, dataGroupsEnabled ] = await Promise.all([
      Data.find({ year, documentType: 'groups' }).select('values'),
      Data.find({ year, documentType: 'groupsEnabled' }).select('values')
    ]);
    
    const groups = aFormatData.getNode( dataGroups );
    const groupsEnabled = aFormatData.getNode( dataGroupsEnabled );

    // Verifica si el grupo y la empresa existen
    if (!groups[company] || !groupsEnabled[company] || !groups[company].find(group => group.name === agroup)) {
      return handleResponse( res, 404, { message: 'Group or company not found' } );
    }

    // Elimina el grupo de 'groups'
    groups[company] = groups[company].filter(group => group.name !== agroup);

    // Elimina el grupo de 'groupsEnabled'
    delete groupsEnabled[company][agroup];

    const options = {
      new: true,
      upsert: true,
      useFindAndModify: false,
      strict: false,
    };

    const [ updatedDocument1, updatedDocument2 ] = await Promise.all([
      Data.findOneAndUpdate(
        { year: year, documentType: 'groups' },  // Criterio de búsqueda
        { $set: { [`values`]: groups } },
        options,
      ),
      Data.findOneAndUpdate(
        { year: year, documentType: 'groupsEnabled' },  // Criterio de búsqueda
        { $set: { [`values`]: groupsEnabled } },
        options,
      )
    ]);

    if ( updatedDocument1 && updatedDocument2 ) {
      cache.flushAll();

      return handleResponse( res, 200, groupsEnabled );
    } else {
      return handleResponse( res, 404, { message: 'Document not found' } );
    }
  } catch (error) {
    console.error('Error:', error);
    return handleResponse( res, 500, { message: 'Internal server error' } );
  }
});

app.put('/api/agroup', async (req, res) => {

  try {
    
    const name = req.body.name;
    // Encuentra el documento
    const [ dataGroupsEnabled, dataNames ] = await Promise.all([
      Data.find({ year, documentType: 'groupsEnabled' }).select('values'),
      Data.find({ year, documentType: 'names' }).select('values')
    ]);

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
      return handleResponse( res, 404, { message: 'Document not found' } );
    }
    
    // const names = (data.lines.names).filter(e => e !== name);
    // const dataNames = await Data.find({ year, documentType: 'names' }).select('values');
    let names = aFormatData.getNode( dataNames );
    names = (names).filter(e => e !== name);

    const options = {
      new: true,
      upsert: true,
      useFindAndModify: false,
      strict: false,
    };
    // Actualiza el documento en la base de datos
    const updatedDocument = await Data.findOneAndUpdate(
      { year: year, documentType: 'names' },  // Criterio de búsqueda
      { $set: { [`values`]: names } },
      options
    );


    if ( updatedDocument ) {
      cache.flushAll();

      return handleResponse( res, 200,  names );
    } else {
      return handleResponse( res, 404, { message: 'Document not found' } );
    }
  } catch (error) {
    console.error('Error:', error);
    return handleResponse( res, 500, { message: 'Internal server error' } );
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

    const options = {
      new: true,
      upsert: true,
      useFindAndModify: false,
      strict: false,
    };

    const [ 
      updatedDocument1,
      updatedDocument2,
      updatedDocument3
    ] = await Promise.all([
      Data.findOneAndUpdate(
        { year: year, documentType: 'groups' },
        { $set: { [`values`]: tempData } },
        options
      ),
      Data.findOneAndUpdate(
        { year: year, documentType: 'groupsEnabled' },  // Criterio de búsqueda
        { $set: { [`values`]: req.body.groups } },
        options,
      ),
      Data.findOneAndUpdate(
        { year: year, documentType: 'groupsEnabledMultiplicator' },  // Criterio de búsqueda
        { $set: { [`values`]: req.body.multiplicators } },
        { ...options, strict: false }
      )
    ]);

    if ( updatedDocument1 && updatedDocument2 && updatedDocument3 ) {
      cache.flushAll();

      return handleResponse( res, 200, { message: 'Documento actualizado o creado correctamente', groups: req.body.groups, multiplicators: req.body.multiplicators } );
    } else {
      return handleResponse( res, 404, { message: 'Documento no encontrado' } );
    }
  } catch (error) {
    console.error('Error al actualizar documento en MongoDB:', error);
    return handleResponse( res, 500, { message: 'Error interno del servidor' } );
  }
});

app.put('/api/childs', async (req, res) => {
  
  try {

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

    const options = {
      new: true,
      upsert: true,
      useFindAndModify: false,
      strict: false
    };

    // Utiliza findOneAndUpdate para actualizar el documento
    const updatedDocument = await Data.findOneAndUpdate(
      { year: year, documentType: 'groupsChilds' },  // Criterio de búsqueda
      { $set: { [`values`]: groupsChilds } },
      options
    );

    if ( updatedDocument ) {
      cache.flushAll();

      return handleResponse( res, 200, { message: 'Documento actualizado o creado correctamente', groupsChilds } );
    } else {
      return handleResponse( res, 404, { message: 'Documento no encontrado' } );
    }
  } catch (error) {
    console.error('Error al actualizar documento en MongoDB:', error);
    return handleResponse( res, 500, { message: 'Error interno del servidor' } );
  }
});

app.post('/api/sum', async (req, res) => {

  try {

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

    const options = {
      new: true,
      upsert: true,
      useFindAndModify: false,
      strict: false,
    };

    // Utiliza findOneAndUpdate para actualizar el documento
    const updatedDocument = await Data.findOneAndUpdate(
      { year: year, documentType: 'groupsSum' },  // Criterio de búsqueda
      { $set: { [`values`]: sum } },
      options
    );

    if ( updatedDocument ) {
      cache.flushAll();

      return handleResponse( 200, { message: 'Documento actualizado o creado correctamente', sum } );
    } else {
      return handleResponse( 404, { message: 'Documento no encontrado' } );
    }

  } catch (error) {
    return handleResponse( 500, { message: 'Internal server error' } );
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