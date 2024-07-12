require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const mongoose = require('mongoose');
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

app.post('/api/upload', async (req, res) => {
  try {
    const data = aFormatData(Object.values(req.body));
    const { year, month, company_short } = data;

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

  const allData = await Data.find({});
  const forAnioData = allData[0]['data']['2024'];
  const names = allData[0]['lines']['names'];
  const companies = allData[0]['lines']['companies'];
  const groupsEnabledMultiplator = allData[0]['lines']['groupsEnabledMultiplicator'];
  const groupsEnabled = allData[0]['lines']['groupsEnabled'];
  const groups = allData[0]['lines']['groups'];

  if (allData.length) {

    tempData = {};
    const msFixed = [ 'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre' ];
    let ms = [];
    
    msFixed.forEach(( m ) => {

      Object.entries( forAnioData).forEach(( fa ) => {

        if( fa[0] === m ) {

          ms.push( m );

        }

      });

    });

    companies.forEach((company) => {

      names.forEach((agroupName) => {
        let childs = groupsEnabled[company][agroupName];

        if (!tempData[company])
          tempData[company] = {};
        if (!tempData[company][agroupName]) {
          tempData[company][agroupName] = {};
        }

        if (childs) {

          childs.forEach((child) => {
            ms.forEach((month) => {
              if( forAnioData[month][company] ) {
                
                const fAT = forAnioData[month][company]['balance'].find((e) => {
                  return e.cuenta === child;
                });
    
                if (fAT/* && month === 'Enero' && (company === 'MVS' || company === 'COR')*/) {
                  let aDataChilds = forAnioData[month][company]['balance'];
    
                  if (!tempData[company][agroupName][child])
                    tempData[company][agroupName][child] = [];
    
                  for (let index = 0; index < aDataChilds.length; index++) {
                    const element = aDataChilds[index];
    
                    if (element.cuenta === child) {
    
                      const aChild = child.split('-');
                      let whatCompare = `${aChild[0]}-`;
                      let isTwo = false;
    
                      if (!child.includes('-000-000')) {
                        whatCompare = `${aChild[0]}-${aChild[1]}-`;
                        isTwo = true;
                      }
                      let tempChildsFinal = [];
                      for (let j = 0; j < aDataChilds.length; j++) {
    
                        const e = aDataChilds[j]['cuenta'].split('-');
    
                        if (e.length === 3) {
                          if (isTwo && `${e[0]}-${e[1]}-` === whatCompare) {
                            const v = JSON.parse(JSON.stringify(aDataChilds[j]));
                            if (!forAnioData[month][company]['balance'][index]['data'].includes(v)) {
                              forAnioData[month][company]['balance'][index]['data'].push(v);
                            }
                            tempChildsFinal = [...tempChildsFinal,
                            {
                              cuenta: aDataChilds[j]['cuenta'],
                              nombre: aDataChilds[j]['nombre'],
                            }
                            ];
                          } else if (`${e[0]}-` === whatCompare) {
                            const existsInChilds = childs.find(c => (c.includes(`${e[0]}-${e[1]}-`)));
                            if (!existsInChilds) {
                              if (!forAnioData[month][company]['balance'][index]['data'].includes(aDataChilds[j])) {
                                forAnioData[month][company]['balance'][index]['data'].push(aDataChilds[j]);
                              }
                            }
                            tempChildsFinal = [...tempChildsFinal,
                            {
                              cuenta: aDataChilds[j]['cuenta'],
                              nombre: aDataChilds[j]['nombre'],
                            }
                            ];
                          }
                        }
                      }
    
                      for (let index = 0; index < tempChildsFinal.length; index++) {
                        const element = tempChildsFinal[index];
                        const fElement = tempData[company][agroupName][child].find(( e ) => ( element.cuenta === e.cuenta ));
                        if( !fElement )
                          tempData[company][agroupName][child].push( element );
                      }
                    }
                  }
                }
  
              }
  
            });
          });
          
        }
      });
    });

    res.status(200).json({
      months: ms,
      groups,
      son: tempData,
      companies,
      data: forAnioData,
      multiplicators: groupsEnabledMultiplator,
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
    const groups = allData[0]['lines']['groupsEnabled'];

    res.status(200).send({
      groups,
      multiplicators,
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

    console.log('Updated document:', updatedDocument);

    if (updatedDocument) {
      return res.status(200).json({ message: 'Documento actualizado o creado correctamente', updatedDocument });
    } else {
      return res.status(404).json({ message: 'Documento no encontrado' });
    }

  } catch (error) {
    res.status(500).json({ message: 'Internal server error' });
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

    console.log('Data to update:', tempData);

    const filter = {}; // Agrega aquí tu condición de filtro si es necesario

    const update = {
      $set: {
        'lines.groups': tempData,
        'lines.groupsEnabled': req.body.groups,
        'lines.groupsEnabledMultiplicator': req.body.multiplacators,
      }
    };

    const options = {
      new: true, // Devuelve el documento actualizado
      upsert: true, // Crea un nuevo documento si no existe
      useFindAndModify: false // Opción para evitar el uso de findAndModify
    };

    // Utiliza findOneAndUpdate para actualizar el documento
    const updatedDocument = await Data.findOneAndUpdate(filter, update, options);

    console.log('Updated document:', updatedDocument);

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

app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});