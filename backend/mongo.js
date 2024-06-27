
const { MongoClient, ServerApiVersion } = require('mongodb');
const uri = "mongodb+srv://fmg:zhMDGlg5KYL0SVqe@cluster0.2qtf72w.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0";

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    await client.connect();
    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log("Pinged your deployment. You successfully connected to MongoDB!");
  } finally {
    // Ensures that the client will close when you finish/error
    await client.close();
  }
}
run().catch(console.dir);

/*

const db = mongoose.connection;
db.on('error', console.error.bind(console, 'connection error:'));
db.once('open', () => {
  console.log('Connected to MongoDB');
});

// Esquema y modelo de datos
const dataSchema = new mongoose.Schema({}, { strict: false });
const Data = mongoose.model('Data', dataSchema);

// Ruta para subir los datos
app.post('/api/upload', async (req, res) => {
  try {
    const data = new Data(req.body);
    await data.save();
    res.status(201).send('Data saved successfully');
  } catch (error) {
    console.error('Error saving data:', error);
    res.status(500).send('Error saving data');
  }
});

// Ruta para consultar los datos
app.get('/api/data', async (req, res) => {
  try {
    const data = await Data.find();
    res.status(200).json(data);
  } catch (error) {
    console.error('Error fetching data:', error);
    res.status(500).send('Error fetching data');
  }
});
*/