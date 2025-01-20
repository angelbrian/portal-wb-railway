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

    const dataReportResponse = await axios.post(`https://api.quickbase.com/v1/reports/${ reportId }/run`, {}, {
        headers: HEADERS_QB,
        params: {
            ...body
        },
    });

    const dateCurrent = new Date();
    const currentYear = dateCurrent.getFullYear();
    const lastYear = currentYear - 1;

    const dataReport = {
        data: {
            ...dataReportResponse.data,
            data: dataReportResponse.data.data.filter( v => {
                const yearTemp = v['2']['value'].trim().split(' ');
                
                // return yearTemp[ 1 ] === '2025';
                return parseInt( yearTemp[ 1 ] ) && parseInt( yearTemp[ 1 ] ) >= lastYear;
            }),
        }
    }
// return dataReport;
    // return dataReport.data.data.filter( v => ( v['2']['value'] !== '' && v['2']['value'].includes('2024') ) );
    const { fields, metadata, data } = dataReport.data;


    const fieldSort = fields.find( v => v.label.toLowerCase().includes('concepto flujo') ).id;
    const fieldMonth = fields.find( v => v.label.toLowerCase().includes('fecha') ).id;
    const fieldValue = fields.find( v => v.type.toLowerCase().includes('numeric') ).id;
    const fieldCompany = fields.find( v => v.label.toLowerCase().includes('empresa') ).id;
    const allCompanies = [  'MVS', 'VFJ', 'COR', 'PAT', 'DNO', 'MOV', 'DOS', 'VEC', 'ACT', 'GDL', 'OCC', 'REN', 'FYJ', 'GAR', 'RUT', 'MIN', 'HMS', 'DAC', 'AGS', 'SIN', 'RPL' ];
    let months = [];

    const currentMonth = dateCurrent.getMonth();

    for (let index = 0; index < 12; index++) {
        const date = new Date( currentYear, index );
        const monthDate = date.toLocaleString( 'default', { month: 'long' } );
        const monthFormat = monthDate.substring( 0, 3 ).toUpperCase();
        months = [
        ...months,
        `${ monthFormat } ${ index <= currentMonth ? currentYear : lastYear }`
        ];
    };

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
        ...keys.filter( f => f.includes('+') ),
        ...keys.filter( f => f.includes('-') )
    ];

    // return keys;

    let dataDepurate = {};

    keys.forEach(key => {
        
        months.forEach(month => {

            const yearForMonth = month.split( ' ' )[ 1 ];

            allCompanies.forEach(company => {

                const asignValue = data.filter( value => ( 
                    value[fieldMonth]['value'] ===  month &&
                    value[fieldSort]['value'] ===  key &&
                    value[fieldCompany]['value'] ===  company
                )).map( value => (
                    value[fieldValue]['value']
                ))[0];
        
                const monthFormat = monthsVisor(month);
        
                dataDepurate = {
                    ...dataDepurate,
                    [key]: {
                        ...dataDepurate[key],
                        [company]: {
                            ...dataDepurate[key]?.[company],
                            [monthFormat]: { 
                                value: asignValue,
                                year: yearForMonth,
                            },
                            // [monthFormat]: asignValue,
                        }
                    }
                };

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