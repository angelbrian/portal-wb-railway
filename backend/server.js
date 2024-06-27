const express = require('express');
const bodyParser = require('body-parser');
const mongoose = require('mongoose');
const { Schema } = mongoose;

const aFormatData = require('../controllers/dataFormat');
const fs = require('fs');

const app = express();
const port = 3000;

app.use(bodyParser.json({ limit: `50mb` }));
app.use(bodyParser.urlencoded({ limit: `50mb`, extended: true, parameterLimit: 1000000 }));
app.use(function(req, res, next) {
  res.header("Access-Control-Allow-Origin", "*");
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, PATCH, DELETE');
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
  next();
});

const mongoUri = 'mongodb+srv://fmg:zhMDGlg5KYL0SVqe@cluster0.2qtf72w.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0';
mongoose.connect(mongoUri);

const db = mongoose.connection;
db.on('error', console.error.bind(console, 'connection error:'));
db.once('open', () => {
  console.log('Connected to MongoDB');
});

// Esquema y modelo de datos
// const dataSchema = new mongoose.Schema({}, { strict: false });
// const Data = mongoose.model('Data', dataSchema);

// Definir el esquema
const dataSchema = new Schema({
  data: Schema.Types.Mixed // Usar un tipo de datos mixto para manejar estructuras dinámicas
});

// Crear el modelo basado en el esquema
const Data = mongoose.model('Data', dataSchema);

app.post('/api/upload', async (req, res) => {
  try {
    // Transforma y guarda los datos en MongoDB
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

const agroup = (  ) => {
  for (let i = 0; i < months.length; i++) {
    const dataInfo = require(months[i]);
    const balance = dataInfo.balance;
    const date = dataInfo.date;
    const company_short = dataInfo.company_short;

    for (let index = 0; index < groups[company_short].length; index++) {
      const element = groups[company_short][index].data;
      const name = groups[company_short][index].name;
      let nObj = {
        company_short,
        name,
        date,
        groups: groups[company_short],
        months: ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo'],
      };
      const balanceData = balance.filter(( i ) => {
        
      for (let x = 0; x < element.length; x++) {
          
          const v = element[x];
        if (v === i.cuenta) {
          return true;
        }

      }

      return false;

      });
      
      data.push({
      ...nObj,
      data: balanceData
    });

    }
  }
}

app.post('/api/data', async (req, res) => {
  
  try {
    const months = require(`../public/months-enabled.json`);
    const groups = require('../public/groups.json');
    const son = require('../public/groups-son.json');
    const companies = require('../public/companies.json');
    // Fetch all documents from the 'Data' collection
    const allData = await Data.find({}); // Modify this query to fit specific filtering needs, if necessary
    const forAnioData = allData[0]['data']['2024'];
    // const months = allData[0]['data']['2024'];

    // for (let i = 0; i < months.length; i++) {

    //   const dataInfo = require(months[i]);
    //   const balance = dataInfo.balance;
    //   const date = dataInfo.date;
    //   const company_short = dataInfo.company_short;
  
    //  for (let index = 0; index < groups[company_short].length; index++) {
    //    const element = groups[company_short][index].data;
    //    const name = groups[company_short][index].name;
    //    let nObj = {
    //       company_short,
    //       name,
    //       date,
    //       groups: groups[company_short],
    //       months: ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo'],
    //    };
    //    const balanceData = balance.filter(( i ) => {
         
    //     for (let x = 0; x < element.length; x++) {
           
    //        const v = element[x];
    //       if (v === i.cuenta) {
    //         return true;
    //       }
  
    //     }
  
    //     return false;
  
    //    });
       
    //    data.push({
    //     ...nObj,
    //     data: balanceData
    //   });
  
    //  }
    // }

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

const history = () => {
  const months = require(`../public/months.json`);
  const groups = require('../public/groups.json');
  let data = [];
  
  for (let i = 0; i < months.length; i++) {

    const dataInfo = require(months[i]);
    const balance = dataInfo.balance;
    const date = dataInfo.date;
    const company_short = dataInfo.company_short;

   for (let index = 0; index < groups[company_short].length; index++) {
     const element = groups[company_short][index].data;
     const name = groups[company_short][index].name;
     let nObj = {
        company_short,
        name,
        date,
        groups: groups[company_short],
        months: ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo'],
     };
     const balanceData = balance.filter(( i ) => {
       
      for (let x = 0; x < element.length; x++) {
         
         const v = element[x];
        if (v === i.cuenta) {
          return true;
        }

      }

      return false;

     });
     
     data.push({
      ...nObj,
      data: balanceData
    });

   }
  }
  res.status(200).send(data);
}

app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});