require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const mongoose = require('mongoose');
const fs = require('fs');
const axios = require('axios');
const { S3Client, ListObjectsV2Command, GetObjectCommand } = require('@aws-sdk/client-s3');
// const NodeCache = require('node-cache');
const fileUpload = require('express-fileupload');
const ExcelJS = require('exceljs');
const { default: nodemon } = require('nodemon');
const cors = require('cors');

const { getDataVisor } = require('./controllers/quickbase/distribution');
const { formatCars } = require('./helpers/upload');
const aFormatData = require('./controllers/dataFormat');
const { monthsAll } = require('./helpers/utils');
const mngRouter = require('./src/routes/mongoRouter');
// const client = require('./redis/redisClient');

const s3Client = new S3Client({
  region: process.env.AWS_REGION, // Leer región desde las variables de entorno
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY, // Leer Access Key desde las variables de entorno
    secretAccessKey: process.env.AWS_SECRET_KEY, // Leer Secret Key desde las variables de entorno
  },
});

const listObjectsInFolder = async (bucketName, folderPath = '') => {
  try {
    const params = {
      Bucket: bucketName,
      Prefix: folderPath,  // Prefijo de la "carpeta" en S3
    };

    const command = new ListObjectsV2Command(params);
    const data = await s3Client.send(command);

    // Archivos que coinciden con el prefijo
    const files = data.Contents ? data.Contents.map(item => item.Key) : [];

    return { files };
  } catch (err) {
    console.error('Error al listar objetos en la carpeta:', err);
    throw err;
  }
};

// const cache = new NodeCache({ stdTTL: 600 });

const { Schema } = mongoose;

const app = express();
const port = process.env.PORT;
const user = process.env.DB_USER;
const pass = process.env.DB_PASS;
const QB_TOKEN = process.env.QB_TOKEN;
const HEADERS_QB = {
  'Content-Type': 'application/json',
  'QB-Realm-Hostname': 'jesuscortez.quickbase.com',
  'Authorization': `QB-USER-TOKEN ${ QB_TOKEN }`,
}

const year = `2024`;
const yearNumber = parseInt( new Date().getFullYear() );
const yearText = `${ new Date().getFullYear() }`;

app.use(bodyParser.json({ limit: `500mb` }));
app.use(bodyParser.urlencoded({ limit: `500mb`, extended: true, parameterLimit: 1000000 }));
app.use((req, res, next) => {
  req.setTimeout(300000); // 5 minutos
  res.setTimeout(300000, () => {
    console.error('Request timeout');
    res.status(408).json({ error: 'Request Timeout' });
  });
  next();
});
app.use(function (req, res, next) {
  res.header("Access-Control-Allow-Origin", "*");
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, PATCH, DELETE');
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
  next();
});
const allowedOrigins = [
  'https://portal.katalabs.mx',
  'http://localhost:5174'
];
app.use(cors({
  // origin: 'https://portal.katalabs.mx', // Permitir solo esta URL
  // origin: function (origin, callback) {
  //   console.log({origin})
  //   if (!origin || allowedOrigins.includes(origin)) {
  //     callback(null, true);
  //   } else {
  //     callback(new Error('No permitido por CORS'));
  //   }
  // },
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE'], // Métodos permitidos
  allowedHeaders: ['Content-Type', 'Authorization'], // Encabezados permitidos
}));
// app.options('/api/modify/childs', cors()); // Manejo explícito para OPTIONS
app.options('*', cors()); // Manejo explícito para OPTIONS

app.use(fileUpload());

const mongoUri = `mongodb+srv://${user}:${pass}@clusterkatalabs.kb27m.mongodb.net/kata?retryWrites=true&w=majority&appName=ClusterKatalabs=true`;

mongoose.connect(mongoUri).then(() => {
  console.log('Conectado a MongoDB localmente sin SSL');
}).catch(err => {
  console.error('Error al conectar con MongoDB local:', err);
});

// const db = mongoose.connection;
// db.on('error', console.error.bind(console, 'connection error:'));
// db.once('open', () => {
//   console.log('Connected to MongoDB');
// });

const dataSchema = new Schema({
  year: Schema.Types.Mixed,
  documentType: Schema.Types.Mixed,
  distributor: Schema.Types.Mixed,
  type: Schema.Types.Mixed,
});

const Data = mongoose.model('Data', dataSchema);

const handleResponse = (res, status, content = {}) => {
  return res.status(status).json(content);
} 

