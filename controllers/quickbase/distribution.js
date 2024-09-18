const axios = require('axios');

const QB_TOKEN = process.env.QB_TOKEN;
const HEADERS_QB = {
    'Content-Type': 'application/json',
    'QB-Realm-Hostname': 'jesuscortez.quickbase.com',
    'Authorization': `QB-USER-TOKEN ${ QB_TOKEN }`,
}

const monthsVisor = ( month ) => {
    const m = month.split(' ')[0].toLowerCase();

    switch ( m ) {
        case 'jan':
            return 'Enero';
        case 'feb':
            return 'Febrero';
        case 'mar':
            return 'Marzo';
        case 'apr':
            return 'Abril';
        case 'may':
            return 'Mayo';
        case 'jun':
            return 'Junio';
        case 'jul':
            return 'Julio';
        case 'aug':
            return 'Agosto';
        case 'sep':
            return 'Septiembre';
        case 'oct':
            return 'Octubre';
        case 'nov':
            return 'Noviembre';
        case 'dec':
            return 'Diciembre';
        default:
            break;
    }
};

const getDataVisor = async ( { 
    tableId, 
    reportId, 
    // fieldSort, 
    // fieldMonth, 
    // fieldValue, 
} ) => {

    const body = {
        tableId
    }

    const dataReport = await axios.post(`https://api.quickbase.com/v1/reports/${ reportId }/run`, {}, {
        headers: HEADERS_QB,
        params: {
            ...body
        },
    });

    const { fields, metadata, data } = dataReport.data;

    const fieldSort = fields.find( v => v.label.toLowerCase().includes('concepto flujo') ).id;
    const fieldMonth = fields.find( v => v.label.toLowerCase().includes('fecha') ).id;
    const fieldValue = fields.find( v => v.type.toLowerCase().includes('numeric') ).id;
    const fieldCompany = fields.find( v => v.label.toLowerCase().includes('empresa') ).id;
    const allCompanies = [  'MVS', 'VFJ', 'COR', 'PAT', 'DNO', 'MOV', 'DOS', 'VEC', 'ACT', 'GDL', 'OCC', 'REN', 'FYJ', 'GAR', 'RUT', 'MIN', 'HMS', 'DAC', 'AGS', 'SIN', 'RPL' ];
    let months = [];

    const dateCurrent = new Date();
    const currentYear = dateCurrent.getFullYear();
    const currentMonth = dateCurrent.getMonth();

    for (let index = 0; index <= currentMonth; index++) {
        const date = new Date(currentYear, index);
        const monthDate = date.toLocaleString('default', { month: 'long' });
        const monthFormat = monthDate.substring(0, 3).toUpperCase();
        months = [
        ...months,
        `${ monthFormat } ${ currentYear }`
        ];
    }

    let dataKeysTemp = {};

    data.forEach(d => {

        const newValue = d[fieldSort]['value'];
        
        dataKeysTemp = {
        // [`${ newValue.replace(/[+-]/g, '').trim() }`]: newValue,
        [newValue]: {
            tempValue: `${ newValue.replace(/[+-]/g, '').trim() }`,
            newValue,
        },
        ...dataKeysTemp,
        }

    });

    
    let keys = Object.entries( dataKeysTemp ).
        sort( ( a, b ) => a[1]['tempValue'].localeCompare(b[1]['tempValue']) ).
        map( v => v[1]['newValue'] );

    keys = [
        ...keys.filter( f => f.includes('+ ') ),
        ...keys.filter( f => f.includes('- ') )
    ];

    let dataDepurate = {};

    keys.forEach(key => {
        
        months.forEach(month => {

            allCompanies.forEach(company => {

                const asignValue = data.filter( value => ( 
                    value[fieldMonth]['value'] ===  month &&
                    value[fieldSort]['value'] ===  key &&
                    value[fieldCompany]['value'] ===  company
                )).map( value => (
                    value[fieldValue]['value']
                ))[0];
        
                const monthFormat = monthsVisor(month);
        
                // if ( asignValue ) {
                    
                    dataDepurate = {
                        ...dataDepurate,
                        [key]: {
                            ...dataDepurate[key],
                            [company]: {
                                ...dataDepurate[key]?.[company],
                                [monthFormat]: asignValue,
                            }
                            // company: [ ...company, asignValue.vCompany ],
                        }
                    };
        
                // }

            });

        });
        
    });

    return {
        dataDepurate, 
        // months,
        // months: [ 'Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio', 'Agosto' ], 
        keys,
        data,
        metadata,
        fields,
        fieldSort,
        fieldMonth,
        fieldValue,
        fieldCompany,
        allCompanies,
    };

};

module.exports = {
    getDataVisor,
};