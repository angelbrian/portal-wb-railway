const mongoose = require('mongoose');
const { handleResponseSuccess } = require('../../helpers/multipleResponse');
const { getNodeMultiple } = require('../dataFormat');

const { Schema } = mongoose;
const user = process.env.DB_USER;
const pass = process.env.DB_PASS;
const mongoUri = `mongodb+srv://${ user }:${ pass }@clusterkatalabs.kb27m.mongodb.net/kata?retryWrites=true&w=majority&appName=ClusterKatalabs=true`;

mongoose.connect(mongoUri).then( () => {
    console.log('Conectado a MongoDB localmente sin SSL');
} ).catch( err => {
    console.error('Error al conectar con MongoDB local:', err);
} );

const dataSchema = new Schema( {
    year: Schema.Types.Mixed,
    documentType: Schema.Types.Mixed,
    distributor: Schema.Types.Mixed,
    type: Schema.Types.Mixed,
} );
  
const dataGralForMonth = async ( year, months, select = {} ) => {

    const Data = mongoose.models.Data || mongoose.model('Data', dataSchema);
    const documentType = 'dataGralForMonth';
    
    const values = await Data.find({ 
        __v: 0, 
        year: `${ year }`, 
        documentType, 
        month: { $in: months } 
    }).select( select );

    let nodeDataGralForMonth = [];
    values.forEach( value => {
        const fValue = Object.values( value ).filter( i => i.values );
        const yearData = getNodeMultiple( fValue );

        nodeDataGralForMonth = [
            ...nodeDataGralForMonth,
            yearData[ `${ year }` ],
        ]
    });

    return nodeDataGralForMonth;

const md = aFormatData.getMonthsUntilNow();
let dataGralForMonth = {};

md.forEach(m => {
    const vI = nodeDataGralForMonth.find(n => n?.[m]);
    if( vI )
    dataGralForMonth = { ...dataGralForMonth, [m]: vI[m]};
});

return dataGralForMonth;
};

module.exports = {
    dataGralForMonth,
};