app.get('/', async (req, res) => {
  res.status(200).send('ready.');
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

app.post('/api/upload/:type', async (req, res) => {
  
  try {
    if (!req.files || Object.keys(req.files).length === 0) {
      return res.status(400).send('No files were uploaded.');
    }

    const type = req.params.type;
    const jsonData = await parseExcelFile(req.files.file.data);
    const companies = [ 'MVS', 'VFJ', 'COR', 'PAT', 'DNO', 'MOV', 'DOS', 'VEC', 'ACT', 'GDL', 'OCC', 'REN', 'FYJ', 'GAR', 'RUT', 'MIN', 'HMS', 'DAC', 'AGS', 'SIN', 'RPL' ];
    const initialLevel2 = aFormatData.getNode( 
      await Data.find({ 
        type: 'keys', 
        documentType: 'cars' 
      }).select('values') );
    
    const { dataUpload, month, year, keysLevel2 } = formatCars( jsonData, companies, initialLevel2 );
    
    const options = { 
      new: true, 
      upsert: true, 
      useFindAndModify: false, 
      strict: false 
    };

    const [ updatedDocument1, updatedDocument2 ] = await Promise.all([
      Data.findOneAndUpdate(
        { year, month, documentType: 'cars' },  // Criterio de búsqueda
        { $set: { type: 'data', [`values`]: dataUpload } },
        options
      ),
      Data.findOneAndUpdate(
        { type: 'keys', documentType: 'cars' },  // Criterio de búsqueda
        { $set: { [`values`]: keysLevel2 } },
        options
      )
    ]);
    
    return handleResponse( res, 200, { updatedDocument2, updatedDocument1 } );
   
  } catch (error) {
    console.error('Error al guardar datos en MongoDB:', error);
    return handleError(res, error, 'Error uploading file');
  }
});

app.post('/api/format', async (req, res) => {

  try {

    if (!req.files || Object.keys(req.files).length === 0) {
      return res.status(400).send('No files were uploaded.');
    }
    
    const jsonData = await parseExcelFile(req.files.file.data);
    const isRXP = JSON.stringify( jsonData ).includes('Total X Cobrar KataLabs');

    if ( isRXP ) {

      const amx = [  'ACT', 'GDL', 'OCC', 'REN', 'FYJ', 'GAR', 'RUT', 'MIN', 'HMS', 'DAC', 'AGS', 'SIN', 'RPL' ];
      let dataRXP = {};
      let activeGetDate = true;
      let month = null;
      let year = null;
      let keysLevel2 = aFormatData.getNode( await Data.find({  
        type: 'keys', 
        documentType: 'rxc' 
      }).select('values') );

      amx.forEach(company => {

        let keysLevel2Temp = {};

        const schemaForCompany = jsonData.filter( ( value, index ) => {

          return value.find( ( { text } ) => {

            if ( typeof( text ) === 'string' ) {
              
              return text.toLowerCase().includes( `${ company.toLowerCase() }-` );

            } else if( typeof( text ) === 'object' && 
              activeGetDate ) {
              
              month = aFormatData.formatMonth( 
                new Date( `${ text }` ).getMonth() + 1 
              );

              year = new Date( `${ text }` ).getFullYear();

              activeGetDate = false;
              
            }

            return false;

          });

        })
        .map( ( value ) => {
          
          let newValuesTemp = {};

          value.forEach( ( subValue, index ) => {

            if( jsonData?.[0]?.[index]?.['text'] ) {
              let nameNode = jsonData[0][index]['text'].toLowerCase();

              switch ( nameNode ) {
                case 'fecha katalabs':
                    nameNode = 'fecha';
                  break;
                case 'id contrato':
                    nameNode = 'id';
                  break;
                case 'clientes - nombre':
                    nameNode = 'nombre';
                  break;
                case 'total x cobrar katalabs':
                    nameNode = 'cobrar';
                  break;
                case 'total interes katalabs':
                    nameNode = 'interes';
                  break;
                case 'total capital katalabs':
                    nameNode = 'capital';
                  break;
              
                default:
                  break;
              }

              let isNumber = false;

              if ( nameNode === 'nombre' ) {
                keysLevel2Temp = {
                  ...keysLevel2Temp,
                  [subValue.text]: true,
                };
              } else if( nameNode === 'cobrar' || nameNode === 'interes' || nameNode === 'capital' ) {
                isNumber = true;
              }

              newValuesTemp = {
                ...newValuesTemp,
                [nameNode]: isNumber ? parseFloat( `${ subValue.text }`.replaceAll(',', '').replaceAll('$', '') ) : subValue.text,
              }
            }

          });

          return newValuesTemp;
  
        });
        
        dataRXP = {
          ...dataRXP,
          [company]: {
            [month]: 0,
            level2: Object.values( schemaForCompany ),
          },
        }

        keysLevel2 = {
          ...keysLevel2,
          [company]: {
            ...keysLevel2[company],
            ...keysLevel2Temp
          },
        }

      });
      
      const options = { new: true, upsert: true, useFindAndModify: false, strict: false };

      const [ updatedDocument1, updatedDocument2 ] = await Promise.all([
        Data.findOneAndUpdate(
          { year, month, documentType: 'rxc' },
          { $set: { type: 'data', [`values`]: dataRXP } },
          options
        ),
        Data.findOneAndUpdate(
          { type: 'keys', documentType: 'rxc' },
          { $set: { [`values`]: keysLevel2 } },
          options
        )
      ]);
      
      return handleResponse( res, 200, { updatedDocument2, updatedDocument1 } );
    }

    const { data, dataGral } = aFormatData.aFormatData(jsonData);
    const { year, month, company_short, balance } = data;
    
    const [dataGroupsChilds, dataGralList] = await Promise.all([
      Data.find({ year, documentType: 'groupsChilds' }, { [`values.${company_short}`]: 1 }),
      Data.find({ year, documentType: 'gralList' }, { [`values.${company_short}`]: 1 })
    ]);
    
    const groupsChilds = aFormatData.getNode( dataGroupsChilds );
    const gralList = aFormatData.getNode( dataGralList );

    const { groupsChildsTemp, gralListTemp } = processData(groupsChilds, gralList, balance, company_short);
    // return handleResponse( res, 200, { groupsChildsTemp, gralListTemp } );

    const options = { new: true, upsert: true, useFindAndModify: false, strict: false };
    // const [updatedDocument1, updatedDocument2, updatedDocument3] = await Promise.all([
    //   Data.findOneAndUpdate(
    //     { documentType: 'groupsChilds' },
    //     { $set: { [`values.${company_short}`]: groupsChildsTemp } },
    //     options
    //   ),
    //   Data.findOneAndUpdate(
    //     { documentType: 'gralList' },
    //     { $set: { [`values.${company_short}`]: gralListTemp[company_short] } },
    //     options
    //   ),
    //   Data.findOneAndUpdate(
    //     { year, month, documentType: 'dataGralForMonth' },
    //     { $set: { [`values.${year}.${month}.${company_short}`]: dataGral } },
    //     options
    //   )
    // ]);
    Promise.all([
      Data.findOneAndUpdate(
        { documentType: 'groupsChilds' },
        { $set: { [`values.${company_short}`]: groupsChildsTemp } },
        options
      ),
      Data.findOneAndUpdate(
        { documentType: 'gralList' },
        { $set: { [`values.${company_short}`]: gralListTemp[company_short] } },
        options
      ),
      Data.findOneAndUpdate(
        { year, month, documentType: 'dataGralForMonth' },
        { $set: { [`values.${year}.${month}.${company_short}`]: dataGral } },
        options
      )
    ]).catch(error => console.error('Error al actualizar documentos:', error));
  
    // if (!updatedDocument1 || !updatedDocument2 || !updatedDocument3) {
    //   throw new Error('Failed to update one or more documents');
    // }
    
    // const content = { year, month, company_short, message: 'Documento actualizado o creado correctamente', dataGral };
    const content = { year, month, company_short, message: 'Documento actualizado o creado correctamente' };
    return handleResponse( res, 200, content );
   
  } catch (error) {
    console.error('Error al guardar datos en MongoDB:', error);
    return handleError(res, error, 'Error uploading file');
  }
});

async function getDataFromMongo(documentType, projection = {}, months ) {
  if ( documentType === 'dataGralForMonth' ) {
    const { data, currentYear, year } = months;
    
    if( data.length === 0 ) return [];
    
    return await Data.find({ year: `${ year }`, documentType, __v: 0, month: { $in: data } }).select(projection);
  }
  return await Data.find({ year, documentType }).select(projection);
}

async function getNodeMultipleFromMongo(documentType, projection = {}, months = ['Enero']) {
  const data = await getDataFromMongo(documentType, projection, months);

  if ( documentType === 'dataGralForMonth' ) {

    let nodeDataGralForMonth = [];
    data.forEach( element => {
      const fData = Object.values( element ).filter(i => i.values);
      const aF = aFormatData.getNodeMultiple( fData );

      nodeDataGralForMonth = [
        ...nodeDataGralForMonth,
        // aF[yearText]
        aF[`${ months.year }`]
      ]
    });
    
    const md = aFormatData.getMonthsUntilNow();
    let dataGralForMonth = {};

    md.forEach(m => {
      const vI = nodeDataGralForMonth.find(n => n?.[m]);
      if( vI )
        dataGralForMonth = { ...dataGralForMonth, [m]: vI[m]};
    });

    return dataGralForMonth;
  }

  return aFormatData.getNodeMultiple(data[0]); // asumiendo que solo esperas un documento
}

app.post('/api/data', async (req, res) => {
  try {
      // cache.flushAll();
      // const cacheKey = `data_${year}`;
      // const cachedData = cache.get(cacheKey);

      // if (cachedData) {
      //   return res.status(200).json(cachedData);
      // }
      // cache.flushAll();

      let [
        names,
        groupsEnabledMultiplator,
        groupsEnabled,
        groupsChilds,
        groupsSum,
      ] = await Promise.all([
        getNodeMultipleFromMongo('names'),
        getNodeMultipleFromMongo('groupsEnabledMultiplicator'),
        getNodeMultipleFromMongo('groupsEnabled'),
        getNodeMultipleFromMongo('groupsChilds'),
        getNodeMultipleFromMongo('groupsSum'),
      ]);

      return handleResponse( res, 200, {
        names,
        groupsEnabledMultiplator,
        groupsEnabled,
        groupsChilds,
        groupsSum,
      } );
  } catch (error) {
      console.error('Error retrieving data from MongoDB:', error);
      return handleResponse( res, 500, { message: 'Internal server error' } );
  }
});

app.post('/api/datagral', async (req, res) => {
  try {
    const lastYear = yearNumber - 1;
    const { data } = req.body;
    if ( !data ) {
      let [ dataGralList ] = await Promise.all([ getNodeMultipleFromMongo('gralList') ]);
      
      return handleResponse( res, 200, { dataGralForMonth: {}, dataGralList, } );
    }

    const dataLastYear = data.filter( ( { year } ) => ( parseInt( year ) === ( lastYear ) ) ).map( ( { month } ) => ( month ) );
    const dataCurrentYear = data.filter( ( { year } ) => ( parseInt( year ) === yearNumber ) ).map( ( { month } ) => ( month ) );

    let [
      dataGralForMonthCurrentYear,
      dataGralList,
      dataGralForMonthLastYear,
    ] = await Promise.all([
      // getNodeMultipleFromMongo('dataGralForMonth'), *
      getNodeMultipleFromMongo('dataGralForMonth', {}, { 
        data: dataCurrentYear, 
        currentYear: yearNumber,
        year: yearNumber,
      }),
      getNodeMultipleFromMongo('gralList'),
      getNodeMultipleFromMongo('dataGralForMonth', {}, { 
        data: dataLastYear, 
        currentYear: yearNumber,
        year: lastYear,
      }),
    ]);

    return handleResponse( res, 200, {
      dataGralForMonth: { ...dataGralForMonthLastYear, ...dataGralForMonthCurrentYear, },
      dataGralList,
    } );

    // cache.set(cacheKey, dataGralForMonth);

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
      Data.find({ documentType: 'groupsEnabledMultiplicator' }).select('values'),
      Data.find({ documentType: 'groupsSum' }).select('values'),
      Data.find({ documentType: 'groupsEnabled' }).select('values'),
      Data.find({ documentType: 'names' }).select('values'),
      Data.find({ documentType: 'companies' }).select('values'),
      Data.find({ documentType: 'gralList' }).select('values'),
      Data.find({ documentType: 'groupsChilds' }).select('values')
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
      { documentType: 'groupsEnabledMultiplicator' },  // Criterio de búsqueda
      { $set: { [`values`]: req.body } },
      options
    );

    if ( updatedDocument ) {
      // cache.del('groupsData');

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
      { documentType: 'names' },  // Criterio de búsqueda
      { $set: { [`values`]: Object.values( req.body ) } },
      options
    );

    if (updatedDocument) {

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

    const dataGroupsEnabled = await Data.find({ documentType: 'groupsEnabled' }).select('values');
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
      { documentType: 'groupsEnabled' },  // Criterio de búsqueda
      { $set: { [`values`]: groups } },
      options
    );

    if ( updatedDocument ) {

      return handleResponse( res, 200, groups);
    } else {
      return handleResponse( res, 404, { message: 'Documento no encontrado' });
    }

  } catch (error) {
    return handleResponse( res, 500, { message: 'Internal server error' });
  }

});

app.post('/api/link', async (req, res) => {

  
  const [ dataGroups, dataGroupsEnabled ] = await Promise.all([
    Data.find({ documentType: 'groups' }).select('values'),
    Data.find({ documentType: 'groupsEnabled' }).select('values')
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
        { documentType: 'groups' },  // Criterio de búsqueda
        { $set: { [`values`]: groups } },
        options
      ),
      Data.findOneAndUpdate(
        { documentType: 'groupsEnabled' },  // Criterio de búsqueda
        { $set: { [`values`]: groupsEnabled } },
        { ...options, strict: false }
      )
    ]);

    if ( updatedDocument1 && updatedDocument2 ) {
      // cache.del('groupsData');

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
      Data.find({ documentType: 'groups' }).select('values'),
      Data.find({ documentType: 'groupsEnabled' }).select('values')
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
        { documentType: 'groups' },  // Criterio de búsqueda
        { $set: { [`values`]: groups } },
        options,
      ),
      Data.findOneAndUpdate(
        { documentType: 'groupsEnabled' },  // Criterio de búsqueda
        { $set: { [`values`]: groupsEnabled } },
        options,
      )
    ]);

    if ( updatedDocument1 && updatedDocument2 ) {


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
      Data.find({ documentType: 'groupsEnabled' }).select('values'),
      Data.find({ documentType: 'names' }).select('values')
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
      { documentType: 'names' },  // Criterio de búsqueda
      { $set: { [`values`]: names } },
      options
    );


    if ( updatedDocument ) {

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
        { documentType: 'groups' },
        { $set: { [`values`]: tempData } },
        options
      ),
      Data.findOneAndUpdate(
        { documentType: 'groupsEnabled' },  // Criterio de búsqueda
        { $set: { [`values`]: req.body.groups } },
        options,
      ),
      Data.findOneAndUpdate(
        { documentType: 'groupsEnabledMultiplicator' },  // Criterio de búsqueda
        { $set: { [`values`]: req.body.multiplicators } },
        { ...options, strict: false }
      )
    ]);

    if ( updatedDocument1 && updatedDocument2 && updatedDocument3 ) {

      return handleResponse( res, 200, { message: 'Documento actualizado o creado correctamente', groups: req.body.groups, multiplicators: req.body.multiplicators } );
    } else {
      return handleResponse( res, 404, { message: 'Documento no encontrado' } );
    }
  } catch (error) {
    console.error('Error al actualizar documento en MongoDB:', error);
    return handleResponse( res, 500, { message: 'Error interno del servidor' } );
  }
});

