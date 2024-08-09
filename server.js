require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const mongoose = require('mongoose');

const fileUpload = require('express-fileupload');
const ExcelJS = require('exceljs');

const { Schema } = mongoose;

const aFormatData = require('./controllers/dataFormat');

const app = express();
const port = process.env.PORT;
const user = process.env.DB_USER;
const pass = process.env.DB_PASS;

app.use(bodyParser.json({ limit: `50mb` }));
app.use(bodyParser.urlencoded({ limit: `50mb`, extended: true, parameterLimit: 1000000 }));
app.use(function (req, res, next) {
  res.header("Access-Control-Allow-Origin", "*");
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, PATCH, DELETE');
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
  next();
});
app.use(fileUpload());

const mongoUri = `mongodb+srv://${user}:${pass}@cluster0.2qtf72w.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;
mongoose.connect(mongoUri)
  .then(() => {
    console.log('Connected to MongoDB');
  })
  .catch((error) => {
    console.error('Error connecting to MongoDB:', error);
  });


const db = mongoose.connection;
db.on('error', console.error.bind(console, 'connection error:'));
db.once('open', () => {
  console.log('Connected to MongoDB');
});

const dataSchema = new Schema({
  data: Schema.Types.Mixed,
  lines: Schema.Types.Mixed
});

const Data = mongoose.model('Data', dataSchema);

app.get('/', async (req, res) => {
  res.status(200).send('ready 1');
});

app.post('/api/format', async (req, res) => {
  try {
    if (!req.files || Object.keys(req.files).length === 0) {
      return res.status(400).send('No files were uploaded.');
    }
  
    const allData = await Data.find({});
    const groupsChilds = allData[0]['lines']['groupsChilds'];
    const gralList = allData[0]['lines']['gralList'];

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

    const pathAgroups = `lines.groupsChilds.${company_short}`;
    const pathGralList = `lines.gralList`;
    const pathGralBalance = `lines.dataGralForMonth.${year}.${month}.${company_short}`;

    let groupsChildsTemp = {};
    let gralListTemp = gralList;
    
    if( !gralListTemp[company_short] )
      gralListTemp[company_short] = {};


    balance.forEach(( item ) => {

      gralListTemp[company_short][item.cuenta] = { cuenta: item.cuenta, nombre: item.nombre };
      if( !groupsChilds[item.cuenta] ) {
        groupsChildsTemp[item.cuenta] = {};
        groupsChildsTemp[item.cuenta][item.cuenta] = { cuenta: item.cuenta, nombre: item.nombre };
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

    const filter = {};

    const update = {
      $set: {
        [pathAgroups]: groupsChildsTemp,
        [pathGralList]: gralListTemp,
        [pathGralBalance]: dataGral,
      }
    };

    const options = {
      new: true,
      upsert: true,
      useFindAndModify: false
    };

    const updatedDocument = await Data.findOneAndUpdate(filter, update, options);

    if (updatedDocument) {
      res.status(200).json({ message: 'Documento actualizado o creado correctamente', dataGral/*data*/ });
    } else {
      res.status(404).json({ message: 'Documento no encontrado' });
    }
  } catch (error) {
    console.error('Error al guardar datos en MongoDB:', error);
    res.status(500).send('Error interno al guardar datos');
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

  const allData = await Data.find({});
  const names = allData[0]['lines']['names'];
  const groupsEnabledMultiplator = allData[0]['lines']['groupsEnabledMultiplicator'];
  const groupsEnabled = allData[0]['lines']['groupsEnabled'];
  const groupsChilds = allData[0]['lines']['groupsChilds'];
  const groupsSum = allData[0]['lines']['groupsSum'];
  const dataGralForMonth = allData[0]['lines']['dataGralForMonth']['2024'];

  if (allData.length) {

    tempData = {};
    dataRemake = {};
    const msFixed = aFormatData.getMonthsUntilNow();

    names.forEach(( name ) => {
      
      // if( name === 'APORTACIONES A' || name === 'ESTADO DE RESULTADOS' ) {
        
        dataRemake[name] = {};
  
        Object.entries( groupsEnabled ).forEach(( element ) => {
    
          const company = element[0];
          const nameTemp = element[1][name];
  
          if( company && nameTemp ) {
  
            dataRemake[name][company] = {};
            
            msFixed.forEach(( month ) => {
              
              dataRemake[name][company][month] = {};

              nameTemp.forEach(( accountFather, index ) => {
                
                if( index === 0 )
                  dataRemake[name][company][month]['balance'] = [];
                
                const saldoFinalTemp = groupsSum[company]?.[name]?.[accountFather];

                if( groupsChilds[company] && groupsChilds[company][accountFather] ) {
    
                    if( dataGralForMonth[month] && dataGralForMonth[month][company] && dataGralForMonth[month][company][accountFather] ) {
                      
                      let dataTemp = [];
    
                      Object.keys( groupsChilds[company][accountFather] ).forEach(( accountChild, index ) => {
                        
                        if( dataGralForMonth[month][company][accountChild] && index !== 0) {

                          // ---
                          if( saldoFinalTemp ) {

                            dataGralForMonth[month][company][accountChild]['saldo-final'] = saldoFinalTemp.
                            reduce((acc, currentAcc) => {
                              return acc + dataGralForMonth[month][company][accountChild][currentAcc];
                            }, 0);
                            
                          }
                          // ---

                          dataTemp.push( dataGralForMonth[month][company][accountChild] );

                        }

                      });

                      dataGralForMonth[month][company][accountFather].data = dataTemp;

                      // ---
                      if( saldoFinalTemp ) {

                        dataGralForMonth[month][company][accountFather]['saldo-final'] = saldoFinalTemp.
                        reduce((acc, currentAcc) => {
                          return acc + dataGralForMonth[month][company][accountFather][currentAcc];
                        }, 0);
                        
                      }
                      // ---
    
                      dataRemake[name][company][month]['balance'].push( dataGralForMonth[month][company][accountFather] );
    
                    }
    
                  }
  
              });
              
    
            });
            // Object.values( element[1] ).forEach(( element2 ) => {
    
            //   msFixed.forEach(( month ) => {
  
            //     dataRemake[name][company][month] = {};
            //     dataRemake[name][company][month]['balance'] = [];
                
            //     element2.forEach(( accountFather ) => {
            //       const saldoFinalTemp = groupsSum[company]?.[name]?.[accountFather];

            //       if( groupsChilds[company] && groupsChilds[company][accountFather] ) {
    
            //         if( dataGralForMonth[month] && dataGralForMonth[month][company] && dataGralForMonth[month][company][accountFather] ) {
                      
            //           let dataTemp = [];
    
            //           Object.keys( groupsChilds[company][accountFather] ).forEach(( accountChild, index ) => {
                        
            //             if( dataGralForMonth[month][company][accountChild] && index !== 0) {

            //               // ---
            //               if( saldoFinalTemp ) {

            //                 dataGralForMonth[month][company][accountChild]['saldo-final'] = saldoFinalTemp.
            //                 reduce((acc, currentAcc) => {
            //                   return acc + dataGralForMonth[month][company][accountChild][currentAcc];
            //                 }, 0);
                            
            //               }
            //               // ---

            //               dataTemp.push( dataGralForMonth[month][company][accountChild] );

            //             }

            //           });

            //           dataGralForMonth[month][company][accountFather].data = dataTemp;

            //           // ---
            //           if( saldoFinalTemp ) {

            //             dataGralForMonth[month][company][accountFather]['saldo-final'] = saldoFinalTemp.
            //             reduce((acc, currentAcc) => {
            //               return acc + dataGralForMonth[month][company][accountFather][currentAcc];
            //             }, 0);
                        
            //           }
            //           // ---
    
            //           dataRemake[name][company][month]['balance'].push( dataGralForMonth[month][company][accountFather] );
    
            //         }
    
            //       }
      
            //     });
  
            //   });
              
    
            // });
  
          }
  
        });

      // }

    });
// console.log(dataRemake)
    res.status( 200 ).json({ 
      data: dataRemake,
      groupsChilds,
      groupsEnabled,
      dataGralForMonth,
      groupsEnabledMultiplator,
      months: msFixed,
    });

  } else {
    res.status(404).json({ message: 'No data found' });
  }
  } catch (error) {
    console.error('Error retrieving data from MongoDB:', error);
    res.status(500).json({ message: 'Internal server error' });
  }

});

app.get('/api/groups', async (req, res) => {

  try {
    const allData = await Data.find({});
    const multiplicators = allData[0]['lines']['groupsEnabledMultiplicator'];
    const sum = allData[0]['lines']['groupsSum'];
    const groups = allData[0]['lines']['groupsEnabled'];
    const names = allData[0]['lines']['names'];
    const companies = allData[0]['lines']['companies'];
    const gralList = allData[0]['lines']['gralList'];
    const groupsChilds = allData[0]['lines']['groupsChilds'];


    res.status(200).send({
      groups,
      multiplicators,
      names,
      companies,
      gralList,
      groupsChilds,
      sum,
    });
  } catch (error) {
    console.error('Error retrieving data from MongoDB:', error);
    res.status(500).json({ message: 'Internal server error' });
  }

});

app.post('/api/multiplicators', async (req, res) => {

  try {

    const filter = {}; // Agrega aquí tu condición de filtro si es necesario

    const update = {
      $set: {
        'lines.groupsEnabledMultiplicator': req.body,
      }
    };

    const options = {
      new: true, // Devuelve el documento actualizado
      upsert: true, // Crea un nuevo documento si no existe
      useFindAndModify: false // Opción para evitar el uso de findAndModify
    };

    // Utiliza findOneAndUpdate para actualizar el documento
    const updatedDocument = await Data.findOneAndUpdate(filter, update, options);

    if (updatedDocument) {
      return res.status(200).json({ message: 'Documento actualizado o creado correctamente', updatedDocument });
    } else {
      return res.status(404).json({ message: 'Documento no encontrado' });
    }

  } catch (error) {
    res.status(500).json({ message: 'Internal server error' });
  }

});

app.post('/api/name', async (req, res) => {

  try {

    const filter = {}; // Agrega aquí tu condición de filtro si es necesario

    const update = {
      $set: {
        'lines.names': Object.values( req.body ),
      }
    };

    const options = {
      new: true, // Devuelve el documento actualizado
      upsert: true, // Crea un nuevo documento si no existe
      useFindAndModify: false // Opción para evitar el uso de findAndModify
    };

    // Utiliza findOneAndUpdate para actualizar el documento
    const updatedDocument = await Data.findOneAndUpdate(filter, update, options);

    if (updatedDocument) {
      return res.status(200).json({ message: 'Documento actualizado o creado correctamente', updatedDocument });
    } else {
      return res.status(404).json({ message: 'Documento no encontrado' });
    }

  } catch (error) {
    res.status(500).json({ message: 'Internal server error' });
  }

});

app.post('/api/link', async (req, res) => {

  const allData = await Data.find({});
  const groups = allData[0]['lines']['groups'];
  const groupsEnabled = allData[0]['lines']['groupsEnabled'];

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

    const filter = {}; // Agrega aquí tu condición de filtro si es necesario

    const update = {
      $set: {
        'lines.groups': groups,
        'lines.groupsEnabled': groupsEnabled,
      }
    };

    const options = {
      new: true, // Devuelve el documento actualizado
      upsert: true, // Crea un nuevo documento si no existe
      useFindAndModify: false // Opción para evitar el uso de findAndModify
    };

    // Utiliza findOneAndUpdate para actualizar el documento
    const updatedDocument = await Data.findOneAndUpdate(filter, update, options);

    if (updatedDocument) {
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
    const allData = await Data.find({});
    if (!allData.length) {
      return res.status(404).json({ message: 'No data found' });
    }

    const data = allData[0];
    const groups = data.lines.groups;
    const groupsEnabled = data.lines.groupsEnabled;

    // Verifica si el grupo y la empresa existen
    if (!groups[company] || !groupsEnabled[company] || !groups[company].find(group => group.name === agroup)) {
      return res.status(404).json({ message: 'Group or company not found' });
    }

    // Elimina el grupo de 'groups'
    groups[company] = groups[company].filter(group => group.name !== agroup);

    // Elimina el grupo de 'groupsEnabled'
    delete groupsEnabled[company][agroup];

    // Actualiza el documento en la base de datos
    const updatedDocument = await Data.findOneAndUpdate(
      { _id: data._id },
      {
        $set: {
          'lines.groups': groups,
          'lines.groupsEnabled': groupsEnabled,
        }
      },
      { new: true, useFindAndModify: false }
    );

    if (updatedDocument) {
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
    const allData = await Data.find({});
    if (!allData.length) {
      return res.status(404).json({ message: 'No data found' });
    }

    const data = allData[0];
    const groupsEnabled = Object.values( data.lines.groupsEnabled );

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
    const names = (data.lines.names).filter(e => e !== name);

    // Actualiza el documento en la base de datos
    const updatedDocument = await Data.findOneAndUpdate(
      { _id: data._id },
      {
        $set: {
          'lines.names': names,
        }
      },
      { new: true, useFindAndModify: false }
    );

    if (updatedDocument) {
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

    const filter = {}; // Agrega aquí tu condición de filtro si es necesario

    const update = {
      $set: {
        'lines.groups': tempData,
        'lines.groupsEnabled': req.body.groups,
        'lines.groupsEnabledMultiplicator': req.body.multiplicators,
      }
    };

    const options = {
      new: true, // Devuelve el documento actualizado
      upsert: true, // Crea un nuevo documento si no existe
      useFindAndModify: false // Opción para evitar el uso de findAndModify
    };

    // Utiliza findOneAndUpdate para actualizar el documento
    const updatedDocument = await Data.findOneAndUpdate(filter, update, options);

    if (updatedDocument) {
      return res.status(200).json({ message: 'Documento actualizado o creado correctamente', updatedDocument });
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

    const allData = await Data.find({});
    const groupsChilds = allData[0]['lines']['groupsChilds'];
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
    
    const filter = {}; // Agrega aquí tu condición de filtro si es necesario

    const update = {
      $set: {
        'lines.groupsChilds': groupsChilds,
      }
    };

    const options = {
      new: true, // Devuelve el documento actualizado
      upsert: true, // Crea un nuevo documento si no existe
      useFindAndModify: false // Opción para evitar el uso de findAndModify
    };

    // Utiliza findOneAndUpdate para actualizar el documento
    const updatedDocument = await Data.findOneAndUpdate(filter, update, options);

    if (updatedDocument) {
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

    const allData = await Data.find({});
    const sum = allData[0]['lines']['groupsSum'];
    const { company, agroup, account, checkboxes } = req.body;

    if( !sum[company] )
      sum[company] = {};
    if( !sum[company][agroup] )
      sum[company][agroup] = {};
    if( !sum[company][agroup][account] )
      sum[company][agroup][account] = {};

    sum[company][agroup][account] = checkboxes;

    const filter = {}; // Agrega aquí tu condición de filtro si es necesario

    const update = {
      $set: {
        'lines.groupsSum': sum,
      }
    };

    const options = {
      new: true, // Devuelve el documento actualizado
      upsert: true, // Crea un nuevo documento si no existe
      useFindAndModify: false // Opción para evitar el uso de findAndModify
    };

    // Utiliza findOneAndUpdate para actualizar el documento
    const updatedDocument = await Data.findOneAndUpdate(filter, update, options);

    if (updatedDocument) {
      return res.status(200).json({ message: 'Documento actualizado o creado correctamente', sum });
    } else {
      return res.status(404).json({ message: 'Documento no encontrado' });
    }

  } catch (error) {
    res.status(500).json({ message: 'Internal server error' });
  }

});

app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});