app.put('/api/modify/childs', async (req, res) => {
  
  try {

    // const dataGroupsChilds = await Data.find({ documentType: 'groupsChilds' }).select('values');
    // const groupsChilds = aFormatData.getNode( dataGroupsChilds );
    const { company, account, childs, } = req.body;
    // let { groupsChilds } = req.body;
    let formatChilds = {};
    
    childs.forEach( ( { cuenta, nombre } ) => {
      formatChilds = {
        ...formatChilds,
        [ cuenta ]: { cuenta, nombre },
      };
    } );

    // return handleResponse( res, 200, formatChilds );

    const options = {
      new: true,
      upsert: true,
      useFindAndModify: false,
      strict: false
    };

    // Utiliza findOneAndUpdate para actualizar el documento
    const updatedDocument = await Data.findOneAndUpdate(
      { documentType: 'groupsChilds' },  // Criterio de búsqueda
      { $set: { [`values.${ company }.${ account }`]: formatChilds } },
      options
    );

  // { $set: { [`values.${nodeToUpdate}.name`]: 'Dynamic Update' } },

    if ( updatedDocument ) return handleResponse( res, 200, { message: 'Documento actualizado o creado correctamente', data: formatChilds, } );//data: aFormatData.getNodeMultiple( updatedDocument ), } )
    else return handleResponse( res, 404, { message: 'Documento no encontrado' } );

    // return handleResponse( res, 200, { 
    //   company, account, childs, 
    //   groupsChilds: { ...groupsChilds, [ company ]: { 
    //     ...groupsChilds[ company ],
    //     [ account ]: childs } 
    //   }, 
    // } );
    
    // if( !groupsChilds[company] )
    //     groupsChilds[company] = {};
    // if( !groupsChilds[company][account] )
    //     groupsChilds[company][account] = {};

    // let childsTemp = {};
    
    // childs.forEach(( i ) => {

    //   childsTemp[i.cuenta] = i;

    // });
    
    // groupsChilds[company][account] = childsTemp;

    // const options = {
    //   new: true,
    //   upsert: true,
    //   useFindAndModify: false,
    //   strict: false
    // };

    // // Utiliza findOneAndUpdate para actualizar el documento
    // const updatedDocument = await Data.findOneAndUpdate(
    //   { documentType: 'groupsChilds' },  // Criterio de búsqueda
    //   { $set: { [`values`]: groupsChilds } },
    //   options
    // );

    // if ( updatedDocument ) {

    //   return handleResponse( res, 200, { message: 'Documento actualizado o creado correctamente', groupsChilds } );
    // } else {
    //   return handleResponse( res, 404, { message: 'Documento no encontrado' } );
    // }
  } catch (error) {
    console.error('Error al actualizar documento en MongoDB:', error);
    return handleResponse( res, 500, { message: 'Error interno del servidor' } );
  }
});

app.put('/api/childs', async (req, res) => {
  
  try {

    const dataGroupsChilds = await Data.find({ documentType: 'groupsChilds' }).select('values');
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
      { documentType: 'groupsChilds' },  // Criterio de búsqueda
      { $set: { [`values`]: groupsChilds } },
      options
    );

    return handleResponse( res, 200, { message: 'Documento actualizado o creado correctamente', groupsChilds } );
    // if ( updatedDocument ) {

    // } else {
    //   return handleResponse( res, 404, { message: 'Documento no encontrado' } );
    // }
  } catch (error) {
    console.error('Error al actualizar documento en MongoDB:', error);
    return handleResponse( res, 500, { message: 'Error interno del servidor' } );
  }
});

app.post('/api/sum', async (req, res) => {

  try {

    const dataGroupsSum = await Data.find({ documentType: 'groupsSum' }).select('values');
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
      { documentType: 'groupsSum' },  // Criterio de búsqueda
      { $set: { [`values`]: sum } },
      options
    );

    if ( updatedDocument ) {

      return handleResponse( res, 200, { message: 'Documento actualizado o creado correctamente', sum } );
    } else {
      return handleResponse( res, 404, { message: 'Documento no encontrado' } );
    }

  } catch (error) {
    return handleResponse( res, 500, { message: 'Internal server error' } );
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

app.post('/qb/visor/flow', async (req, res) => {

  // try {

  // const tableId = 'buewschwu';
  // const reportId = '31';
  const tableId = req.body.amex ? 'buewschwu' : 'budpwjz2v';
  const reportId = req.body.amex ? '31' : '25';
  const indicators = {
      tableId,
      reportId,
    }

    const { 
      dataDepurate, 
      months, 
      keys, 
      data, 
      metadata, 
      fields, 
      fieldSort,
      fieldMonth,
      fieldValue,
      fieldCompany,
      allCompanies,
    } = await getDataVisor( indicators );
    
    return res.status(200).send({ 
      message: 'VISOR success response', 
      data: dataDepurate, 
      months, 
      keys,
      dataInit: data, 
      metadata, 
      fields, 
      fieldSort,
      fieldMonth,
      fieldValue,
      fieldCompany,
      allCompanies,
      visor: true,
    });

  // } catch ( error ) {
  //   return res.status(400).json({ message: 'ERROR', error });
  // }

});

app.post('/qb/visor/financial', async (req, res) => {

  // try {

    const tableId = req.body.amex ? 'buewschwu' : 'budpwjz2v';
    const reportId = req.body.amex ? '56' : '21';
    const indicators = {
      tableId,
      reportId,
      // tableId: 'budpwjz2v', 
      // reportId: '21',
      // fieldSort: '4', 
      // fieldMonth: '2', 
      // fieldValue: '5',
    }

    const { dataDepurate, months, keys } = await getDataVisor( indicators );
    // return handleResponse(res, 200, { dataDepurate });
    return res.status(200).send({ message: 'VISOR success response', data: dataDepurate, months, keys, visor: true });

  // } catch ( error ) {
  //   return res.status(400).json({ message: 'ERROR', error });
  // }

});

app.post('/qb/visor/breakdown', async (req, res) => {

  // try {
    const { rKey } = req.body;

    const body = {
      "from": "budpwjz2v",
      "where": `{'15'.EX.'${ rKey }'}`,
    };
    
    const { data } = await axios.post('https://api.quickbase.com/v1/records/query', body, {
      headers: HEADERS_QB,
    });
    
    return res.status(200).send({ message: 'VISOR success response', data });

  // } catch ( error ) {
  //   return res.status(400).json({ message: 'ERROR', error });
  // }

});

app.post('/qb/visor/:type/xc', async ( req, res ) => {
  const type = req.params.type;
  const months = [ 'Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre' ];
  const [
    responseCurrentYear,
    responseLastYear,
    // keys, 
  ] = await Promise.all([
    await Data.find(
      { 
        year: yearNumber, 
        month: { $in: months }, 
        type: 'data', 
        documentType: 'rxc' 
      }
    ).select('values month'),
    await Data.find(
      { 
        year: yearNumber - 1, 
        month: { $in: months }, 
        type: 'data', 
        documentType: 'rxc' 
      }
    ).select('values month'),
    // await Data.find(
    //   { 
    //     year: 2024,//yearNumber, 
    //     type: 'keys', 
    //     documentType: 'rxc' 
    //   }
    // ).select('values month')
  ]);

  let dataForMonth = {};
  let level2 = {};
  let keysLevel2Temp = {};

  const amx = [  'ACT', 'GDL', 'OCC', 'REN', 'FYJ', 'GAR', 'RUT', 'MIN', 'HMS', 'DAC', 'AGS', 'SIN', 'RPL' ];
  let lastMonthWithData = null;
  
  // return handleResponse( res, 200, response );

  amx.forEach(company => {

    months.forEach( ( month, index ) => {

      if ( responseLastYear.length === index ) {
        lastMonthWithData = month;
      }

      responseLastYear.forEach( element => {

        const getInfo = Object.values( element ).find( i => i.month === month );

        if( getInfo ) {

          const finalBalance = getInfo?.['values']?.[company]?.['level2'] ? getInfo.values[company]['level2'].
          map( vLevel2 => {
            const toSum = type === 'r' ? vLevel2['cobrar'] : ( type === 'i' ? vLevel2['interes'] : vLevel2['capital'] );
    
            return {
              ...vLevel2,
              ['saldo-final']: toSum ? toSum : 0,
            }
          } ) ://.filter( a => a['id'].includes('ACT')) :
          [];
    
          dataForMonth = {
            ...dataForMonth,
            [company]: {
              ...dataForMonth[company],
              [month]: {
                value: finalBalance.
                reduce( 
                  ( acc, currentValue ) => {
          
                    const cV = currentValue['saldo-final'];
                    // const cVFormat = `${ cV }`.replaceAll(',', '');
                    // return acc + parseFloat( cVFormat );
                    return acc + cV;
                    
                  }, 0), //getInfo.values[company][getInfo.month],
              }
            },
          };
    
          level2 = {
            ...level2,
            [company]: {
              ...level2[company],
              [month]: finalBalance,//getInfo.values[company]['level2'],
            },
          };

        } else if( !dataForMonth?.[company]?.[month] ) {
          
          dataForMonth = {
            ...dataForMonth,
            [company]: {
              ...dataForMonth[company],
              [month]: 0,
            }
          }
    
          level2 = {
            ...level2,
            [company]: {
              ...level2[company],
              [month]: [],
            },
          }
        }

      });

    });

  });
  
  const monthsCurrent = new Date().getMonth();
  amx.forEach(company => {

    months.forEach( ( month, index ) => {

      if( index <= monthsCurrent ) {
        dataForMonth = {
          ...dataForMonth,
          [company]: {
            ...dataForMonth[company],
            [month]: 0,
          }
        }

        if ( responseCurrentYear.length === index ) {
          lastMonthWithData = month;
        }

        responseCurrentYear.forEach( element => {

          const getInfo = Object.values( element ).find( i => i.month === month );

          if( getInfo ) {

            const finalBalance = getInfo?.['values']?.[company]?.['level2'] ? getInfo.values[company]['level2'].
            map( vLevel2 => {
              const toSum = type === 'r' ? vLevel2['cobrar'] : ( type === 'i' ? vLevel2['interes'] : vLevel2['capital'] );
      
              return {
                ...vLevel2,
                ['saldo-final']: toSum ? toSum : 0,
              }
            } ) ://.filter( a => a['id'].includes('ACT')) :
            [];
      
            dataForMonth = {
              ...dataForMonth,
              [company]: {
                ...dataForMonth[company],
                [month]: finalBalance.
                reduce( 
                  ( acc, currentValue ) => {
          
                    const cV = currentValue['saldo-final'];
                    // const cVFormat = `${ cV }`.replaceAll(',', '');
                    // return acc + parseFloat( cVFormat );
                    return acc + cV;
                    
                  }, 0), //getInfo.values[company][getInfo.month],
              },
            };
      
            level2 = {
              ...level2,
              [company]: {
                ...level2[company],
                [month]: finalBalance,//getInfo.values[company]['level2'],
              },
            };

          } else if( !dataForMonth?.[company]?.[month] ) {
            
            dataForMonth = {
              ...dataForMonth,
              [company]: {
                ...dataForMonth[company],
                [month]: 0,
              }
            }
      
            level2 = {
              ...level2,
              [company]: {
                ...level2[company],
                [month]: [],
              },
            }
          }

        });
      }

    });

  });

  let addMonth = true;
  amx.forEach( company => {
    keysLevel2Temp = {
      ...keysLevel2Temp,
      [company]: {}
    };

    months
    // .filter( month => {
    //   if( month === lastMonthWithData ) addMonth = false;
    //   return addMonth;
    // } )
    .forEach( ( month, index ) => {
      if ( index === 0 ) {
        let level2Temp = [];

        if( level2[company]?.[lastMonthWithData] ) {
          level2[company][lastMonthWithData]
          .forEach( l2T => {
            if ( !level2Temp.find( v2 => v2.nombre === l2T.nombre ) ) {
              const sumT = level2[company][lastMonthWithData]
              .filter( a => a.nombre === l2T.nombre )
              .reduce( (acc, current) => ( acc + current['saldo-final'] ), 2 );
  
              level2Temp = [
                ...level2Temp,
                {
                  ...l2T,
                  ['saldo-final']: sumT,
                }
              ];
            }
          } );
        }

        level2Temp
        .sort( (a, b) => parseFloat( b['saldo-final'] ) - parseFloat( a['saldo-final'] ) )
        .forEach( kT => {
          keysLevel2Temp = {
            ...keysLevel2Temp,
            [company]: {
              ...keysLevel2Temp[company],
              [kT.nombre]: true,
            }
          };
        });
        
      }

      if (level2[company]?.[month]) {
        level2[company][month]
        // .sort( (a, b) => parseFloat( b['saldo-final'] ) - parseFloat( a['saldo-final'] ) )
        .forEach( kT => {
          
          if ( !keysLevel2Temp?.[company]?.[kT.nombre] ) {  
            keysLevel2Temp = {
              ...keysLevel2Temp,
              [company]: {
                ...keysLevel2Temp[company],
                [kT.nombre]: true,
              }
            };
          }
  
        });
      }

    } );
  } );

  return handleResponse( res, 200, { 
    lastMonthWithData,
    // response,
    data: dataForMonth, 
    keys: amx, 
    months: aFormatData.getMonthsUntilNow(),//[ 'Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto' ], 
    level2, 
    keysLevel2: keysLevel2Temp,
    // keysLevel2: aFormatData.getNode( keys ),
  } );
  // return handleResponse( res, 200, { data: dataForMonth, keys, months: ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto',] } );

});

app.post('/api/visor/:type', async ( req, res ) => {
  const allCompanies = [ 'MVS', 'VFJ', 'COR', 'PAT', 'DNO', 'MOV', 'DOS', 'VEC', 'ACT', 'GDL', 'OCC', 'REN', 'FYJ', 'GAR', 'RUT', 'MIN', 'HMS', 'DAC', 'AGS', 'SIN', 'RPL' ];
  const type = req.params.type;
  const months = [ 'Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre' ];

  const date = new Date();
  const currentYear = date.getFullYear();
  const lastYear = currentYear - 1;
  const currentMonth = date.getMonth();
  let monthsCurrentYear = months.filter( ( month, index ) => ( index <= currentMonth ) );
  let monthsLastYear = months.filter( ( month, index ) => ( index > currentMonth ) );

  const [
    responseCurrentYear,
    responseLastYear,
    keys
  ] = await Promise.all([
    await Data.find(
      { 
        year: currentYear, 
        month: { $in: monthsCurrentYear }, 
        type: 'data', 
        documentType: type, 
      }
    ).select('values month'),
    await Data.find(
      { 
        year: lastYear, 
        month: { $in: monthsLastYear }, 
        type: 'data', 
        documentType: type, 
      }
    ).select('values month'),
    await Data.find(
      { 
        // year: yearNumber, 
        type: 'keys', 
        documentType: type, 
      }
    ).select('values month')
  ]);

  const response = [ ...responseCurrentYear, ...responseLastYear ];
  let dataForMonth = {};
  let level2 = {};
  // return handleResponse(res, 200, {response})
  allCompanies.forEach(company => {

    months.forEach( month => {

      const year = monthsCurrentYear.includes( month ) ? currentYear : lastYear;

      response.forEach( element => {
        const getInfo = Object.values( element ).find( i => i.month === month );
  
        if( getInfo ) {

          const finalBalance = getInfo?.['values']?.[company]?.['level2'] ? getInfo.values[company]['level2'].
          map( vLevel2 => {
            const toSum = vLevel2['valor'];
    
            return {
              ...vLevel2,
              ['saldo-final']: toSum ? toSum : 0,
            }
          } ) ://.filter( a => a['id'].includes('ACT')) :
          [];
    
          dataForMonth = {
            ...dataForMonth,
            [company]: {
              ...dataForMonth[company],
              [month]: {
                value: finalBalance.
                reduce( 
                  ( acc, currentValue ) => {
          
                    const cV = currentValue['saldo-final'];
                    return acc + cV;
                    
                  }, 0),
                year, 
              }
            },
          };
    
          level2 = {
            ...level2,
            [company]: {
              ...level2[company],
              [month]: finalBalance,
            },
          };

        } else if( !dataForMonth?.[company]?.[month] ) {
          dataForMonth = {
            ...dataForMonth,
            [company]: {
              ...dataForMonth[company],
              [month]: { value: 0, year, },
            }
          }
    
          level2 = {
            ...level2,
            [company]: {
              ...level2[company],
              [month]: [],
            },
          }
        }

      });

    });

  });

  return handleResponse( res, 200, { 
    data: dataForMonth, 
    keys: allCompanies, 
    months: aFormatData.getMonthsUntilNow(),
    level2, 
    keysLevel2: aFormatData.getNode( keys ),
  } );

});

app.post('/api/datamanual', async (req, res) => {

  // try {

    const data = await Data.find({ documentType: 'dataManual' }).select('values');
    const newData = aFormatData.getNode( data );

    return handleResponse( res, 200, { message: 'Documento actualizado o creado correctamente', data: newData } );

  // } catch (error) {
  //   return handleResponse( res, 500, { message: 'Internal server error' } );
  // }

});

app.post('/api/add/datamanual', async (req, res) => {

  // try {

    const data = await Data.find({ documentType: 'dataManual' }).select('values');
    let newData = aFormatData.getNode( data );
      
    Object.entries( req.body ).forEach( v0 => {
      
      // if( !newData?.[v0[0]] )
      //   newData = { ...newData, [v0[0]]: { } };

      Object.entries( v0[1] ).forEach( v1 => {

        // if( !newData?.[v0[0]]?.[v1[0]] )
        //   newData = { ...newData, [v0[0]]: { [v1[0]]: { } } };

        Object.entries( v1[1] ).forEach( v2 => {

            if ( newData?.[v0[0]] ) {

              if ( newData?.[v0[0]]?.[v1[0]] ) {

                if ( newData?.[v0[0]]?.[v1[0]]?.[v2[0]] ) {
                  
                  let isToUpdated = false;
                  let newValue = newData?.[v0[0]]?.[v1[0]]?.[v2[0]].map(( v ) => {
                    if( v.description === v2[1]['description'] ) {
                      isToUpdated = true;
                      return v2[1];
                    }
                    return v;
                  });
                  
                  if ( !isToUpdated ) {
                    newValue = [
                      ...newData?.[v0[0]]?.[v1[0]]?.[v2[0]],
                      v2[1]
                    ];
                  }

                  newData = {
                    ...newData,
                    [v0[0]]: {
                      ...newData?.[v0[0]],
                      [v1[0]]: {
                        ...newData?.[v0[0]]?.[v1[0]],
                        [v2[0]]: newValue
                      }
                    }
                  };

                } else {
                  newData = {
                    ...newData,
                    [v0[0]]: {
                      ...newData?.[v0[0]],
                      [v1[0]]: {
                        ...newData?.[v0[0]]?.[v1[0]],
                        [v2[0]]: [
                          v2[1]
                        ]
                      }
                    }
                  };
                }
                
              } else {
                newData = {
                  ...newData,
                  [v0[0]]: {
                    ...newData?.[v0[0]],
                    [v1[0]]: {
                      [v2[0]]: [
                        v2[1]
                      ]
                    }
                  }
                };
              }
              
            } else {
              newData = {
                ...newData,
                [v0[0]]: {
                  [v1[0]]: {
                    [v2[0]]: [
                      v2[1]
                    ]
                  }
                }
              };
            }

        } );

      } );

    } );

    const options = {
      new: true,
      upsert: true,
      useFindAndModify: false,
      strict: false,
    };

    // Utiliza findOneAndUpdate para actualizar el documento
    const updatedDocument = await Data.findOneAndUpdate(
      { documentType: 'dataManual' },  // Criterio de búsqueda
      { $set: { [`values`]: newData } },
      options
    );

    if ( updatedDocument ) {

      return handleResponse( res, 200, { message: 'Documento actualizado o creado correctamente', data: newData } );
    } else {
      return handleResponse( res, 404, { message: 'Documento no encontrado' } );
    }

  // } catch (error) {
  //   return handleResponse( res, 500, { message: 'Internal server error' } );
  // }

});

app.post('/api/delete/datamanual', async (req, res) => {

  // try {

    const data = await Data.find({ documentType: 'dataManual' }).select('values');
    const { nameAgroup, company, account, index } = req.body;
    let newData = aFormatData.getNode( data );

    newData = {
      ...newData,
      [nameAgroup]: {
        ...newData[nameAgroup],
        [company]: {
          ...newData[nameAgroup][company],
          [account]: newData[nameAgroup][company][account].filter( (v, indexV) => ( indexV != index ) ),
        }
      }
    }

    const options = {
      new: true,
      upsert: true,
      useFindAndModify: false,
      strict: false,
    };

    // Utiliza findOneAndUpdate para actualizar el documento
    const updatedDocument = await Data.findOneAndUpdate(
      { documentType: 'dataManual' },  // Criterio de búsqueda
      { $set: { [`values`]: newData } },
      options
    );

    if ( updatedDocument ) {

      return handleResponse( res, 200, { message: 'Documento actualizado o creado correctamente', data: newData } );
    } else {
      return handleResponse( res, 404, { message: 'Documento no encontrado' } );
    }

  // } catch (error) {
  //   return handleResponse( res, 500, { message: 'Internal server error' } );
  // }

});

app.get('/api/list-files/:company', async (req, res) => {
  const bucketName = process.env.AWS_BUCKET; // Cambia por el nombre de tu bucket
  // const folderPath = req.query.folderPath || 'HMS/'; // Obtener el prefijo de la carpeta desde el query params
  const folderPath = `${ req.params.company }/`; // Obtener el prefijo de la carpeta desde el query params

  try {
    const data = await listObjectsInFolder(bucketName, folderPath);
    res.json(data);
  } catch (error) {
    res.status(500).send('Error al listar archivos');
  }
});

app.get('/api/download', async (req, res) => {
  const bucketName = process.env.AWS_BUCKET; // Cambia por el nombre de tu bucket
    const fileKey = req.query.fileKey; // El fileKey que incluye la ruta, por ejemplo: "HMS/BALANZA HMS SEP 2024.xlsx"
    
    // try {
      const params = {
        Bucket: bucketName,
        Key: decodeURIComponent(fileKey), // Asegúrate de decodificar correctamente el fileKey
      };
  
      // Obtener el archivo de S3
      const command = new GetObjectCommand(params);
      const data = await s3Client.send(command);
  
      if (data && data.Body) {
        // Desactivar la caché para evitar el estado 304
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');
  
        // Configurar los encabezados HTTP
        const fileName = fileKey.split('/').pop(); // Extraer el nombre del archivo
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
  
        // Transmitir el archivo al cliente
        data.Body.pipe(res);
      } else {
        res.status(404).send('Archivo no encontrado en S3');
      }
    // } catch (error) {
    //   console.error('Error al descargar archivo:', error);
    //   res.status(500).send('Error al descargar el archivo');
    // }
  });

app.use( '/db', mngRouter );

app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});